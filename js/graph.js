/* ═══════════════════════════════════════════════════════════
   graph.js — neural network visualization (visual demo only).
   Curved connections + gentle drift + hover glow. Pure canvas.
   ═════════════════════════════════ raph data ═══════════════════════════════ */

const DEMO_NODES = [
  { id: "ai", label: "Artificial Intelligence", x: 0.50, y: 0.42, r: 30, color: "#7c9cff" },
  { id: "ml", label: "Machine Learning", x: 0.26, y: 0.28, r: 22, color: "#a88bff" },
  { id: "prog", label: "Programming", x: 0.75, y: 0.24, r: 22, color: "#4ade80" },
  { id: "nb", label: "NeuroBot", x: 0.50, y: 0.14, r: 20, color: "#fbbf24" },
  { id: "entre", label: "Entrepreneurship", x: 0.76, y: 0.66, r: 20, color: "#f87171" },
  { id: "edu", label: "Education", x: 0.24, y: 0.70, r: 20, color: "#38bdf8" },
];

const DEMO_EDGES = [
  ["ai", "ml"], ["ai", "prog"], ["ai", "nb"], ["ai", "entre"], ["ai", "edu"],
  ["ml", "edu"], ["prog", "entre"], ["nb", "prog"], ["ml", "nb"], ["edu", "entre"],
];

let hovered = null;
let raf = null;

export function mountGraph(container, opts = {}) {
  const height = opts.height || 380;
  const wrap = document.createElement("div");
  wrap.className = "graph-wrap";
  const canvas = document.createElement("canvas");
  wrap.append(canvas);
  if (opts.legend !== false) {
    const legend = document.createElement("div");
    legend.className = "graph-legend";
    for (const n of DEMO_NODES) {
      const s = document.createElement("span");
      const i = document.createElement("i");
      i.style.background = n.color;
      s.append(i, document.createTextNode(n.label));
      legend.append(s);
    }
    wrap.append(legend);
  }
  container.append(wrap);

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = wrap.clientWidth;
    H = height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  const mouse = { x: -999, y: -999 };

  function nodePos(n) {
    return {
      x: n.x * W + Math.sin(Date.now() / 1600 + n.x * 7) * 6,
      y: n.y * H + Math.cos(Date.now() / 1900 + n.y * 5) * 5,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // curved edges
    for (const [a, b] of DEMO_EDGES) {
      const na = nodePos(DEMO_NODES.find((n) => n.id === a));
      const nb = nodePos(DEMO_NODES.find((n) => n.id === b));
      const mx = (na.x + nb.x) / 2;
      const my = (na.y + nb.y) / 2;
      const dx = nb.x - na.x, dy = nb.y - na.y;
      const nx = -dy, ny = dx;
      const len = Math.hypot(nx, ny) || 1;
      const cx = mx + (nx / len) * 26;
      const cy = my + (ny / len) * 26;

      const active = hovered === a || hovered === b;
      const grad = ctx.createLinearGradient(na.x, na.y, nb.x, nb.y);
      grad.addColorStop(0, active ? "rgba(124,156,255,.75)" : "rgba(124,156,255,.22)");
      grad.addColorStop(1, active ? "rgba(168,139,255,.65)" : "rgba(168,139,255,.16)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = active ? 2.1 : 1.1;
      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.quadraticCurveTo(cx, cy, nb.x, nb.y);
      ctx.stroke();

      // traveling pulse
      const t = ((Date.now() / 2200) + (a.length + b.length) * 0.09) % 1;
      const px = (1 - t) * (1 - t) * na.x + 2 * (1 - t) * t * cx + t * t * nb.x;
      const py = (1 - t) * (1 - t) * na.y + 2 * (1 - t) * t * cy + t * t * nb.y;
      ctx.beginPath();
      ctx.arc(px, py, active ? 2.6 : 1.6, 0, Math.PI * 2);
      ctx.fillStyle = active ? "rgba(200,215,255,.95)" : "rgba(180,200,255,.5)";
      ctx.fill();
    }

    // nodes
    for (const n of DEMO_NODES) {
      const p = nodePos(n);
      const isHover = hovered === n.id;
      const r = n.r * (isHover ? 1.12 : 1);

      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
      glow.addColorStop(0, n.color + (isHover ? "66" : "2e"));
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(13,17,28,.9)";
      ctx.fill();
      ctx.strokeStyle = isHover ? n.color : n.color + "aa";
      ctx.lineWidth = isHover ? 2.4 : 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();

      ctx.font = `${isHover ? 600 : 500} ${isHover ? 12.5 : 11.5}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = isHover ? "#fff" : "rgba(232,236,244,.85)";
      ctx.fillText(n.label, p.x, p.y + r + 16);
    }

    raf = requestAnimationFrame(draw);
  }

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    hovered = null;
    canvas.style.cursor = "default";
    for (const n of DEMO_NODES) {
      const p = nodePos(n);
      if (Math.hypot(mx - p.x, my - p.y) < n.r + 8) {
        hovered = n.id;
        canvas.style.cursor = "pointer";
        break;
      }
    }
  });
  canvas.addEventListener("mouseleave", () => { hovered = null; });

  raf = requestAnimationFrame(draw);
  const stop = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };

  // auto-stop when the page is torn down
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      stop();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return stop;
}
