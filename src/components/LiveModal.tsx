import { Mic } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";

/**
 * NeuroBot Live — coming soon. Real-time voice conversations are not built
 * yet; this is a polished teaser with a mic equalizer animation.
 */
export function LiveModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="NeuroBot Live"
      subtitle="$ neurobot live --voice"
    >
      <div className="flex flex-col items-center py-4 text-center">
        {/* Mic visual */}
        <div className="relative grid size-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
          <span className="absolute inset-2 rounded-full border border-primary/30" />
          <span className="grid size-14 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
            <Mic className="size-6" />
          </span>
        </div>

        {/* Equalizer bars */}
        <div className="mt-5 flex h-8 items-end gap-1" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="mic-bar w-1 rounded-full bg-primary/70"
              style={{
                height: "100%",
                animationDelay: `${i * 0.12}s`,
                animationDuration: `${0.9 + (i % 3) * 0.25}s`,
              }}
            />
          ))}
        </div>

        <h3 className="mt-5 text-lg font-bold tracking-tight">NeuroBot Live</h3>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Real-time voice conversations are coming soon.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded border border-amber-term/40 bg-amber-term/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-amber-strong">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-term opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-amber-term" />
          </span>
          status: in development
        </div>

        <Button className="mt-5" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Back to my brain
        </Button>
      </div>
    </Modal>
  );
}
