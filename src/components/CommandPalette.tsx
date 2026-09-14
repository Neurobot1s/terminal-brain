/**
 * CommandPalette — ⌘K command bar (cmdk): navigate, capture, search memories,
 * quick actions. Terminal-styled.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  Brain,
  FileText,
  Lightbulb,
  Network,
  Radio,
  Search,
  Share2,
  Sparkles,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/config/nav";
import { useBrainStore } from "@/components/BrainProvider";
import { CaptureModal } from "@/components/capture-forms";
import { LiveModal } from "@/components/LiveModal";
import { CreditPopup } from "@/components/CreditPopup";
import { ITEM_META } from "@/config/kinds";
import type { ItemKind } from "@/lib/store";

type CaptureKind = ItemKind;

interface PaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLive: () => void;
  onOpenCredits: () => void;
}

const KIND_ROUTE: Record<ItemKind, string> = {
  note: "/notes",
  idea: "/ideas",
  goal: "/goals",
  knowledge: "/knowledge",
};

export function CommandPalette({ open, onOpenChange, onOpenLive, onOpenCredits }: PaletteProps) {
  const navigate = useNavigate();
  const store = useBrainStore();
  const [query, setQuery] = useState("");
  const [capture, setCapture] = useState<CaptureKind | null>(null);

  // Reset query when the palette closes.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    // Let the dialog unmount before navigating / opening a modal.
    setTimeout(fn, 60);
  };

  const memories = useMemo(() => {
    const q = query.toLowerCase();
    const rows: {
      id: string;
      kind: ItemKind;
      title: string;
      keywords: string;
    }[] = [
      ...store.notes.map((n) => ({ id: n.id, kind: "note" as const, title: n.title, keywords: n.category })),
      ...store.ideas.map((i) => ({ id: i.id, kind: "idea" as const, title: i.title, keywords: i.category + " " + i.status })),
      ...store.goals.map((g) => ({ id: g.id, kind: "goal" as const, title: g.title, keywords: g.status })),
      ...store.knowledge.map((k) => ({ id: k.id, kind: "knowledge" as const, title: k.title, keywords: k.topic + " " + k.source })),
    ];
    return rows
      .filter((r) => !q || (r.title + " " + r.keywords).toLowerCase().includes(q))
      .slice(0, 8);
  }, [store.notes, store.ideas, store.goals, store.knowledge, query]);

  const KIND_ICON: Record<ItemKind, LucideIcon> = {
    note: FileText,
    idea: Lightbulb,
    goal: Network,
    knowledge: Brain,
  };

  const go = (to: string) => run(() => navigate(to));

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Command palette"
        description="Navigate, capture and search your brain"
      >
        <CommandInput placeholder="Type a command or search memories…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Capture">
            {(
              [
                ["note", "New Note", "C N"],
                ["idea", "New Idea", "C I"],
                ["knowledge", "Save Thought", "C K"],
                ["goal", "Add Goal", "C G"],
              ] as [CaptureKind, string, string][]
            ).map(([kind, label, shortcut]) => {
              const Icon = ITEM_META[kind].icon;
              return (
                <CommandItem
                  key={kind}
                  value={`capture ${kind} ${label}`}
                  onSelect={() => run(() => setCapture(kind))}
                >
                  <Icon />
                  {label}
                  <CommandShortcut>{shortcut}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Navigate">
            {NAV_ITEMS.map((item) => (
              <CommandItem key={item.to} value={`go to ${item.label}`} onSelect={() => go(item.to)}>
                <item.icon />
                {item.label}
                <CommandShortcut>{item.glyph}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(onOpenLive)}>
              <Radio />
              NeuroBot Live
              <CommandShortcut>voice — soon</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(onOpenCredits)}>
              <Sparkles />
              Credits — Tanishq Lalwani
            </CommandItem>
          </CommandGroup>

          {memories.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Memories">
                {memories.map((m) => {
                  const Icon = KIND_ICON[m.kind];
                  return (
                    <CommandItem
                      key={`${m.kind}-${m.id}`}
                      value={`memory ${m.kind} ${m.title} ${m.keywords}`}
                      onSelect={() => go(KIND_ROUTE[m.kind])}
                    >
                      <Icon />
                      <span className="min-w-0 flex-1 truncate">{m.title}</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {m.kind}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Search className="size-3" /> demo scope — local data only
          </span>
          <span className="float-right inline-flex items-center gap-1">
            <Trash2 className="size-3" /> delete via cards
            <ArrowRight className="size-3" />
          </span>
        </div>
      </CommandDialog>

      {capture && (
        <CaptureModal
          kind={capture}
          open
          onOpenChange={(v) => !v && setCapture(null)}
          store={store}
        />
      )}
    </>
  );
}
