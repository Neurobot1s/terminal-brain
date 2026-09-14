import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Terminal-light modal: soft backdrop blur, crisp 1px borders, smooth scale
 * transition. Composes Radix Dialog for focus trapping and a11y.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card shadow-2xl outline-none",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150",
            className,
          )}
        >
          <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
            <span className="flex gap-1.5">
              <i className="size-2 rounded-full bg-border" />
              <i className="size-2 rounded-full bg-border" />
              <i className="size-2 rounded-full bg-border" />
            </span>
            <span className="truncate text-xs text-muted-foreground">{subtitle ?? "neurobot"}</span>
            <Dialog.Close className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <X className="size-3.5" />
            </Dialog.Close>
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          </div>
          <div className="px-4 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
