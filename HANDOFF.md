# NeuroBot — Agent Handoff

**Live site:** https://neurobot1s.github.io/terminal-brain/#/
**Stack:** pure vanilla HTML/CSS/JS, classic `<script>` tags, no build step. GitHub Pages (branch `main`, root). Owner: Tanishq Lalwani.

## Current state (2026-09-21, Round 8) — ALL 10 SUITES PASS, AGENT LOOP HARDENED + VIEW MENU POLISH
All 10 test suites pass (boot, routes, interact, live, ai, agent, agent-browse, kernel, kernel-view, ab-trigger-boot). All JS `node --check` clean. Cache-buster bumped: agent-browse.js `?v=20260921a`.

### Round 8 — "Improve it and continue"
- **Failed CLICK/TYPE now reach STEPS SO FAR** (agent-browse.js runKernel). Before, only READ failures were recorded — a CLICK that found nothing was logged to the UI but invisible to the model, so it kept re-emitting the same dead click. Both now push an explicit instruction line (NOT FOUND / NO FIELD + what to try instead). Loop-breaker parity across all three interaction actions.
- **Repeated-step detector:** 3 identical (action+arg) outcomes in a row → `bestEffortAnswer()` forces a wrap-up instead of letting the model grind (the "it just searches the same thing over and over" report).
- **Wrap-up near the cap:** last 3 steps (`MAX_STEPS - 3`) inject a `⚠ WRAP UP` banner into the model prompt (new workflow rule 7: no new searches/opens, ANSWER with what you have) + rule 8 (stop repeating failing actions).
- **PAGE TEXT window 900 → 1400 chars** in the per-step prompt — more retrieval context per step without changing step-token budget.
- **View menu polish:** the ⛶ View button now shows the live zoom level ("⛶ View · 125%") after any zoom change; Escape closes the open menu (one shared module-level keydown listener, same pattern as click-away — no per-open listener stacking).
- **Test hygiene:** removed the leftover `[dbg]` console dumps from tests/kernel-view.test.js; added 5 regression checks (failed CLICK/TYPE recording, repeated-step detector, wrap-up banner, zoom % on button, Escape close) — all verified running (not skipped).

## Current state (2026-09-20, Round 7) — ALL 10 SUITES PASS, VIEW-MENU TEST RACE FIXED
All 10 test suites pass (boot, routes, interact, live, ai, agent, agent-browse, kernel, kernel-view, ab-trigger-boot). All JS `node --check` clean.

### Round 7 — fixes from the "continue" session
- **`tests/kernel-view.test.js` raced its own fake WebSocket.** It slept a fixed 150ms after `NB.agentBrowse()` and then asserted `#ab-live` existed — but the fake WS + driver boot resolves on timers that can slip past 150ms on slower machines (flaky 4-fail runs interleaved with passes; the standalone debug harness showed `live: true` at 400ms in 3/3 runs). Fixed: the test now POLLS up to 1.5s for `#ab-live` + a `src` before asserting, plus a 30ms settle. No app-code change was needed — the app itself was already correct.
- **Deleted the leftover `tests/debug-ablive.test.js`** (temporary debug harness, not a real suite).
- Verified present and wired (user-reported Round 5/6 issues all closed): `.ab-menu` styles (styles.perf.css §~795 incl. mobile media query), kernel-down retry strip (`ab-kdown` + `Retry kernel`), pseudo-fullscreen (`fs-pseudo` + exit chip), CDP viewport emulation (`Emulation.setDeviceMetricsOverride`, 390×844), never-empty extraction fallback (`text.length<40` + body.innerText retry) in `extractPageText` (js/kernel.js:352).

## Current state (2026-09-20, Round 6.1) — ALL GREEN, PAGE READING FIXED
All 8 test suites pass. All JS `node --check` clean. Cache-busters `?v=20260920a` (ai.js, views-dashboard.js, agent-browse.js, **kernel.js**).

