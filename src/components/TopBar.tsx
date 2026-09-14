/**
 * TopBar — search/command trigger (⌘K), Live button, notifications, profile.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Bell,
  CircleDot,
  Menu,
  Search,
  Radio,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/config/nav";
import { useBrainStore } from "@/components/BrainProvider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { SearchBar } from "@/components/SearchBar";
import { LiveModal } from "@/components/LiveModal";
import { Chip } from "@/components/terminal";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { notes, ideas, goals, knowledge, activity } = useBrainStore();

  // ⌘K / Ctrl+K opens the command search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pages = NAV_ITEMS.filter((n) =>
    n.label.toLowerCase().includes(query.toLowerCase()),
  );
  const allItems = [
    ...notes.map((n) => ({ kind: "note" as const, title: n.title, id: n.id })),
    ...ideas.map((i) => ({ kind: "idea" as const, title: i.title, id: i.id })),
    ...goals.map((g) => ({ kind: "goal" as const, title: g.title, id: g.id })),
    ...knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, id: k.id })),
  ].filter((it) => it.title.toLowerCase().includes(query.toLowerCase()));

  const kindRoute: Record<string, string> = {
    note: "/notes",
    idea: "/ideas",
    goal: "/goals",
    knowledge: "/knowledge",
  };

  const recent = activity.slice(0, 3);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-5">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="press rounded p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <Menu className="size-4.5" />
        </button>

        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="press flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 sm:max-w-sm"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="truncate">Ask your brain anything…</span>
          <span className="ml-auto hidden items-center gap-0.5 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Live button */}
          <Button
            size="sm"
            onClick={() => setLiveOpen(true)}
            className="press gap-1.5"
          >
            <Radio className="size-3.5" />
            <span className="hidden sm:inline">Live</span>
            <span className="relative flex size-1.5 sm:hidden">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary-foreground" />
            </span>
          </Button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notifications"
              className={cn(
                "press relative rounded p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                notifOpen && "bg-secondary text-foreground",
              )}
            >
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-amber-term" />
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-border bg-popover shadow-xl">
                  <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    notifications
                  </div>
                  <ul className="py-1">
                    {recent.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/60"
                      >
                        <CircleDot className="size-3 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      </li>
                    ))}
                    {recent.length === 0 && (
                      <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                        all quiet — nothing new
                      </li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* Profile avatar */}
          <Link
            to="/settings"
            aria-label="Profile settings"
            className="press grid size-8 place-items-center rounded bg-primary font-mono text-[11px] font-bold text-primary-foreground transition-transform hover:scale-105"
          >
            TL
          </Link>
        </div>
      </header>

      {/* Command search modal */}
      <Modal
        open={searchOpen}
        onOpenChange={(v) => {
          setSearchOpen(v);
          if (!v) setQuery("");
        }}
        title="Search"
        subtitle="$ neurobot query --ui"
      >
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search pages, notes, ideas, goals, knowledge…"
        />
        <div className="mt-3 max-h-80 space-y-3 overflow-y-auto scrollbar-thin">
          {pages.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">pages</p>
              {pages.map((p) => {
                const Icon: LucideIcon = p.icon;
                return (
                  <Link
                    key={p.to}
                    to={p.to}
                    onClick={() => setSearchOpen(false)}
                    className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Icon className="size-3.5 text-muted-foreground" />
                    {p.label}
                    <span className="ml-auto text-[10px] text-muted-foreground/60">{p.glyph}</span>
                  </Link>
                );
              })}
            </div>
          )}
          {allItems.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                memories
              </p>
              {allItems.slice(0, 8).map((it) => (
                <Link
                  key={`${it.kind}-${it.id}`}
                  to={kindRoute[it.kind]}
                  onClick={() => setSearchOpen(false)}
                  className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Chip tone="gray">{it.kind}</Chip>
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                </Link>
              ))}
            </div>
          )}
          {pages.length === 0 && allItems.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              no matches for “{query}”
            </p>
          )}
        </div>
        <p className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground/70">
          demo scope — search runs against locally captured data only
        </p>
      </Modal>

      {/* Live modal */}
      <LiveModal open={liveOpen} onOpenChange={setLiveOpen} />
    </>
  );
}
