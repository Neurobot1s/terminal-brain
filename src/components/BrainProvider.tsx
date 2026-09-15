/**
 * React context providing a single shared brain store instance to the whole
 * app, so captures from any page update the sidebar, top bar and stats
 * instantly. Backed by the Convex database (was localStorage in earlier
 * phases) — every consumer keeps the same call signatures.
 */
import { createContext, useContext, type ReactNode } from "react";
import {
  useBrainConvex,
  type BrainClientStore,
} from "@/lib/brainClient";

const BrainContext = createContext<BrainClientStore | null>(null);

export function BrainProvider({ children }: { children: ReactNode }) {
  const store = useBrainConvex();
  return <BrainContext.Provider value={store}>{children}</BrainContext.Provider>;
}

export function useBrainStore(): BrainClientStore {
  const store = useContext(BrainContext);
  if (!store) {
    throw new Error("useBrainStore must be used within <BrainProvider>");
  }
  return store;
}