### Round 6.1 — THE "agent can't read pages / says empty but I can see it" bug (ROOT CAUSE)
- **`extractPageText` double-unwrapped the CDP response.** `driver.eval` already resolves with `d.result` and returns `r.result.value` (the page object) — but `extractPageText` then read `r.result.value` AGAIN off that object → `undefined` → **always fell through to `{title:"",url:"",text:""}`**. Every page, every search, every run: the agent was told the page was empty while the live view showed it fine. Never caught because jsdom stubs the driver and the Round-5 live check read `document.title` via raw CDP, not through `extractPageText`.
- **Fixes in js/kernel.js:**
  - Single unwrap with a shape guard (`v && typeof v.text === "string"`), tolerant of both response shapes.
  - **Bounded empty-retry (×3, 700ms apart):** SPAs flip `readyState` to `complete` BEFORE content renders — the agent no longer gives up on a page that's still painting.
- **Live-verified through the relay (dev-only E2E, then deleted):** create session → CDP WS → navigate example.com → run the EXACT runtime expression with driver.eval semantics → title "Example Domain", NON-EMPTY text ✓ → delete → relay list `[]` (zero leaks). Repro note: the app's Cdp resolves `d.result`; a raw-WS harness must mirror that or fields look undefined.
- Search results, OPEN/READ, temp-mail address reads, and DDG result text all flow through this one extractor — they were ALL dead before this fix.

## Current state (2026-09-20, Round 6) — AGENT DOES REAL WORK (see also 6.1)

## Round 6 — "make the agent do actual work" + "it just searches mount everest height"

### 1. The Mount-Everest echo bug (ROOT CAUSE FOUND — it was us, not the model)
- **The agent prompts' few-shot examples literally said `NEXT SEARCH mount everest height` / `NEXT ANSWER Mount Everest is … 8,849 m`.** The small NVIDIA model (gpt-oss-20b) sometimes parrots example content instead of the user's question → it "searched Mount Everest height" for unrelated asks.
- **Fixed in BOTH prompt AND code:**
  - All three prompts (kernel loop, classic readers, quiet) now lead with RULE 0: examples are FORMAT ONLY — always act on the user's request. Kernel examples are now topic-neutral doing-steps (OPEN → CLICK → TYPE → KEY → ANSWER).
  - **`fixEcho()` guard in every loop:** if a model step is about the demo topic (`mount everest|8,849`) or a literal `<template>` while the user's query never mentions it → SEARCH is rewritten to the user's query; ANSWER/OPEN/READ are rejected and the run falls back to `bestEffortAnswer` (composes from gathered research). If the user genuinely asks about Everest, the guard stays out of the way.

### 2. Task auto-routing — doing-tasks now reach the browser agent automatically
- **New `NB.isTaskRequest(q)` heuristic** (agent-browse.js): sign in/up, login/logged-in/logging-in, register, create/make account, fill/submit form, checkout/cart, buy/order/book/reserve + article, subscribe, apply, post/tweet/publish/upload, send message/email, temp mail, "open X and/then …" chains.
- **Dashboard ask box (`views-dashboard.js` send()) and the ✦ Ask modal (`ai.js` runAsk) now route task-like messages to `NB.agentBrowse(q)`** instead of the memory-chat AI (which cannot operate websites). Toast: "Task handed to agentBrowse — watch it work." Research questions still go to askAI unchanged.
- Sanity-checked 10 phrasings ("sign in to chatgpt.com via temp mail" → agent; "How tall is Mount Everest?" → chat; "best laptop to buy 2026" → chat; "log into my netflix account" → agent; "open youtube and play lofi beats" → agent; …) — ALL PASS.

### 3. Kernel agent is now a DOING agent
- Prompt rebuilt: interaction example chain first, per-run **TASK TYPE: DOING vs RESEARCH** (from `isTaskRequest`), DOING tasks must OPEN the named site directly (no SEARCH detour) and use CLICK/TYPE/KEY; temp-mail recipe expanded (open → READ address → TYPE → submit → reopen inbox → READ code); ANSWER must report what was DONE (accounts created, forms submitted, codes used).
- **New `NEXT SCROLL down|up` action** (d.eval scrollBy) for below-the-fold fields/buttons.
- MAX_STEPS 18 → 24 (temp-mail sign-up flows need ~15+ steps); per-step page-text window 500 → 900 chars (temp addresses/codes survive truncation); step tokens 220 → 260.
- 🌐 button tooltip: "watch the agent DO tasks & research on the web".

