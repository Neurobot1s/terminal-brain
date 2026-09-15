/* NeuroBot — prefs.js (classic script; extends window.NB). */
(function () {
  "use strict";
  if (!window.NB) return;

  var PREFS_KEY = "neurobot.v1.prefs";
  var DEFAULTS = { compact: false, reduceMotion: false, theme: "dark", remind: false, digest: false };

  NB.loadPrefs = function () {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  };

  NB.savePrefs = function (p) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    NB.applyPrefs(p);
  };

  NB.applyPrefs = function (p) {
    document.body.classList.toggle("compact", !!p.compact);
    document.body.classList.toggle("reduce-motion", !!p.reduceMotion);
    document.body.setAttribute("data-theme", p.theme || "dark");
  };
})();
