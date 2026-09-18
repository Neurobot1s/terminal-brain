/* Probe: public CORS proxies for Kernel REST (GET + POST passthrough) */
const KEY = "sk_3f9ea184-1094-ee4e-f1ae-39ebe2637b9e.lfDHUAScxT67Xvn2NZcHbw8PpOgCF97fwG0wd57451w";
const API = "https://api.onkernel.com";
const enc = encodeURIComponent(API + "/browsers");

const proxies = [
  { name: "allorigins-raw", get: "https://api.allorigins.win/raw?url=" + enc, post: "https://api.allorigins.win/raw?url=" + enc },
  { name: "allorigins-win-get", get: "https://api.allorigins.win/get?url=" + enc },
  { name: "corsfix", get: "https://proxy.corsfix.com/?" + API + "/browsers", post: "https://proxy.corsfix.com/?" + API + "/browsers" },
  { name: "codetabs", get: "https://api.codetabs.com/v1/proxy?quest=" + enc },
  { name: "corsproxy-io", get: "https://corsproxy.io/?url=" + enc, post: "https://corsproxy.io/?url=" + enc },
  { name: "corslol", get: "https://api.cors.lol/?url=" + enc, post: "https://api.cors.lol/?url=" + enc },
  { name: "whateverorigin", get: "https://www.whateverorigin.org/get?url=" + enc },
];

for (const p of proxies) {
  if (p.get) {
    try {
      const r = await fetch(p.get, { headers: { "Authorization": "Bearer " + KEY }, signal: AbortSignal.timeout(15000) });
      const t = await r.text();
      console.log(p.name, "GET", r.status, t.slice(0, 90).replace(/\n/g, ""));
    } catch (e) { console.log(p.name, "GET ERR", e.message); }
  }
  if (p.post) {
    try {
      const r = await fetch(p.post, {
        method: "POST",
        headers: { "Authorization": "Bearer " + KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ timeout_seconds: 259200 }),
        signal: AbortSignal.timeout(15000),
      });
      const t = await r.text();
      console.log(p.name, "POST", r.status, t.slice(0, 120).replace(/\n/g, ""));
      // if a session got created, delete it
      try { const j = JSON.parse(t.slice(t.indexOf("{"))); if (j.session_id) await fetch(API + "/browsers/" + j.session_id, { method: "DELETE", headers: { "Authorization": "Bearer " + KEY } }); console.log(p.name, "cleaned", j.session_id); } catch {}
    } catch (e) { console.log(p.name, "POST ERR", e.message); }
  }
}
console.log("leftover sessions:", await (await fetch(API + "/browsers", { headers: { "Authorization": "Bearer " + KEY } })).text());
