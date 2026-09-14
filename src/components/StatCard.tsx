import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dashboard stat card — `kind: value` readout with hover lift + link. */
export function StatCard({
  icon: Icon,
  label,
  value,
  glyph,
  onClick,
  accent = "text-primary",
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  glyph: string;
  onClick?: () => void;
  accent?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "card-lift group relative block w-full rounded-lg border border-border bg-card p-4 text-left",
        onClick && "press cursor-pointer",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("grid size-7 place-items-center rounded border border-border bg-secondary", accent)}>
          <Icon className="size-3.5" />
        </span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {onClick && (
          <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-sm text-muted-foreground">$</span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground/70">{glyph}</div>
    </Comp>
  );
}
