<?php
/**
 * NeuroBot — ai.php (v2, hardened)
 * Same-origin proxy to NVIDIA NIM chat completions.
 * Keeps the API key out of page source (server-side only).
 *
 * Endpoints:
 *   GET    /ai.php                 → health check JSON
 *   POST   /ai.php                 → chat completion (JSON body {messages,...})
 *   PATCH  /ai.php                 → persist preferred model ({model:"..."})
 *            (POST /ai.php?action=model also works if PATCH is stripped)
 *
 * Every response is application/json with a "reason" field on errors, so the
 * client can show precise diagnostics. Retries transient upstream failures,
 * falls back to the next allowed model when one is retired (410/404).
 */

header("Content-Type: application/json; charset=utf-8");
header("X-Content-Type-Options: nosniff");
header("Cache-Control: no-store");
header("X-NB-Proxy: v2");

/* ── key: edit here to swap keys, no JS changes needed ── */
$SERVER_KEY = "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";

$UPSTREAM = "https://integrate.api.nvidia.com/v1/chat/completions";
$MODEL_FILE = __DIR__ . "/nb_model.json";
$ALLOWED_MODELS = array(
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",  /* primary */
  "openai/gpt-oss-20b",                             /* fallback if primary is retired */
);

function out($code, $payload) {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}
function err($code, $message, $reason) {
  out($code, array("error" => array("message" => $message, "reason" => $reason)));
}

/* ---------- persisted preferred model (written by PATCH) ---------- */
function loadSavedModel($file, $allowed) {
  $j = @json_decode((string)@file_get_contents($file), true);
  if (is_array($j) && isset($j["model"]) && in_array($j["model"], $allowed, true)) return $j["model"];
  return null;
}
function saveModel($file, $model) {
  $json = json_encode(array("model" => $model, "ts" => time()));
  return @file_put_contents($file, $json, LOCK_EX) !== false;
}
$savedModel = loadSavedModel($MODEL_FILE, $ALLOWED_MODELS);
$primary = $savedModel ? $savedModel : $ALLOWED_MODELS[0];

$method = isset($_SERVER["REQUEST_METHOD"]) ? $_SERVER["REQUEST_METHOD"] : "GET";
$isModelUpdate = ($method === "PATCH") || ($method === "POST" && isset($_GET["action"]) && $_GET["action"] === "model");

/* ---------- GET = health check ---------- */
if ($method === "GET" && !isset($_GET["action"])) {
  out(200, array(
    "ok" => true,
    "service" => "neurobot ai proxy",
    "version" => 2,
    "model" => $primary,
    "model_saved" => $savedModel ? true : false,
    "models" => $ALLOWED_MODELS,
    "key_configured" => $SERVER_KEY !== "",
    "php" => PHP_VERSION,
    "model_file_writable" => is_writable(__DIR__),
    "hint" => "POST JSON {messages:[{role:user,content:'...'}]} to use",
  ));
}

/* ---------- PATCH/POST?action=model = persist preferred model ---------- */
if ($isModelUpdate) {
  /* state change: require same-origin (CSRF guard) */
  $host = isset($_SERVER["HTTP_HOST"]) ? $_SERVER["HTTP_HOST"] : "";
  $origin = isset($_SERVER["HTTP_ORIGIN"]) ? $_SERVER["HTTP_ORIGIN"] : "";
  $ref = isset($_SERVER["HTTP_REFERER"]) ? $_SERVER["HTTP_REFERER"] : "";
  $src = $origin !== "" ? $origin : $ref;
  $srcHost = "";
  if ($src) { $p = parse_url($src); $srcHost = isset($p["host"]) ? $p["host"] : ""; }
  if ($host === "" || $srcHost === "" || strcasecmp($srcHost, $host) !== 0) {
    err(403, "Cross-origin model updates are not allowed.", "cross_origin");
  }
  $in = json_decode((string)file_get_contents("php://input"), true);
  $m = is_array($in) && isset($in["model"]) ? trim((string)$in["model"]) : "";
  if ($m === "" || !in_array($m, $ALLOWED_MODELS, true)) {
    err(400, "Unknown model. Allowed: " . implode(", ", $ALLOWED_MODELS), "unknown_model");
  }
  if (saveModel($MODEL_FILE, $m)) {
    out(200, array("ok" => true, "model" => $m, "saved" => true));
  }
  err(500, "Server storage is read-only — could not save the model. Ask failed anyway; AI still uses the default model.", "readonly_fs");
}

/* ---------- POST = chat completion ---------- */
if ($method !== "POST") {
  err(405, "Method not allowed. Use GET (health), POST (chat) or PATCH (model).", "method_not_allowed");
}

/* client-supplied key override (optional, keeps BYO-key working on PHP hosts) */
$clientKey = isset($_SERVER["HTTP_X_NB_KEY"]) ? trim($_SERVER["HTTP_X_NB_KEY"]) : "";
$key = ($clientKey !== "") ? $clientKey : $SERVER_KEY;
if ($key === "") err(500, "No API key configured in ai.php.", "no_key");