### Verified this round
- `node --check` all 14 JS files clean; 8/8 jsdom suites pass; `NB.isTaskRequest` 10/10; agent-browse scripted run ALL PASS with the echo guard active in kernel+classic+quiet paths.

## Current state (2026-09-19, Round 5) — ALL GREEN, SCROLL/TOUCH/KERNEL-AGENT HARDENED
All 8 test suites pass (`boot`, `routes`, `interact`, `live`, `ai`, `agent`, `agent-browse`, `kernel`). All 14 JS files `node --check` clean; all 3 CSS files brace-balanced. Cache-busters bumped to `?v=20260919e`.

**Live verification this round:** kernel relay E2E (POST /browsers → CDP WS → Page.navigate example.com → title "Example Domain" → closeTarget → DELETE → 204) ALL PASS. Relay session list = `[]` after runs (zero leaks). NVIDIA NVCF `/functions` discovery → 200, `ai-gpt-oss-20b` ACTIVE — the agent's brain is alive.

## Round 5 — "can't scroll" + "mobile zoom glitches" + agent does REAL work

### 1. Scrolling (fixed for real this time — three causes)
- **`html { scroll-behavior: smooth }` REMOVED** (was declared in styles.perf.css, plus a duplicate in prefs path). Every wheel/keyboard/anchor scroll was re-animated as a glide that lagged the finger and fought momentum. Native scrolling is what actually feels smooth. `body.reduce-motion` honor kept.
- **`overscroll-behavior: contain` removed from `#view`** — the WINDOW is the scroller, so this only disabled the page's own bounce and made the page feel locked. Kept on real inner scrollers (.nav/.modal/.term-out/.live-thread/.cmdk-list/.ab-log).
- **Route transition de-transformed:** `routeIn` no longer animates `translateY+scale` (it rasterized the page-height view into a fresh GPU layer on EVERY navigation → visible hitch at scroll start). Opacity-only crossfade now.
- **`min-height: 100vh → 100dvh`** on .app/.main/.sidebar (with @supports fallback): mobile URL bars shrink/grow; 100vh froze the layout at the taller height leaving dead space + trapped gestures.
- Desktop-only `overscroll-behavior-y: none` on body (kills pull-to-refresh hijack mid-read; touch devices keep native bounce).

### 2. Mobile zoom glitches (fixed)
- **Scrim blur removed** (styles.css): `backdrop-filter: blur(2px)` on the drawer scrim forced whole-page re-rasters and glitched pinch-zoom on iOS.
- **fx.js swipe handler hardened:** bails when the drawer is open (taps near the screen edge were mis-aimed by the shifted viewport and hit rows behind the drawer — felt like the app "zooming/glitching"); bails mid-gesture if drawer opens; second-finger join releases instantly (existing).
- 16px form inputs on touch were already in place (iOS focus auto-zoom) — verified still effective after the CSS layering changes.
- Palette arrow-nav no longer yanks the page: replaced `scrollIntoView({block:nearest})` with a manual list-internal scroll (main.js).

