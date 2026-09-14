/**
 * Knowledge — cards grouped by topic: AI, Programming, Science, Business,
 * Education (+ any custom topics captured).
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Share2 } from "lucide-react";
import { Plus } from "lucide-react";
import { KnowledgeCard } from "@/components/cards";
import { CaptureModal } from "@/components/capture-forms";
import { SearchBar } from "@/components/SearchBar";
import { Panel, SectionHead, Chip } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { useBrainStore } from "@/components/BrainProvider";
import { KNOWLEDGE_TOPICS } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Knowledge() {
  const store = useBrainStore();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();

  // Deep link: /knowledge?capture=knowledge opens the create modal (derived, no effect).
  const deepLink = params.get("capture") === "knowledge";
  const createOpen = creating || deepLink;

  const topics = useMemo(() => {
    const present = new Set(store.knowledge.map((k) => k.topic));
    return KNOWLEDGE_TOPICS.filter((t) => present.has(t));
  }, [store.knowledge]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return store.knowledge
      .filter((k) => topic === "all" || k.topic === topic)
      .filter((k) =>
        q ? (k.title + " " + k.body + " " + k.source).toLowerCase().includes(q) : true,
      )
      .sort(
        (a, b) =>
          Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.createdAt - a.createdAt,
      );
  }, [store.knowledge, query, topic]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const k of filtered) {
      if (!map.has(k.topic)) map.set(k.topic, []);
      map.get(k.topic)!.push(k);
    }
    return map;
  }, [filtered]);

  return (
    <div className="rise space-y-5">
      <SectionHead
        title="Knowledge"
        sub="distilled concepts, grouped by topic"
        icon={Share2}
        count={store.knowledge.length}
        right={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> Save Thought
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search knowledge…"
          resultCount={filtered.length}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTopic("all")}
            className={cn(
              "press rounded border px-2 py-1 text-[11px] transition-colors",
              topic === "all"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            all
          </button>
          {topics.map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={cn(
                "press rounded border px-2 py-1 text-[11px] transition-colors",
                topic === t
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {t.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {query || topic !== "all"
              ? "no knowledge matches — adjust filters"
              : "nothing distilled yet — capture knowledge from the dashboard"}
          </p>
        </Panel>
      ) : (
        <div className="space-y-7">
          {[...grouped.entries()].map(([t, items]) => (
            <section key={t}>
              <div className="mb-2.5 flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                  <span className="text-primary">$</span> {t.toLowerCase()}
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {items.length} item{items.length === 1 ? "" : "s"}
                </span>
                <span className="h-px flex-1 bg-border" />
                <Chip tone="green">{t}</Chip>
              </div>
              <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
                {items.map((k) => (
                  <div key={k.id} className="mb-3 break-inside-avoid">
                    <KnowledgeCard
                      item={k}
                      onTogglePin={(item) => store.togglePin("knowledge", item.id)}
                      onDelete={(item) => store.removeKnowledge(item.id)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )          )}
        </div>
      )}

      <CaptureModal
        kind="knowledge"
        open={createOpen}
        onOpenChange={(v) => {
          if (deepLink) setParams({}, { replace: true });
          setCreating(v);
        }}
        store={store}
      />
    </div>
  );
}