/* ── validate input (tolerate sloppy clients) ── */
$raw = (string)file_get_contents("php://input");
$in = json_decode($raw, true);
if (!is_array($in)) err(400, "Invalid JSON body.", "bad_json");

$messages = isset($in["messages"]) && is_array($in["messages"]) ? $in["messages"] : null;
if (!$messages || !count($messages)) err(400, "messages[] is required.", "no_messages");

$clean = array();
foreach ($messages as $m) {
  if (!is_array($m) || !isset($m["role"], $m["content"])) continue;
  $role = in_array($m["role"], array("system", "user", "assistant"), true) ? $m["role"] : "user";
  $content = (string)$m["content"];
  if (strlen($content) > 24000) {
    $content = function_exists("mb_substr") ? mb_substr($content, 0, 24000) : substr($content, 0, 24000);
  }
  $clean[] = array("role" => $role, "content" => $content);
  if (count($clean) >= 40) break; /* sanity cap */
}
if (!count($clean)) err(400, "messages[] had no valid items.", "no_valid_messages");

/* model: client may pick an allowed one; saved preference is the default */
$model = $primary;
if (isset($in["model"]) && is_string($in["model"]) && $in["model"] !== "") {
  if (!in_array($in["model"], $ALLOWED_MODELS, true)) {
    err(400, "Unknown model '" . $in["model"] . "'. Allowed: " . implode(", ", $ALLOWED_MODELS), "unknown_model");
  }
  $model = $in["model"];
}
$maxTokens = isset($in["max_tokens"]) ? (int)$in["max_tokens"] : 900;
$maxTokens = max(64, min(4096, $maxTokens));
if (isset($in["type"]) && $in["type"] === "test") $maxTokens = min($maxTokens, 64);
$temp = isset($in["temperature"]) ? (float)$in["temperature"] : 0.6;
$temp = max(0.0, min(1.5, $temp));

/* ---------- forward, with retries + model fallback ---------- */
function forward($url, $key, $payload) {
  $ch = curl_init($url);
  curl_setopt_array($ch, array(
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 55,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_HTTPHEADER => array(
      "Content-Type: application/json",
      "Accept: application/json",
      "Authorization: Bearer " . $key,
    ),
  ));
  $body = curl_exec($ch);
  $errno = curl_errno($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return array($body, $errno, $status);
}

$order = array($model);
foreach ($ALLOWED_MODELS as $m) { if (!in_array($m, $order, true)) $order[] = $m; }

$attempts = 0; $lastErrno = 0; $lastStatus = 0; $lastBody = false; $mi = 0;
while (true) {
  $model = $order[$mi];
  $payload = array(
    "model" => $model,
    "messages" => $clean,
    "max_tokens" => $maxTokens,
    "temperature" => $temp,
    "top_p" => 0.95,
    "stream" => false,
  );
  if (strpos($model, "nemotron") !== false) $payload["reasoning_budget"] = 256;

  list($body, $errno, $status) = forward($UPSTREAM, $key, $payload);
  $lastErrno = $errno; $lastStatus = $status; $lastBody = $body;

  if ($errno === 0 && $status === 200 && $body !== false && $body !== "") {
    /* success only if the body is really a chat completion; otherwise treat
       it as a transient upstream glitch and retry with the next model */
    $dec = json_decode($body, true);
    if (is_array($dec) && isset($dec["choices"])) {
      header("Content-Length: " . strlen($body));
      header("X-NB-Upstream-Model: " . $model);
      echo $body;
      exit;
    }
  }

  /* model retired/gone OR garbage response → try the next allowed model */
  if ((($status === 410 || $status === 404) || ($status === 200 && !isset($dec))) && $mi < count($order) - 1) { $mi++; continue; }

  $attempts++;
  $transient = ($errno !== 0) || $status === 429 || $status >= 500;
  if ($transient && $attempts < 3) {
    usleep($status === 429 ? 1200000 : 700000);
    continue;
  }
  break;
}

/* all attempts failed → report the most useful error with a machine reason */
if ($lastErrno) {
  err(502, "Upstream connection failed (cURL " . $lastErrno . "). NVIDIA may be unreachable from this host.", "upstream_network");
}
if ($lastStatus === 429) err(429, "AI rate limit reached — wait a moment and try again.", "rate_limited");
if ($lastStatus === 401 || $lastStatus === 403) err(401, "AI key rejected by NVIDIA (" . $lastStatus . ") — check the key in ai.php.", "key_rejected");

$msg = "Upstream error (HTTP " . $lastStatus . ")";
$reason = "upstream_http";
$decoded = json_decode((string)$lastBody, true);
if (is_array($decoded) && isset($decoded["error"])) {
  if (is_array($decoded["error"]) && isset($decoded["error"]["message"])) $msg = $decoded["error"]["message"];
  elseif (is_string($decoded["error"])) $msg = $decoded["error"];
} elseif (is_string($lastBody) && preg_match("/<html/i", substr($lastBody, 0, 200))) {
  $msg = "Host security-check page intercepted the request — reload the site once, then retry.";
  $reason = "intercepted";
}
if (strpos($msg, "capacity") !== false || $lastStatus === 503) $reason = "capacity";
err($lastStatus >= 400 ? $lastStatus : 502, $msg, $reason);
