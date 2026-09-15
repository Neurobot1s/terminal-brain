# NeuroBot — Your Second Brain 🧠

A polished, personal second-brain app: capture notes, ideas, knowledge and goals,
see them on a neural knowledge graph, and **ask your brain questions** — Gemini
answers using your own memories as context.

**Crafted by TANISHQ LALWANI** ✨

Pure vanilla: HTML + CSS + JS. No build step, no frameworks, no backend, no auth.

## Run it

Just open `index.html` in a browser — that's it. It also works from any static host
(file://, GitHub Pages, InfinityFree, Netlify, …) because all scripts are classic
`<script>` tags, not ES modules.

## Deploy to InfinityFree (via GitHub)

1. Push this folder to a GitHub repo.
2. In InfinityFree's control panel, open **File Manager → htdocs**.
3. Upload these files into `htdocs/` (or use `git clone` + copy):
   - `index.html`
   - `styles.css`
   - `logo.svg`
   - the `js/` folder
4. Visit your domain. Done — it's a static app, nothing else to configure.

## Files

```
index.html            app shell (sidebar, topbar, view container)
styles.css            premium dark theme, glassmorphism, fully responsive
styles.polish.css     polish layer (shortcuts, drag states, palette nav)
logo.svg              favicon/logo
js/
  core.js             localStorage store, helpers, seed data
  core-part2.js       CRUD, modals, capture forms, neural graph (SVG)
  prefs.js            theme / density / motion preferences
  ai.js               Gemini "Ask your brain" (hardcoded key, school project)
  views-dashboard.js  hero, ask box, stat cards, graph, pinned, quick capture
  views-collections.js  My Brain / Notes / Knowledge / Goals
  views-kanban.js     Ideas board (drag & drop between columns)
  views-misc.js       Connections, Settings (import/export), Credits / Live / NeuroVision
  main.js             hash router, palette (Ctrl+K + arrows), shortcuts (?), g-nav
  terminal.js         in-app console: help, ls, find, cd, new, ask, theme, stats…
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
- **Ask (Gemini)** — every page's ✦ Ask button and the Ctrl+K palette feed your
  real memories to Gemini (free-tier flash models with automatic fallback).
  100 asks per session to protect the quota.
- **Extras** — Credits popup (crafted by Tanishq Lalwani), Live voice modal
  (coming soon), brain-health indicator, collapsible sidebar, fully responsive
  with mobile drawer, toasts.
- **Keyboard** — Ctrl+K palette with arrow-key nav and actions, `?` shortcuts
  modal, `g`+key page jumps, `N`/`I`/`G` quick capture, `` ` `` terminal.
- **In-app terminal** — drop-down console with working commands (`help`, `ls`,
  `find`, `cd`, `new`, `ask`, `theme`, `stats`, `export`, `history`, `sudo`).
- **Data portability** — JSON export **and** validated JSON import in Settings.
- **Living graph** — neural-network node sizes reflect your real memory counts;
  edges pulse with an animated flow. Hover nodes for per-topic totals.

## Notes

- All data lives in `localStorage` on the device — nothing is sent anywhere except
  your question + relevant memory text when you use Ask.
- The neural graph is a visual prototype; connections are illustrative, not AI-generated.
