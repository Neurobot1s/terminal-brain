<?php
/**
 * NeuroBot — ai.php
 * Same-origin proxy to NVIDIA NIM chat completions.
 * Keeps the API key out of page source (server-side only).
 * Optional: client may send its own key via the "X-NB-Key" header.
 */

header("Content-Type: application/json; charset=utf-8");
header("X-Content-Type-Options: nosniff");
header("Cache-Control: no-store");

/* ── key: edit here to swap keys, no JS changes needed ── */
$SERVER_KEY = "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";

$UPSTREAM = "https://integrate.api.nvidia.com/v1/chat/completions";
$ALLOWED_MODELS = array(
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
);

function out($code, $payload) {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
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

$payload = array(
  "model" => $model,
  "messages" => $clean,
  "max_tokens" => $maxTokens,
  "temperature" => $temp,
  "top_p" => 0.95,
  "stream" => false,
);

/* ── forward ── */
$ch = curl_init($UPSTREAM);
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

if ($errno) {
  out(502, array("error" => array("message" => "Upstream connection failed (cURL " . $errno . ")")));
}
if ($status !== 200 || $body === false || $body === "") {
  $msg = "Upstream error (HTTP " . $status . ")";
  $decoded = json_decode((string)$body, true);
  if (is_array($decoded) && isset($decoded["error"])) {
    if (is_array($decoded["error"]) && isset($decoded["error"]["message"])) $msg = $decoded["error"]["message"];
    elseif (is_string($decoded["error"])) $msg = $decoded["error"];
  }
  out($status >= 400 ? $status : 502, array("error" => array("message" => $msg)));
}

/* pass upstream response through untouched */
header("Content-Length: " . strlen($body));
echo $body;
