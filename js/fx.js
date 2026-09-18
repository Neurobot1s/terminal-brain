/* NeuroBot — fx.js (classic script; extends window.NB).
   Blue "paper pop" click effect: a tiny folded paper square bursts
   from every click/tap. Cheap: one element per click, self-removing,
   capped concurrency, honors reduced-motion. */
(function () {
  "use strict";

  var alive = 0, MAX = 24;
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function pop(x, y) {
    if (reduceMotion || alive >= MAX) return;
    var p = document.createElement("span");
    p.className = "paper-pop";
    /* random fold variant so pops don't look cloned */
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.setProperty("--pp-r", ((Math.random() * 90 - 45) | 0) + "deg");
    p.style.setProperty("--pp-dr", ((Math.random() * 360) | 0) + "deg");
    p.style.setProperty("--pp-d", (44 + Math.random() * 22 | 0) + "px");
    document.body.appendChild(p);
    alive++;
    p.addEventListener("animationend", function () {
      p.remove();
      alive--;
    });
    /* safety net in case animationend never fires (tab hidden etc.) */
    setTimeout(function () { if (p.parentNode) { p.remove(); alive--; } }, 900);
  }

  /* pointerdown covers mouse + touch without double-firing on tap */
  document.addEventListener("pointerdown", function (e) {
    if (e.button && e.button !== 0) return; /* left click / touch only */
    pop(e.clientX, e.clientY);
  }, { passive: true });

  /* ---------- touch: swipe-to-reveal delete on list rows ----------
     A deliberate horizontal swipe (>48px, mostly horizontal) on an
     activity/notification row slides out the delete button. A tap
     anywhere else closes any open swipe. Vertical scrolling is never
     hijacked: rows only react once horizontal intent is clear. */
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    var row = e.target.closest && e.target.closest(".activity-row, .notif-row");
    if (!row) return;
    var t = e.touches[0];
    var sx = t.clientX, sy = t.clientY, tracked = false, open = row.classList.contains("swipe-open");
    function move(ev) {
      if (!tracked) {
        var dx = ev.touches[0].clientX - sx, dy = ev.touches[0].clientY - sy;
        if (Math.abs(dx) < 14) return; /* wait for clear intent */
        if (Math.abs(dy) > Math.abs(dx)) { cleanup(); return; } /* it's a scroll */
        tracked = true;
        row.classList.add("swiping");
      }
      ev.preventDefault(); /* horizontal intent locked — own the gesture */
      var dx2 = ev.touches[0].clientX - sx;
      if (dx2 < -48) row.classList.add("swipe-open");
      else if (dx2 > 24) row.classList.remove("swipe-open");
    }
    function end() {
      row.classList.remove("swiping");
      cleanup();
    }
    function cleanup() {
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    }
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    void open;
  }, { passive: true });

  /* tapping anywhere else closes an open swipe */
  document.addEventListener("touchstart", function (e) {
    if (e.target.closest && e.target.closest(".activity-row .row-del, .notif-row .row-del")) return;
    var openRow = document.querySelector(".activity-row.swipe-open, .notif-row.swipe-open");
    if (openRow && !(e.target.closest && e.target.closest(".activity-row, .notif-row") === openRow)) {
      openRow.classList.remove("swipe-open");
    }
  }, { passive: true });
})();
