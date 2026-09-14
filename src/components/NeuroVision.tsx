/**
 * NeuroVision — dashboard teaser card. Clicking "Try NeuroVision" shows a
 * coming-soon toast. No screen capture is implemented (Phase 1).
 */
import { Monitor, ScanEye } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/terminal";
import { Button } from "@/components/ui/button";

export function NeuroVisionCard() {
  return (
    <Panel className="card-lift relative overflow-hidden p-5">
      <div className="term-dots pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded border border-amber-term/40 bg-amber-term/10 text-amber-strong">
            <ScanEye className="size-4" />
          </span>
          <h3 className="text-sm font-bold tracking-tight">NeuroVision</h3>
          <span className="ml-auto rounded border border-border bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
            beta
          </span>
        </div>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Let NeuroBot understand what's on your screen.
        </p>
        <Button
          size="sm"
          className="mt-4"
          onClick={() =>
            toast.info("NeuroVision is coming soon.", {
              description: "Screen understanding ships in a later phase — nothing is captured yet.",
            })
          }
        >
          <Monitor className="size-3.5" />
          Try NeuroVision
        </Button>
      </div>
    </Panel>
  );
}
