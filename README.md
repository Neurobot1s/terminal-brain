# NeuroBot — Your Second Brain 🧠

**Live: https://neurobot1s.github.io/terminal-brain/#/**

A polished, personal second-brain app: capture notes, ideas, knowledge and goals,
see them on a neural knowledge graph, and **ask your brain questions** — NVIDIA
Nemotron (via OpenRouter) answers using your own memories as context.

**Crafted by TANISHQ LALWANI** ✨

Pure vanilla: HTML + CSS + JS. No build step, no frameworks, no backend, no auth —
**perfect for GitHub Pages**.

## Run it

Just open `index.html` in a browser — that's it. It also works from any static host
(file://, GitHub Pages, Netlify, …) because all scripts are classic
`<script>` tags, not ES modules, and all asset paths are relative.

## Deploy to GitHub Pages

1. Push this repo to GitHub (`.env*` and `tests/` are gitignored/dev-only).
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: `main` / `/(root)` → Save.
3. Your site is live at `https://<user>.github.io/<repo>/` in a minute or two.

No build step, no workflow file, no server needed — the AI calls OpenRouter
(which serves the NVIDIA Nemotron models) directly from the browser
(`Access-Control-Allow-Origin: *`), so a pure-static host is all it takes.

**Check AI works:** open the site, press `` ` `` and run `aitest` — you should
see `✓ AI connection OK (OpenRouter → nvidia/…)`. If it reports no key, paste a
FREE one from [openrouter.ai/keys](https://openrouter.ai/keys) in
Settings → AI Connection (stored on your device only).

## Files

```
index.html            app shell (sidebar, topbar, view container)
styles.css            premium dark theme, glassmorphism, fully responsive
styles.polish.css     polish layer (shortcuts, drag states, palette nav)
styles.perf.css       performance overrides, click effect, responsive fixes
logo.svg              favicon/logo
js/
  core.js             localStorage store, helpers, seed data
  core-part2.js       CRUD, modals, capture forms, neural graph (SVG)
  prefs.js            theme / density / motion preferences
  ai.js               "Ask your brain" — browser-direct calls to OpenRouter (NVIDIA models)
  views-dashboard.js  hero, ask box (inline AI chat), stat cards, graph, pinned, quick capture
  views-collections.js  My Brain / Notes / Knowledge / Goals
  views-kanban.js     Ideas board (drag & drop between columns)
  views-misc.js       Connections, Settings (import/export, AI panel), Credits / Live / NeuroVision
  main.js             hash router, palette (Ctrl+K + arrows), shortcuts (?), g-nav
  terminal.js         in-app console: help, ls, find, cd, new, ask, py, theme, stats…
  fx.js               blue paper-pop click effect
```

## Features

- **Dashboard** — greeting hero, "Ask your brain anything…" box, live stat cards,
  neural network graph (visual demo), Quick Capture (note/idea/thought/goal),
  NeuroVision teaser, recent activity with delete.
- **My Brain** — search + filter everything at once.
- **Notes** — create, edit, delete, search, categorize; pin favorites.
- **Ideas** — kanban board: New → Exploring → Building → Completed.
- **Knowledge** — cards grouped by topic (AI, Programming, Science, Business, Education).
- **Goals** — progress bars, ±10% buttons, deadlines, overdue warnings.
- **Connections** — bigger neural graph with explainer side panel.
- **Settings** — 3 themes, compact density, reduce motion, JSON export,
  reset demo / erase all, privacy and about.
- **Ask (AI)** — the dashboard box is a real inline chat: answers appear as
  bubbles right under the input. Every page's ✦ Ask button and the Ctrl+K
  palette feed your real memories to **NVIDIA Nemotron via OpenRouter** with
  **browser-direct calls** — no server, no PHP, works on GitHub Pages.
  Paste your free key in Settings → AI Connection or the terminal `key`
  command (stored on your device only). 100 asks per session.
- **AI Connection panel (Settings)** — switch the model (saved per-device
  via localStorage), test the connection, see live diagnostics
  (protocol / key in use / model), optional key override.
- **Extras** — Credits popup (crafted by Tanishq Lalwani), Live voice modal
  (coming soon), brain-health indicator, collapsible sidebar, fully responsive
  with mobile drawer, toasts.
- **Keyboard** — Ctrl+K palette with arrow-key nav and actions, `?` shortcuts
  modal, `g`+key page jumps, `N`/`I`/`G` quick capture, `` ` `` terminal.
- **In-app terminal** — drop-down console with working commands (`help`,
  `ls`, `find`, `cd`, `new`, `ask`, `print`, `py` (mini Python with
  print/math/vars), `theme`, `stats`, `export`, `history`, `key`, `aitest`,
  `model lightning|super|nano`, `sudo`).
- **Data portability** — JSON export **and** validated JSON import in Settings.
- **Living graph** — neural-network node sizes reflect your real memory counts;
  edges pulse with an animated flow. Hover nodes for per-topic totals.

## Tests

Optional (not needed to run the app): two jsdom test suites verify the app really
boots and every route renders:

```bash
npm install jsdom --no-save   # anywhere with node
node tests/boot.test.js       # 10 checks: boot, CRUD, modals, terminal, py, click fx
node tests/routes.test.js     # 16 checks: every page renders, kanban, graph, panels
```

Don't upload the `tests/` folder to htdocs — it's for development only.

## Notes- All data lives in `localStorage` on the device — nothing is sent anywhere except
  your question + relevant memory text when you use Ask (which goes from your
  browser to OpenRouter over HTTPS, which routes to NVIDIA).
- No key is embedded anywhere. Paste your free OpenRouter key in
  Settings → AI Connection or the terminal `key` command — it is stored only
  on your device (localStorage).
- The neural graph is a visual prototype; connections are illustrative, not AI-generated.
