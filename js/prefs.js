/* NeuroBot — prefs.js — appearance/notification preferences (localStorage). */

const PREFS_KEY = "neurobot.v1.prefs";

const DEFAULTS = { compact: false, reduceMotion: false, theme: "dark", remind: false, digest: false };

export function loadPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  applyPrefs(p);
}

export function applyPrefs(p) {
  document.body.classList.toggle("compact", !!p.compact);
  document.body.classList.toggle("reduce-motion", !!p.reduceMotion);
  document.body.dataset.theme = p.theme || "dark";
}
