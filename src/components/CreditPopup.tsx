import { BadgeCheck, Terminal } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/terminal";
import { APP_NAME, TAGLINE, SESSION } from "@/config/nav";

/**
 * CreditPopup — "Crafted by TANISHQ LALWANI" popup. Opened from the top bar
 * credit button; also makes the sidebar credit line clickable via onOpen.
 */
export function CreditPopup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Credits"
      subtitle="$ neurobot credits --show"
    >
      <div className="text-center">
        {/* Logo row */}
        <div className="mx-auto flex items-center justify-center gap-2.5">
          <span className="grid size-10 place-items-center rounded border border-primary/40 bg-primary/10 text-primary">
            <Terminal className="size-5" />
          </span>
          <div className="text-left">
            <p className="text-sm font-bold leading-tight">{APP_NAME}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {TAGLINE}
            </p>
          </div>
        </div>

        {/* Credit block */}
        <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            crafted by
          </p>
          <p className="mt-1 text-lg font-bold tracking-tight text-primary">
            TANISHQ LALWANI
            <span className="blink ml-0.5 select-none">▍</span>
          </p>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <BadgeCheck className="size-3.5 text-primary" />
            designer &amp; builder of this second brain
          </div>
        </div>

        {/* Session meta */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          <Chip tone="green">{SESSION}</Chip>
          <Chip tone="gray">frontend · phase 1</Chip>
          <Chip tone="amber">local-first</Chip>
        </div>

        {/* Terminal footer line */}
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          <span className="text-primary">$</span> whoami
          <span className="mx-2 text-border">→</span>
          tanishq
        </p>

        <Button
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </div>
    </Modal>
  );
}
