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
})();
