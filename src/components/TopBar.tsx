/**
 * TopBar — search/command trigger (⌘K), Live button, credits, notifications,
 * profile. Global hotkeys: ⌘K palette, c n/i/k/g capture, ? shortcuts help.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Bell,
  CircleDot,
  Command as CommandIcon,
  Keyboard,
  Menu,
  Radio,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrainStore } from "@/components/BrainProvider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { LiveModal } from "@/components/LiveModal";
import { CommandPalette } from "@/components/CommandPalette";
import { Chip } from "@/components/terminal";
import type { ItemKind } from "@/lib/store";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["⌘", "K"], desc: "Open command palette" },
  { keys: ["C", "N"], desc: "New note" },
  { keys: ["C", "I"], desc: "New idea" },
  { keys: ["C", "K"], desc: "Save a thought" },
  { keys: ["C", "G"], desc: "Add a goal" },
  { keys: ["?"], desc: "Show this help" },
  { keys: ["Esc"], desc: "Close dialogs" },
];

export const TopBar = memo(function TopBar({
  onMenu,
  onOpenCredits,
}: {
  onMenu: () => void;
  onOpenCredits: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const { activity } = useBrainStore();

  const openPalette = useCallback(() => setSearchOpen(true), []);
  const closeNotif = useCallback(() => setNotifOpen(false), []);

  // Global hotkeys.
  useEffect(() => {
    let seq = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setNotifOpen(false);
        setHelpOpen(false);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        setHelpOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "c") {
        seq = "c";
        clearTimeout(timer);
        timer = setTimeout(() => (seq = ""), 1200);
        return;
      }
      if (seq === "c") {
        const map: Record<string, ItemKind> = {
          n: "note",
          i: "idea",
          k: "knowledge",
          g: "goal",
        };
        const kind = map[e.key.toLowerCase()];
        seq = "";
        if (kind) {
          e.preventDefault();
          // Navigate to the page with a fresh-capture hash signal.
          const route: Record<ItemKind, string> = {
            note: "/notes",
            idea: "/ideas",
            goal: "/goals",
            knowledge: "/knowledge",
          };
          navigate(`${route[kind]}?capture=${kind}`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [navigate]);

  const recent = useMemo(() => activity.slice(0, 3), [activity]);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background px-3 sm:px-5">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="press rounded p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        {/* Command palette trigger */}
        <button
          onClick={openPalette}
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

          {/* Shortcuts help */}
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="press hidden rounded p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:block"
          >
            <Keyboard className="size-4" />
          </button>

          {/* Credits */}
          <button
            onClick={onOpenCredits}
            aria-label="Credits — crafted by Tanishq Lalwani"
            title="Credits — crafted by Tanishq Lalwani"
            className="press hidden items-center gap-1.5 rounded border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-widest text-primary transition-colors hover:bg-primary/10 md:flex"
          >
            <Sparkles className="size-3" />
            Credits
          </button>

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
                <div className="fixed inset-0 z-30" onClick={closeNotif} />
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

      {/* Command palette */}
      <CommandPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onOpenLive={() => setLiveOpen(true)}
        onOpenCredits={onOpenCredits}
      />

      {/* Shortcuts help */}
      <Modal
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Keyboard shortcuts"
        subtitle="$ neurobot keys --list"
      >
        <div className="divide-y divide-border/60">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
              <span className="text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground/70">
          <CommandIcon className="mr-1 inline size-3" />
          press keys sequentially — e.g. C then N for a new note
        </p>
      </Modal>

      {/* Live modal */}
      <LiveModal open={liveOpen} onOpenChange={setLiveOpen} />
    </>
  );
});
