/**
 * My Brain — everything captured, in one searchable, filterable stream.
 */
import { useMemo, useState } from "react";
import { Brain as BrainIcon, Plus } from "lucide-react";
import { Panel, SectionHead } from "@/components/terminal";
import { SearchBar } from "@/components/SearchBar";
import {
  NoteCard,
  IdeaCard,
  GoalCard,
  KnowledgeCard,
} from "@/components/cards";
import { CaptureModal } from "@/components/capture-forms";
import { ITEM_META } from "@/config/kinds";
import { useBrainStore } from "@/components/BrainProvider";
import type { ItemKind } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Filter = "all" | ItemKind;

export default function Brain() {
  const store = useBrainStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [captureKind, setCaptureKind] = useState<ItemKind | null>(null);

  const items = useMemo(() => {
    const q = query.toLowerCase();
    const all: {
      key: string;
      kind: ItemKind;
      title: string;
      body: string;
      createdAt: number;
      render: React.ReactNode;
    }[] = [
      ...store.notes.map((n) => ({
        key: `note-${n.id}`,
        kind: "note" as const,
        title: n.title,
        body: n.body + " " + n.category,
        createdAt: n.createdAt,
        render: (
          <NoteCard
            note={n}
            onDelete={(note) => store.removeNote(note.id)}
          />
        ),
      })),
      ...store.ideas.map((i) => ({
        key: `idea-${i.id}`,
        kind: "idea" as const,
        title: i.title,
        body: i.body + " " + i.category,
        createdAt: i.createdAt,
        render: (
          <IdeaCard idea={i} onDelete={(idea) => store.removeIdea(idea.id)} />
        ),
      })),
      ...store.goals.map((g) => ({
        key: `goal-${g.id}`,
        kind: "goal" as const,
        title: g.title,
        body: g.body,
        createdAt: g.createdAt,
        render: (
          <GoalCard goal={g} onDelete={(goal) => store.removeGoal(goal.id)} />
        ),
      })),
      ...store.knowledge.map((k) => ({
        key: `k-${k.id}`,
        kind: "knowledge" as const,
        title: k.title,
        body: k.body + " " + k.topic + " " + k.source,
        createdAt: k.createdAt,
        render: (
          <KnowledgeCard
            item={k}
            onDelete={(item) => store.removeKnowledge(item.id)}
          />
        ),
      })),
    ];
    return all
      .filter((it) => filter === "all" || it.kind === filter)
      .filter((it) =>
        q ? (it.title + " " + it.body).toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [store, query, filter]);

  const counts: Record<Filter, number> = {
    all:
      store.notes.length +
      store.ideas.length +
      store.goals.length +
      store.knowledge.length,
    note: store.notes.length,
    idea: store.ideas.length,
    goal: store.goals.length,
    knowledge: store.knowledge.length,
  };

  return (
    <div className="rise space-y-5">
      <SectionHead
        title="My Brain"
        sub="every memory, one stream — newest first"
        icon={BrainIcon}
        count={counts.all}
        right={
          <Button size="sm" onClick={() => setCaptureKind("note")}>
            <Plus className="size-3.5" /> Capture
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search your brain…"
          resultCount={items.length}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "note", "idea", "goal", "knowledge"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "press rounded border px-2 py-1 text-[11px] transition-colors",
                filter === f
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {f === "all" ? "all" : ITEM_META[f].plural.toLowerCase()}
              <span className="ml-1 opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <Panel className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {query
              ? `no memories match “${query}”`
              : "your brain is empty here — capture something above"}
          </p>
        </Panel>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
          {items.map((it) => (
            <div key={it.key} className="mb-3 break-inside-avoid">
              {it.render}
            </div>
          ))}
        </div>
      )}

      {captureKind && (
        <CaptureModal
          kind={captureKind}
          open
          onOpenChange={(v) => !v && setCaptureKind(null)}
          store={store}
        />
      )}
    </div>
  );
}
