/**
 * Sidebar — collapsible terminal nav. On mobile it becomes an overlay drawer.
 * Memoized: only re-renders when collapse/drawer state, route or data changes.
 */
import { memo, useCallback } from "react";
import { Link, useLocation } from "react-router";
import { ChevronLeft, PanelLeftOpen, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, APP_NAME, TAGLINE, SESSION, OWNER_CREDIT } from "@/config/nav";
import { useBrainStore } from "@/components/BrainProvider";

const Sidebar = memo(function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  onOpenCredits,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onOpenCredits: () => void;
}) {
  const { pathname } = useLocation();
  const { notes, ideas, goals, knowledge } = useBrainStore();
  const total = notes.length + ideas.length + goals.length + knowledge.length;
  const closeMobile = useCallback(() => onMobileClose(), [onMobileClose]);
  const health = Math.min(98, 72 + total);

  const content = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded border border-primary/40 bg-primary/10 text-primary">
            <Terminal className="size-4" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight">
                {APP_NAME}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {TAGLINE}
              </span>
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          aria-label="Toggle sidebar"
          className="ml-auto hidden rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:block"
        >
          <ChevronLeft
            className={cn("size-4 transition-transform duration-300", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        {!collapsed && (
          <p className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            // navigation
          </p>
        )}
        {NAV_ITEMS.map(({ to, label, icon: Icon, glyph }) => {
          const active =
            to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={closeMobile}
              title={collapsed ? label : undefined}
              className={cn(
                "group mb-0.5 flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && (
                <span
                  className={cn(
                    "ml-auto hidden text-[9px] text-muted-foreground/50 group-hover:inline",
                    active && "inline",
                  )}
                >
                  {glyph}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Brain health */}
      <div className="border-t border-border p-3">
        {!collapsed ? (
          <div className="rounded border border-border bg-secondary/60 p-2.5">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Brain Health
              </span>
              <span className="ml-auto text-xs font-semibold text-primary">
                {health}
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${health}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              {total} memories linked · syncing locally
            </p>
          </div>
        ) : (
          <div
            className="mx-auto grid size-8 place-items-center rounded border border-primary/40 bg-primary/10 text-primary"
            title={`Brain Health ${health}`}
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          </div>
        )}

        {/* Profile */}
        <div className={cn("mt-3 flex items-center gap-2", collapsed && "justify-center")}>
          <span className="grid size-8 shrink-0 place-items-center rounded bg-primary font-mono text-xs font-bold text-primary-foreground">
            TL
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">Tanishq Lalwani</p>
              <p className="truncate text-[10px] text-muted-foreground">{SESSION}</p>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={onOpenCredits}
            title="Open credits"
            className="press mt-3 hidden w-full truncate rounded text-center text-[9px] uppercase tracking-widest text-muted-foreground/50 transition-colors hover:text-primary xl:block"
          >
            {OWNER_CREDIT}
          </button>
        )}
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mx-auto mt-2 hidden rounded p-1.5 text-muted-foreground hover:bg-secondary lg:block"
        >
          <PanelLeftOpen className="size-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar transition-[width] duration-300 lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", !mobileOpen && "pointer-events-none")}>
        <div
          onClick={onMobileClose}
          className={cn(
            "absolute inset-0 bg-foreground/20 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-64 border-r border-border bg-sidebar shadow-xl transition-transform duration-300",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {content}
        </aside>
      </div>
    </>
  );
});

export { Sidebar };
