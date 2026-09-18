# NeuroBot — Agent Handoff

**Live site:** https://neurobot1s.github.io/terminal-brain/#/
**Stack:** pure vanilla HTML/CSS/JS, classic `<script>` tags, no build step. GitHub Pages (branch `main`, root). Owner: Tanishq Lalwani.

## Current state (2026-09-18) — ALL GREEN
All 8 test suites pass: `boot`, `routes`, `interact`, `live`, `ai`, `agent`, `agent-browse`, `kernel`. All 12 JS files syntax-clean (`node --check`). Kernel org left with **0 idle sessions** (verified via API). Nothing pending.

## Round 2 — micro-interactions + living data (styles.perf.css §14–15)
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

## Kernel Browser — final state (read this before touching)
- **REST create/list/delete is CORS-blocked from browsers. Verified exhaustively:** preflight returns 405 with zero ACAO headers from every origin; the POST itself *executes* but the browser can't read the response (no ACAO on it either). No allow-listing exists.
- **All public CORS forwarders tested and dead:** corsproxy.io (401 paid), allorigins (timeout), thingproxy (dead), codetabs (timeout), whateverorigin (GET-only, 405 on POST), cors.lol (429), crossorigin.me (dead), r.jina.ai (timeout), cors-anywhere demo (403 needs opt-in), test.cors.workers.dev (429). **Do not ship an auto-fallback to public proxies — it cannot work.**
- Therefore: browser CAN'T spin up sessions by itself. Two working paths:
  1. **Settings → Kernel Browser → relay field** + `kernel-relay.js` (Cloudflare Worker, 2-min deploy) → full fresh-session-per-run mode, auto-used by agentBrowse + Live voice.
  2. No relay → agentBrowse falls back to in-site readers (Wikipedia/jina) with honest messaging; Live voice keeps working (chat/TTS don't need Kernel).
- CDP WebSocket + live-view iframe connect DIRECTLY (no CORS on WS/iframes) once a session exists.
- Fresh-session-per-run + delete-on-finish + limit-reclaim logic all live in `js/kernel.js` (`acquireManaged`, `runManaged` with the vanish-retry). Settings test button labels honestly.

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
