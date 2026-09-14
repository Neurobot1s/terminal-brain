import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Terminal search input: `> query_` with blinking caret accent. */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className,
  resultCount,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  resultCount?: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15",
        className,
      )}
    >
      <span className="select-none text-primary">&gt;</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <Search className="size-3.5 text-muted-foreground" />
      )}
      {typeof resultCount === "number" && value && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {resultCount} hit{resultCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
