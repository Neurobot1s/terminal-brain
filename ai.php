<?php
/**
 * NeuroBot — ai.php
 * Same-origin proxy to NVIDIA NIM chat completions.
 * Keeps the API key out of page source (server-side only).
 * Optional: client may send its own key via the "X-NB-Key" header.
 *
 * Resilience (matches the client behavior in js/ai.js):
 *  - retries transient upstream failures (NVIDIA occasionally 503s on capacity)
 *  - falls back to a secondary model if the primary is retired (410/404)
 *  - GET = health check JSON so you can verify the proxy is alive
 */

header("Content-Type: application/json; charset=utf-8");
header("X-Content-Type-Options: nosniff");
header("Cache-Control: no-store");

/* ── key: edit here to swap keys, no JS changes needed ── */
$SERVER_KEY = "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";

$UPSTREAM = "https://integrate.api.nvidia.com/v1/chat/completions";
$ALLOWED_MODELS = array(
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",  /* primary */
  "openai/gpt-oss-20b",                             /* fallback if primary is retired */
);

function out($code, $payload) {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}

if (!isset($_SERVER["REQUEST_METHOD"]) || $_SERVER["REQUEST_METHOD"] !== "POST") {
  /* GET = health check: open https://your-domain/ai.php in a browser.
     If you see this JSON, PHP + this file are working on your host. */
  out(200, array(
    "ok" => true,
    "service" => "neurobot ai proxy",
    "model" => $ALLOWED_MODELS[0],
    "key_configured" => $SERVER_KEY !== "",
    "hint" => "POST JSON {messages:[{role:user,content:'...'}]} to use",
  ));
}

/* client-supplied key override (optional) */
$clientKey = isset($_SERVER["HTTP_X_NB_KEY"]) ? trim($_SERVER["HTTP_X_NB_KEY"]) : "";
$key = ($clientKey !== "") ? $clientKey : $SERVER_KEY;
if ($key === "") {
  out(500, array("error" => array("message" => "No API key configured in ai.php")));
}

/* ── validate input ── */
$raw = file_get_contents("php://input");
$in = json_decode($raw, true);
if (!is_array($in)) {
  out(400, array("error" => array("message" => "Invalid JSON body")));
}
$messages = isset($in["messages"]) && is_array($in["messages"]) ? $in["messages"] : null;
if (!$messages || !count($messages)) {
  out(400, array("error" => array("message" => "messages[] is required")));
}
$clean = array();
foreach ($messages as $m) {
  if (!is_array($m) || !isset($m["role"], $m["content"])) continue;
  $role = in_array($m["role"], array("system", "user", "assistant"), true) ? $m["role"] : "user";
  $content = (string)$m["content"];
  if (strlen($content) > 24000) {
    $content = function_exists("mb_substr") ? mb_substr($content, 0, 24000) : substr($content, 0, 24000);
  }
  $clean[] = array("role" => $role, "content" => $content);
}
if (!count($clean)) {
  out(400, array("error" => array("message" => "messages[] had no valid items")));
}

$model = isset($in["model"]) && in_array($in["model"], $ALLOWED_MODELS, true) ? $in["model"] : $ALLOWED_MODELS[0];
$maxTokens = isset($in["max_tokens"]) ? (int)$in["max_tokens"] : 900;
$maxTokens = max(64, min(4096, $maxTokens));
$temp = isset($in["temperature"]) ? (float)$in["temperature"] : 0.6;
$temp = max(0.0, min(1.5, $temp));

/* ── forward, with retries + model fallback ── */
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

$attempts = 0;
$lastErrno = 0;
$lastStatus = 0;
$lastBody = false;
$triedModels = array($model);
while (true) {
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
    /* success — pass upstream response through untouched */
    header("Content-Length: " . strlen($body));
    echo $body;
    exit;
  }

  /* model retired → switch to the next allowed model and keep going */
  if (($status === 410 || $status === 404) && count($triedModels) < count($ALLOWED_MODELS)) {
    foreach ($ALLOWED_MODELS as $m) {
      if (!in_array($m, $triedModels, true)) { $triedModels[] = $m; $model = $m; break; }
    }
    continue;
  }

  $attempts++;
  $transient = ($errno !== 0) || $status === 429 || $status >= 500;
  if ($transient && $attempts < 3) { usleep(700000); continue; }
  break;
}

/* all attempts failed → report the most useful error we have */
if ($lastErrno) {
  out(502, array("error" => array("message" => "Upstream connection failed (cURL " . $lastErrno . ")")));
}
$msg = "Upstream error (HTTP " . $lastStatus . ")";
$decoded = json_decode((string)$lastBody, true);
if (is_array($decoded) && isset($decoded["error"])) {
  if (is_array($decoded["error"]) && isset($decoded["error"]["message"])) $msg = $decoded["error"]["message"];
  elseif (is_string($decoded["error"])) $msg = $decoded["error"];
} elseif (is_string($lastBody) && preg_match("/<html/i", substr($lastBody, 0, 200))) {
  $msg = "Host intercept page (security check) — reload once and retry";
}
out($lastStatus >= 400 ? $lastStatus : 502, array("error" => array("message" => $msg)));
