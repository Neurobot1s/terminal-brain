/* ============================================================
   NeuroBot — NVIDIA relay (OPTIONAL, for production reliability)

   NVIDIA's API (integrate.api.nvidia.com) only sends CORS headers
   to build.nvidia.com, so a static site needs a small relay.
   NeuroBot falls back to public relays automatically, but public
   relays can be rate-limited or slow. Deploy this tiny worker on
   Cloudflare (free tier) and paste its URL in
   Settings → AI Connection → relay field. It will be tried FIRST.

   ── DEPLOY (2 minutes, free) ──────────────────────────────────
   1. Sign up at workers.cloudflare.com (free, no card).
   2. Create a Worker → replace its code with THIS FILE → Deploy.
   3. Copy your worker URL (https://<name>.<account>.workers.dev)
      and paste it into NeuroBot Settings → AI Connection → relay.

   The relay is DUMB BY DESIGN: it forwards the request (including
   your Authorization header) straight to NVIDIA and streams the
   response back. It stores nothing. Your key stays yours — it
   travels from your browser through the relay to NVIDIA only.
   ============================================================ */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export default {
  async fetch(request) {
    /* CORS preflight — required for browser POSTs */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ detail: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    /* forward the request untouched — body, auth header, model, everything */
    const upstream = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": request.headers.get("Authorization") || "",
        "Accept": request.headers.get("Accept") || "application/json",
      },
      body: await request.text(),
    });

    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
