/* ============================================================
   NeuroBot — Kernel relay (Cloudflare Worker, free tier)
   Forward session REST to api.onkernel.com with CORS headers —
   the static site can then create/delete cloud browsers directly.

   ── DEPLOY (2 minutes, free, no card) ────────────────────────
   1. Sign up at workers.cloudflare.com
   2. Create a Worker → paste THIS file → Deploy
   3. Copy the URL (https://<name>.<account>.workers.dev)
   4. In NeuroBot: Settings → Kernel Browser → paste into
      "Cloudflare relay" → Save. The test button should say
      "✓ Kernel reachable".
   ============================================================ */

const API = "https://api.onkernel.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, ""); // "" | "browsers" | "browsers/<id>"
    if (path && !/^(browsers|browsers\/[\w-]+)$/.test(path)) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const upstream = await fetch(API + "/" + path, {
      method: request.method,
      headers: {
        "Authorization": request.headers.get("Authorization") || "",
        "Content-Type": "application/json",
      },
      body: request.method === "GET" || request.method === "DELETE" ? undefined : await request.text(),
    });

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