### 3. Kernel agent does REAL work (agent-browse.js + kernel.js)
- **`NEXT WAIT n` action** (1–5s, budget 3) — the model can now wait out navigation/modals instead of failing "element missing".
- **Loop context upgraded:** model now sees CURRENT URL, first 500 chars of PAGE TEXT, and top 6 resolved LINKS (title → url) every step. Bare-title `OPEN Mount Everest` resolves against those links (search result pages show URLs only in hrefs — this was why it couldn't follow results).
- **DDG html endpoint** (`html.duckduckgo.com/html/`) replaces the JS lite page that often rendered blank under CDP; search results now go through the rich extractor + render in the reader panel.
- **MAX_STEPS 14 → 18** and the system prompt gained 6 workflow rules (use CLICK/TYPE/KEY for doing-tasks; WAIT-then-relook; READ for content; never OPEN the current page; no repeated failing steps; ANSWER as soon as done). Temp-mail flow guidance kept.
- **Relay path now retries once on vanished sessions** (the reported "browser session closed after error") — mirrors the managed path: clean delete, 400ms, fresh browser, bounded (no loops). Logged honestly.
- Prompt fix note: regex edits inside agent-browse.js must be written as literal text — the file contains `\\s` etc.; tool-escaped variants silently miss (hit once this round, caught by re-grep).

### Kernel transport facts (unchanged, verified live again)
- Built-in relay `BUILTIN_RELAY` in js/kernel.js (the jolly-breeze worker) — authenticated list/create/delete verified this round. Sessions: 72h timeout, created fresh per run, DELETED on finish (relay list shows `[]` after the E2E run).
- MCP transport stays wired as no-relay fallback but is CORS-blocked in browsers (no ACAO on POST responses) — do not remove the relay.

## Current state (2026-09-19, Round 4) — ALL GREEN, CLOUD BROWSER LIVE
All 8 test suites pass: `boot`, `routes`, `interact`, `live`, `ai`, `agent`, `agent-browse`, `kernel`. All 14 JS files syntax-clean (`node --check`). All 3 CSS files brace-balanced. Cache-busters bumped to `?v=20260919d` (index.html).

**Cloud-browser runs are LIVE end-to-end.** Verified 2026-09-19 with a real smoke test (create → CDP WebSocket → navigate example.com → read title → close tab → delete, all through the relay): ALL PASS. A deployed relay is now BUILT IN (`BUILTIN_RELAY` in js/kernel.js) — zero setup for users.

## Round 4 — relay is built-in + auth fix (this made Kernel actually work)

### The last bug: relay REST went out WITHOUT the Authorization header
- The deployed relay forwards auth faithfully — but `openRelayDriver` sent create/delete fetches with only `Content-Type`. Kernel answered **401 "Authentication token required"** on every browser create. Verified live: same POST with `Authorization: Bearer <key>` → 200 + full session payload.
- **Fixes in js/kernel.js:**
  - `BUILTIN_RELAY` constant = the project's Cloudflare Worker. `relayBase()` falls back to it; a user override (Settings) wins; clearing the field returns to built-in. `NB.getKernelRelay()` returns the EFFECTIVE relay so Settings prefills it.
  - Every relay call (create, delete, probe) now sends `Authorization: Bearer <key>`.
  - `openRelayDriver` hardened: error bodies surfaced (`relay 401: …`), create-failure after browser open deletes the session (no leaks), deletes are `keepalive` fire-and-forget so a dead relay can't hang the UI.
  - `kernelAgent.ready()` now PROBES the relay (authenticated GET /browsers, 15s budget, one retry) instead of assuming — `NB.kernelProbeBlocked()` still flags network/CORS failures.
  - `NB.kernelUsable()` = true when any relay is set (true out of the box now); TEST/TAB_REUSE modes report usable so tests exercise the driver.
- **Live verification (node, real network):** POST /browsers → 200 + cdp_ws_url → CDP WS connect → Target.createTarget/attach/Page.navigate → `document.title` = "Example Domain" → Target.closeTarget → DELETE → 204. Relay + auth + CDP + cleanup ALL PASS.
- **UI:** Settings → Kernel Browser says the relay is built-in, prefills the effective URL, probe says "relay transport"; agentBrowse fallback line points at the relay URL instead of telling users to deploy one.

## Round 3 — kernel CORS truth + scrolling/GPU-layer fixes

### 1. "Kernel unreachable" — REAL root cause found (read before touching kernel.js again)
- **The MCP POST response carries NO CORS headers.** Re-verified live with `curl -D -` on 2026-09-19:
  - `OPTIONS /mcp` preflight → **204 with `access-control-allow-origin: *`** (this is what fooled the previous round)
  - `POST /mcp` → **200 with ZERO `access-control-*` response headers**
- Browsers check ACAO **on the actual response**, not just the preflight — so every real fetch() from a static-site browser is blocked. **curl works, browsers don't.** This is exactly why the MCP transport "passed curl" but the UI kept saying unreachable.
- Also dead-ended: `GET /sse` (legacy transport) hangs with no headers; `api.kernel.sh` DNS-dead; every public CORS proxy (see history below). REST `api.onkernel.com` sends nothing either.
- **Verdict: there is NO browser-only transport today.** The only working path from a static site is the **kernel-relay Worker** (2-min deploy, free) — its code (`kernel-relay.js`) already forwards MCP-style REST and sets CORS. Relay URL goes in Settings → Kernel Browser.
- **kernel.js changes this round:**
  - Transport stays wired (initialize → manage_browsers) so the day Kernel adds response CORS, the site lights up with zero changes.
  - Network TypeErrors now map to the honest, actionable `CORS_HELP` message (deploy the relay) instead of a generic failure.
  - New exports: `NB.kernelProbeBlocked()` (true when the probe failed via CORS) and `NB.kernelUsable()` (true only when a relay is set).
- **UI messaging (no more dead ends):**
  - Settings → Kernel Browser test button now explains the Kernel-side limitation and the 2-minute relay fix verbatim.
  - agentBrowse fallback line says "kernel blocked by browser CORS — using in-site readers instead (deploy kernel-relay.js to enable cloud runs)".
  - Dashboard brain-health chip gained a tooltip: counts + "all data stays on this device".

### 2. Scrolling smoothness — three real jank sources removed
- **styles.perf.css had a broken block** (a selector list ending in a comma directly followed by `@media` — parse-breaking garbage from a pasted edit; browsers skipped the rest of the rule set). Repaired into valid rules; all 3 CSS files now brace-balanced.
- **Removed `#view { will-change: scroll-position; transform: translateZ(0) }`.** The WINDOW is the scroller (not `.view`), so this promoted the entire page-height view to its own GPU layer — viewport-sized raster + texture uploads per route change. Net: scrolling got WORSE. `contain: layout style` kept on `#view`; `contain: layout style paint` kept on fixed chrome (sidebar/topbar/status) where it does help.
- **Removed the desktop-only topbar `backdrop-filter: blur(14px)`.** A sticky blurred bar repaints every scroll frame on desktop too. The flat translucent bar is visually near-identical and scroll-cheap.
- **main.js no longer scrolls to top on data-op re-renders.** `window.scrollTo(0,0)` now fires only on real hash navigation — pin/delete/idea-status ops re-dispatch `hashchange` with the SAME hash and used to yank the user to the top mid-read. `html { scroll-behavior: smooth }` stays but was de-duplicated (it was declared twice, two different files).

### Round 2 — micro-interactions + living data (styles.perf.css §14–15)
- **Entrance choreography:** stat cards/panels cascade in with 30–40ms steps (`cardIn`, spring); graph nodes pop in staggered + radial halo behind the graph (`core-part2.js` renderGraph unchanged — CSS only).
- **Count-up stat animation:** `NB.animateCounters(view)` (core-part2.js) animates `.stat-val` numbers 0→N over 650ms ease-out-cubic, one rAF per node, skips 0/reduced-motion, auto-cancels if the node leaves the DOM. Called from main.js after each route render.
- **Route transition is now hash-aware** (main.js): `route()` tracks `lastHash` — the `.route-in` animation only plays on REAL navigation, not on data-op re-renders (pin/delete re-dispatch `hashchange` with the same hash; replaying there was obnoxious).
- **Living timestamps:** dashboard `act-time` labels refresh every 60s (views-dashboard.js timer, dashboard route only, skipped while `NB.suppressRerender`) so "just now" never goes stale.
- **Swipe-to-delete on touch** (fx.js + styles.perf.css §15): horizontal swipe (>48px, must be more horizontal than vertical or it's left alone as a scroll) on activity/notification rows reveals the delete button (`swipe-open` class); tap-elsewhere closes. CSS-only layout, `coarse pointer` media query so desktop is untouched.
- **Rich empty states** (views-collections.js `emptyState()`): My Brain/Notes/Knowledge/Goals empty pages now show live brain-stats tags (counts per kind) + ALL four capture buttons + a keyboard tip. No dead ends.
- **Connections page is live:** side panel now computes real potential pairs (n·(n−1)/2 per topic group), active topics (2+ memories), and total memories — same math as the dashboard counter (views-misc.js).

## Round 1 — Apple-grade UI polish + responsiveness (styles.perf.css §11–13)
- **Typography system:** new `--sans` stack (SF Pro/Segoe/Inter) applied to all *reading* surfaces (Live bubbles, ask answers, card bodies, empty states) while chrome stays mono → the terminal identity is intact but text is far more readable. Tabular numerals on stat values/times so counters don't jitter. Fluid `clamp()` hero + page headings.
- **Motion language:** `--spring` bezier; soft page transition on route change (`main.js` adds `.route-in` with a reflow trick so it replays); iOS-style press feedback (`scale(0.96)`) on every tappable; toasts and modals animate on the compositor only (transform/opacity). `prefers-reduced-motion` + `body.reduce-motion` honored.
- **Depth:** hairline top-light (`inset 0 1px 0`) + layered hover shadows on panels/stat/mem cards.
- **Responsive:** safe-area insets (topbar/view/sidebar/status bar), iOS bottom-sheet modals (≤640px, `92dvh` + `sheetUp` spring), crossfading scrim (opacity instead of display flip), desktop-only topbar vibrancy (`backdrop-filter` guarded to ≥861px), landscape-phone compaction, `overscroll-behavior: contain` on all scroll containers, webkit autofill dark-theme fix, 44px nav targets on mobile.
- **main.js:** route change replays the `.route-in` animation (remove → reflow → add).

## Kernel Browser — transport history (read this before touching)
- **RESOLVED (Round 4): the relay is BUILT IN and verified live.** `BUILTIN_RELAY` in js/kernel.js; runs create/delete real cloud browsers through it today. Only touch this if the worker dies — then deploy a fresh one from `kernel-relay.js` and either update `BUILTIN_RELAY` or paste the URL in Settings → Kernel Browser (the override wins).
- **REST create/list/delete is CORS-blocked from browsers when called directly.** Do not remove the relay.
- **All public CORS forwarders tested and dead:** corsproxy.io (401 paid), allorigins (timeout), thingproxy (dead), codetabs (timeout), whateverorigin (GET-only, 405 on POST), cors.lol (429), crossorigin.me (dead), r.jina.ai (timeout), cors-anywhere demo (403 needs opt-in), test.cors.workers.dev (429). **Do not ship an auto-fallback to public proxies — it cannot work.**
- CDP WebSocket + live-view iframe connect DIRECTLY (no CORS on WS/iframes) once a session exists.
- Fresh-session-per-run + delete-on-finish + limit-reclaim logic all live in `js/kernel.js`. Settings test button probes the relay and labels honestly.

## Hotfix — Chinese text leaking into answers
- gpt-oss sometimes returns empty `content` + chain-of-thought in `reasoning` **in Chinese**. `extractAnswer` used to fall back to that raw reasoning → Chinese in the UI. Now the reasoning fallback is only used when it's ≥70% Latin script (`latinRatio`), and "ALWAYS reply in the user's language — default to English" is pinned in the agent system prompt, summarize pass, and both agentBrowse prompts.

## Latest round — agentBrowse (watchable web-browsing agent)
- **`js/agent-browse.js` (NEW, loads after ai.js, before voice.js — index.html + E2E order check updated).** In-site research agent: real Wikipedia REST+API fetches (CORS-open) + optional `r.jina.ai` reader for arbitrary URLs, reasoning loop via **`NB.rawAI`** (new ai.js export: raw postAI call).
- Loop: model replies `NEXT SEARCH|OPEN|READ|ANSWER <arg>` (parser accepts with/without NEXT — models drop the prefix; small models need CONCRETE examples in prompts, not `<template>` meta-syntax, or they echo it). Max 7 steps. Watchable panel `#ab-panel`: fake browser chrome + viewport (pages/links render live), step log (⚡/✓/✗), status pill, GET foot. Also `NB.agentBrowseQuiet(query)` — same loop, no UI, returns the ANSWER text.
- **🌐 trigger button** injected into the dashboard ask-box (`wireChatButton`, re-wired on hashchange since the view re-renders). Type a question → 🌐 → watch the agent work in real time.
- Tests: `tests/agent-browse.test.js` (booted jsdom, scripted rawAI, stubbed wiki fetch — 14 checks incl. viewport rendering, log streaming, button wiring). **Live verified**: "tallest mountain…" → SEARCH → OPEN → ANSWER "Mount Everest … 8,849 m" in 4s.

## Previous round — AI AGENT (writes to the brain)
- **The AI now ACTS, not just answers.** System prompt teaches an `ACTION {"op":...}` protocol; model replies are parsed (brace-matched, one-line-safe), applied to the store, then a **second model pass** summarizes what was done (≤30 words, mentions titles).
- Ops: `add_note/add_idea/add_goal/add_knowledge` (kind also derived from op name), `update` (partial patch by exact-title match), `delete`, `pin`. All values sanitized (enum statuses/topics/categories, progress clamped 0–100, ISO-or-no deadline, ≤5 ops).
- Guardrails in prompt: only emit ACTION on explicit save/create/update/delete intent; questions and general knowledge never write. Verified live: "remember my dentist…" → note written; "what do I have about dentist…" → answered from memory; "who wrote 1984?" → answered, no write.
- `NB.askAI(question, opts)` now takes `opts.history` (last 6 turns) — conversation memory wired into dashboard ask box, ask modal, and Live voice (`liveChat`). Dashboard chat sets `NB.suppressRerender` during a turn so agent writes don't wipe the open chat.
- Dashboard mic button = **real dictation** now (browser SR → fills input; `.rec` pulse style).
- `NB.__agent` exports parseAgentReply/applyOps/findItem for tests; `tests/agent.test.js` (21 offline checks, jsdom) + live network probe all pass.
- Gotchas fixed while building: parser must brace-match (models put ACTION+SAID on one line); add-branch regex `/^add_(note|idea|goal|knowledge)$/`; kind defaults from op name.

## Previous round (morning)
- **Answer-length caps removed** (`js/ai.js`): prompt now says "Answer fully and completely"; every path gets the full 2048-token budget; agentBrowse step budget 300→500.
- **Live readability** (`styles.perf.css` §6/§7): bubbles 15.5px/1.6, thread 52vh, wider voice pane on desktop splits.
- **"Session not found" hardening** (`js/kernel.js`): vanished-session race auto-retries once with a brand-new session; concurrent-limit path closes up to 2 idle sessions to make room before reusing.
- Settings → Kernel Browser gained mode/key/relay fields + honest "Check browser access" output.
- `tsconfig.json` fixed for the platform typecheck (was `files: []` → TS18002); include only `src/**` — the vanilla app isn't typechecked.

## Previous round (night)
- **Device TTS rebuilt** (voice.js `browserSpeak`): 120ms settle after `cancel()` (Chrome drops the next utterance otherwise — the silent-answer bug), voice picking (best en voice by name), 180-char chunking with queued playback, per-chunk watchdog for lost `onend`, global `speakToken` so Stop/cancel kills queued chunks.
- **Voice-catch fixes**: echo guard narrowed — only filters when the utterance is a strong prefix (>18 chars) or long fragment (>30) of NeuroBot's last answer, so short replies ("nice", "cool") always pass; repeat guard now 90s windowed + exempt for <6-char words; VAD "speaking" also counts recent SR activity (quiet mics get the countdown); 7s no-speech round bail-out; starter chips ("summarize my notes" etc.) ask without the mic.
- **UI polish** (styles.perf.css §7): orb aura animation, status-pill dot, starter chips, ask-box focus glow + hover lift, stat-card accent rail, sidebar icon nudge.
- NVIDIA speech re-probed: functions ACTIVE on NVCF but pexec still 404s (gRPC-only) — device engines remain the active path.

## Previous round (evening)
- **AI prompt**: two-step scan — answer from memories first; if not covered, answer from general knowledge and NEVER say "no relevant memory". Verified live (Japan-PM question answered from GK against an unrelated brain).
- **Voice double-print fixed at 3 levels**: echo guard (drops mic pickup of NeuroBot's own TTS via `lastSpokeText`), session-wide repeat dedupe (`said{}` map), instant bail on NVIDIA's deterministic speech 404/500 (no more chain-limbo window). TTS status now says "Speaking with your device voice…" (no "busy").
- **Terminal agent commands** (terminal.js): `new <kind> [title]` instant capture (no modal), `rm <kind> <n>`, `pin <kind> <n>`, `idea <n> <status>`, `goal <n> <pct>`, plus existing `ls/find/cd/ask/export/theme`. One duplicate `export` entry was created and removed during this edit — final file has exactly one `export:` (line ~357) and passes syntax + all suites.

## Architecture
- `window.NB` namespace, classic scripts loaded in `index.html` order: core → core-part2 → prefs → **ai** → views-dashboard → views-collections → views-kanban → views-misc → **voice** → main → terminal → fx. Load order matters (voice.js defines `NB.openLive` after views-misc).
- Router: hash-based (`main.js`). Modals via `NB.openModal`. Store: `localStorage`, CRUD in core-part2.
- 3 CSS files kept intentionally: `styles.css` (base), `styles.polish.css`, `styles.perf.css` (loads last, wins ties; Live voice styles live in its "§6" section).

## AI (`js/ai.js`)
- NVIDIA-only, built-in owner key embedded (`BUILTIN_KEY`). User key override in `localStorage["nb_ai_key"]` wins.
- Transport chain (first win remembered in `nb_ai_route`): custom relay → **NVCF direct** `api.nvcf.nvidia.com/v2/nvcf/pexec/functions/{id}?versionId={ver}` (CORS-open, works on Pages) → integrate.api (CORS-blocked from Pages).
- Models: gpt-oss-20b (fast), llama-3.2-11b (balanced), llama-3.2-90b (deep). Function IDs self-healed from NVCF `/functions` discovery (12h cache, `nb_ai_fns`).
- **5xx now jumps straight to the NEXT MODEL** (added because gpt-oss-20b was 504-ing while 11b answered).

## Voice / Live (`js/voice.js`) — just rebuilt
- `NB.openLive`: orb UI, transcript bubbles, hands-free, save-transcript-to-note, engine labels in footer.
- STT chain: NVCF parakeet-tdt-0.6b-v2 → whisper-large-v3 → parakeet-1.1b (payload `{audio: b64wav}`, 16kHz mono WAV built in-browser). TTS chain: magpie-multilingual → chatterbox → studiovoice (`{text, voice, language}`).
- **NVIDIA speech endpoints currently unreachable from any browser** (gRPC-backed NIMs; NVCF HTTP proxy returns 500/404; integrate has no audio routes). Auto-fallback to device SpeechRecognition/SpeechSynthesis; footer labels the active engine. Recheck with terminal command `voice`.
- Recent fixes (verified): transcript **rebuilt per-event, not accumulated** (kills double-print; Chrome re-delivers results + finalizes last result after stop() — handle via `getText()` on next tick); **5s pause sends** in hands-free (countdown in status pill, `PAUSE_MS`, echo gap `ECHO_GAP_MS` 800ms after TTS); **no minimum-length gate** — every utterance sends.

## Testing (repo `tests/`, dev-only, don't ship)
jsdom suites need `/tmp/nbtest/node_modules/jsdom` (reinstall: `npm i jsdom --no-save` anywhere, point tests at it). `tests/live.test.js` stubs mic/recorder/SR/TTS; includes a double-fire recognition stub proving single-print. Interact suite pre-sets `sessionStorage["nb_credit"]="1"` to dodge the 900ms Credits popup race.

## Known constraints
- NVIDIA speech: browser-blocked today (see above). Chat path works (11b verified 200 live).
- Built-in key is public in a public repo — rotates at build.nvidia.com if abused.
- Don't add `hmr: true` anywhere; keep classic scripts and relative paths (file:// must work).

## Ship list
Everything except `tests/`, `.env*`, `node_modules/`, `.git*`. `DEPLOY.txt` has the checklist.
