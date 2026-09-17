# NeuroBot — Agent Handoff

**Live site:** https://neurobot1s.github.io/terminal-brain/#/
**Stack:** pure vanilla HTML/CSS/JS, classic `<script>` tags, no build step. GitHub Pages (branch `main`, root). Owner: Tanishq Lalwani.

## Current state (2026-09-17) — ALL GREEN
All 5 test suites pass: `boot`, `routes`, `interact` (×3 stable), `live` (28 checks), `ai`. 23/23 E2E at the production origin (jsdom harness `/tmp/nb-e2e.js` — temp, not in repo). All 12 JS files syntax-clean. Nothing pending.

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
