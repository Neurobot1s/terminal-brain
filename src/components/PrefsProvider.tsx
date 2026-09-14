/**
 * PrefsProvider — persisted appearance preferences (compact density, motion,
 * grid backdrop), applied via data attributes on <html> and consumed by CSS.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Prefs {
  compact: boolean;
  motion: boolean;
  grid: boolean;
}

const DEFAULTS: Prefs = { compact: false, motion: true, grid: true };
const KEY = "neurobot.prefs.v1";

interface PrefsCtx {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  reset: () => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* fall through to defaults */
  }
  return DEFAULTS;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    root.dataset.compact = prefs.compact ? "on" : "off";
    root.dataset.motion = prefs.motion ? "on" : "off";
    root.dataset.grid = prefs.grid ? "on" : "off";
  }, [prefs]);

  const setPref = useCallback(
    <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
      setPrefs((p) => ({ ...p, [key]: value })),
    [],
  );
  const reset = useCallback(() => setPrefs(DEFAULTS), []);

  return <Ctx.Provider value={{ prefs, setPref, reset }}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs must be used within <PrefsProvider>");
  return ctx;
}
