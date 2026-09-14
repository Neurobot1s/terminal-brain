/**
 * QuickCapture — prominent capture panel. Each button opens a functional
 * modal form persisted to localStorage.
 */
import { useState } from "react";
import { FilePlus2, Lightbulb, Plus, Sparkles, Target } from "lucide-react";
import { Panel } from "@/components/terminal";
import { CaptureModal } from "@/components/capture-forms";
import type { BrainStore } from "@/lib/store";
import type { ItemKind } from "@/lib/store";

const ACTIONS: {
  kind: ItemKind;
  label: string;
  icon: typeof Plus;
  hint: string;
}[] = [
  { kind: "note", label: "New Note", icon: FilePlus2, hint: "n" },
  { kind: "idea", label: "New Idea", icon: Lightbulb, hint: "i" },
  { kind: "knowledge", label: "Save Thought", icon: Sparkles, hint: "k" },
  { kind: "goal", label: "Add Goal", icon: Target, hint: "g" },
];

export function QuickCapture({ store }: { store: BrainStore }) {
  const [modal, setModal] = useState<ItemKind | null>(null);

  return (
    <>
      <Panel className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Quick Capture</h3>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
            saved locally
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {ACTIONS.map(({ kind, label, icon: Icon, hint }) => (
            <button
              key={kind}
              onClick={() => setModal(kind)}
              className="press group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-3 text-center transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
              <span className="text-xs font-medium">{label}</span>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60">
                press {hint}
              </span>
            </button>
          ))}
        </div>
      </Panel>
      {modal && (
        <CaptureModal
          kind={modal}
          open
          onOpenChange={(v) => !v && setModal(null)}
          store={store}
        />
      )}
    </>
  );
}
