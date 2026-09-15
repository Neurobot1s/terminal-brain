/* ═══════════════════════════════════════════════════════════
   ui.js — DOM helpers, icons, toasts, modals, formatting.
   ═══════════════════════════════════════════════════════════ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/** Minimal markdown: **bold**, *italic*, `code`, line breaks preserved. */
export function mdLite(text) {
  let t = esc(text);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?])/g, "$1<em>$2</em>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  return t;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v;
    else if (k === "checked") node.checked = !!v;
    else if (k === "disabled") node.disabled = !!v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

/* ── icons (tiny inline SVGs, Lucide-style strokes) ── */

const I = (paths, viewBox = "0 0 24 24") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ico = {
  dashboard: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  brain: I('<path d="M12 4a3 3 0 0 0-3 3 3 3 0 0 0-3 3c0 1 .4 1.9 1.1 2.5A3 3 0 0 0 9 18a3 3 0 0 0 3-1 3 3 0 0 0 3 1 3 3 0 0 0 1.9-5.5A3 3 0 0 0 18 10a3 3 0 0 0-3-3 3 3 0 0 0-3-3Z"/><path d="M12 4v13"/>'),
  note: I('<path d="M5 3h11l3 3v15H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>'),
  bulb: I('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10.5c-.7.6-1 1.4-1 2.5h-6c0-1.1-.3-1.9-1-2.5A6 6 0 0 1 12 3Z"/>'),
  book: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-2.5"/>'),
  target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  share: I('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9 15.8 7.1M8.2 13.1l7.6 3.8"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  send: I('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  trash: I('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
  edit: I('<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  bell: I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
  spark: I('<path d="M12 2l1.9 5.7L20 9.6l-5.1 3.4L16 19l-4-3-4 3 1.1-6L4 9.6l6.1-1.9Z"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  check: I('<path d="m5 13 4 4L19 7"/>'),
  x: I('<path d="M18 6 6 18M6 6l12 12"/>'),
};

/* ── time formatting ── */

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDate(str) {
  if (!str) return "—";
  const d = new Date(str + (str.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d)) return str;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ── toasts ── */

export function toast(msg, type = "ok") {
  const root = $("#toast-root");
  if (!root) return;
  const t = el("div", { class: `toast ${type}` },
    el("span", { class: "ico", html: type === "err" ? ico.x : ico.check }),
    el("span", { html: mdLite(msg) })
  );
  root.append(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s, transform .25s";
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 260);
  }, 3200);
}

/* ── modal ── */

export function openModal({ title, body, foot, wide, onClose }) {
  const root = $("#modal-root");
  const backdrop = el("div", { class: "modal-backdrop" });
  const close = () => {
    backdrop.remove();
    if (onClose) onClose();
  };

  const box = el("div", { class: `modal${wide ? " wide" : ""}`, role: "dialog", "aria-modal": "true" },
    el("div", { class: "modal-head" },
      el("h3", {}, title),
      el("button", { class: "icon-btn", "aria-label": "Close", onclick: close, html: ico.x })
    ),
    el("div", { class: "modal-body" }, body),
    foot ? el("div", { class: "modal-foot" }, foot) : null
  );

  backdrop.append(box);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
  const escHandler = (e) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
  root.append(backdrop);

  const first = box.querySelector("input, textarea, select, button.btn");
  if (first) setTimeout(() => first.focus(), 60);

  return { close, box };
}

export function confirmModal(title, message, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    let decided = false;
    const foot = el("div", { style: "display:flex;gap:9px" });
    const { close } = openModal({
      title,
      body: el("p", { style: "margin:0;color:var(--muted);font-size:13.5px" }, message),
      foot,
      onClose: () => {
        if (!decided) resolve(false);
      },
    });
    foot.append(
      el("button", { class: "btn ghost", onclick: () => { decided = true; resolve(false); close(); } }, "Cancel"),
      el("button", { class: "btn danger", onclick: () => { decided = true; resolve(true); close(); } }, confirmLabel)
    );
  });
}

/* ── shared row/card builders ── */

export function field(label, input) {
  return el("label", { class: "field" }, el("span", {}, label), input);
}

export function emptyState(msg) {
  return el("div", { class: "empty" }, msg);
}
