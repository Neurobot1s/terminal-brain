# NeuroBot — Your Second Brain

A polished, fully **vanilla** second-brain web app. Pure **HTML + CSS + JavaScript** — no build step, no framework, no database, no auth. All data lives in your browser's localStorage. "Ask your brain" is powered by **Google Gemini** (free tier).

## Run it locally

Just open `index.html` in a browser — or serve the folder (recommended so ES modules load cleanly):

```bash
npx serve .
# or: python3 -m http.server 8080
```

## Deploy free (InfinityFree via GitHub)

1. Push this folder to a GitHub repo.
2. On InfinityFree, create a hosting account + (sub)domain and open the **File Manager** (or FTP).
3. Easiest path: upload this repo as a ZIP through File Manager into `htdocs/` and extract — `index.html` must sit directly inside `htdocs/`.
   - Or connect GitHub via a deploy service (e.g. GitHub Actions with FTP) that mirrors the repo into `htdocs/`.
4. Visit your free domain. Done — it's all static files, so nothing else to configure.

> Works identically on any static host: Netlify, Vercel, GitHub Pages, etc.

## Features

- **Dashboard** — greeting hero, "Ask your brain anything…" box (Gemini-backed), stat cards, neural graph (visual demo), Quick Capture, NeuroVision card, recent activity
- **My Brain** — search/filter across every memory
- **Notes / Ideas (kanban) / Knowledge (topic groups) / Goals (progress bars)** — full CRUD, pinning, localStorage persistence
- **Connections** — knowledge-graph prototype with side panel
- **Settings** — themes (dark / midnight / forest), compact density, reduce motion, JSON export, reset/erase
- **Command palette** — `Ctrl+K`; capture shortcuts `C N / C I / C K / C G`; `?` for help
- **Live & NeuroVision** — polished "coming soon" modals
- Fully responsive: desktop, tablet, mobile (bottom nav)

## Gemini ("Ask your brain")

- Model: `gemini-2.0-flash` with automatic fallback to other free Flash models
- Your brain's memories are sent as context; answers are grounded in your data only
- API key is hardcoded in `js/ai.js` (fine for a school project — don't do this in production)
- A soft in-session cap (100 asks) protects the free quota

## Project structure

```
index.html            # single-page shell
styles.css            # theme + all styling
logo.svg
js/
  core.js             # store (localStorage), modals, toasts, capture forms, graph, hotkeys
  prefs.js            # theme/density preferences
  ai.js               # Gemini integration + Ask modal
  views-dashboard.js  # Dashboard page
  views-collections.js# My Brain / Notes / Ideas / Knowledge / Goals
  views-misc.js       # Connections / Settings + Credits/Live/NeuroVision modals
  main.js             # router, chrome, command palette, boot
```

---

Crafted by **Tanishq Lalwani**
