/**
 * React context providing a single shared useBrain() store instance to the
 * whole app, so captures from any page update the sidebar, top bar and stats
 * instantly.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useBrain, type BrainStore } from "@/lib/store";

const BrainContext = createContext<BrainStore | null>(null);

export function BrainProvider({ children }: { children: ReactNode }) {
  const store = useBrain();
  return <BrainContext.Provider value={store}>{children}</BrainContext.Provider>;
}

export function useBrainStore(): BrainStore {
  const store = useContext(BrainContext);
  if (!store) {
    throw new Error("useBrainStore must be used within <BrainProvider>");
  }
  return store;
}
