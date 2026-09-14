/**
 * Shared terminal-identity primitives used across all pages and components.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ITEM_META } from "@/config/kinds";
import type { ItemKind } from "@/lib/store";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card shadow-[0_1px_2px_oklch(0.27_0.02_132/0.05)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Terminal window chrome: traffic dots + optional title + right slot. */
export function TermWindow({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Panel className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-2 border-b border-border/80 bg-secondary/60 px-3 py-2">
        <span className="flex gap-1.5">
          <i className="size-2 rounded-full bg-border" />
          <i className="size-2 rounded-full bg-border" />
          <i className="size-2 rounded-full bg-border" />
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-1">{right}</span>
      </div>
      <div className={bodyClassName}>{children}</div>
    </Panel>
  );
}

/** Terminal-style section heading: `## title` with a rule and optional badge. */
export function SectionHead({
  title,
  sub,
  icon: Icon,
  count,
  right,
}: {
  title: string;
  sub?: string;
  icon?: LucideIcon;
  count?: number;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-primary" />}
          <h2 className="text-lg font-semibold tracking-tight">
            <span className="text-primary">##</span> {title}
          </h2>
          {typeof count === "number" && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {sub && (
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        )}
      </div>
      {right}
    </div>
  );
}

/** Small monospace status chip. */
export function Chip({
  children,
  tone = "green",
  className,
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "cyan" | "violet" | "rose" | "gray";
  className?: string;
}) {
  const tones: Record<string, string> = {
    green: "border-primary/30 bg-primary/10 text-primary",
    amber: "border-amber-term/40 bg-amber-term/10 text-amber-strong",
    cyan: "border-term-cyan/30 bg-term-cyan/10 text-term-cyan",
    violet: "border-term-violet/30 bg-term-violet/10 text-term-violet",
    rose: "border-term-rose/30 bg-term-rose/10 text-term-rose",
    gray: "border-border bg-secondary text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** [ ] / [x] checkbox line with label — for settings. */
export function CheckLine({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2.5">
      <span
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px] leading-none press",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card",
        )}
      >
        {checked ? "✓" : ""}
      </span>
      <span>
        <span className="block text-sm">{label}</span>
        {desc && (
          <span className="block text-xs text-muted-foreground">{desc}</span>
        )}
      </span>
    </label>
  );
}

/** `>` prefixed list line that highlights on hover. */
export function TermLine({
  icon: Icon,
  children,
  onClick,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 px-3 py-2 text-sm",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <span className="select-none text-muted-foreground/60 group-hover:text-primary">
        &gt;
      </span>
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

/** Kind chip (note/idea/goal/knowledge) with icon + tone. */
export function KindChip({ kind }: { kind: ItemKind }) {
  const meta = ITEM_META[kind];
  const Icon = meta.icon;
  return (
    <Chip tone={meta.tone}>
      <Icon className="size-3" />
      {meta.label}
    </Chip>
  );
}

export function StatusDot({
  tone = "green",
  pulse = false,
  className,
}: {
  tone?: "green" | "amber" | "rose";
  pulse?: boolean;
  className?: string;
}) {
  const tones = {
    green: "bg-primary text-primary",
    amber: "bg-amber-term text-amber-term",
    rose: "bg-term-rose text-term-rose",
  } as const;
  return (
    <span
      className={cn(
        "relative inline-block size-1.5 rounded-full",
        pulse && "pulse-dot",
        tones[tone],
        className,
      )}
    />
  );
}
