/**
 * Ideas — board grouped by status: New → Exploring → Building → Completed.
 * v2: universal CaptureModal, pin + undo, `?capture=idea` deep link.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowRight, Lightbulb, Plus } from "lucide-react";
import { IdeaCard } from "@/components/cards";
import { CaptureModal } from "@/components/capture-forms";
import { SectionHead, Chip } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { IDEA_STATUSES } from "@/config/kinds";
import { useBrainStore } from "@/components/BrainProvider";
import type { Idea, IdeaStatus } from "@/lib/store";

const NEXT_STATUS: Record<IdeaStatus, IdeaStatus> = {
  new: "exploring",
  exploring: "building",
  building: "completed",
  completed: "new",
};

export default function Ideas() {
  const store = useBrainStore();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [params, setParams] = useSearchParams();

  // Deep link: /ideas?capture=idea opens the create modal (derived, no effect).
  const deepLink = params.get("capture") === "idea";
  const createOpen = creating || deepLink;

  const byStatus = useMemo(() => {
    const map: Record<IdeaStatus, Idea[]> = {
      new: [],
      exploring: [],
      building: [],
      completed: [],
    };
    for (const idea of store.ideas) map[idea.status].push(idea);
    for (const key of Object.keys(map) as IdeaStatus[])
      map[key].sort(
        (a, b) =>
          Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.createdAt - a.createdAt,
      );
    return map;
  }, [store.ideas]);

  return (
    <div className="rise space-y-5">
      <SectionHead
        title="Ideas"
        sub="the idea board — promote ideas as they mature"
        icon={Lightbulb}
        count={store.ideas.length}
        right={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New Idea
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {IDEA_STATUSES.map((status) => {
          const list = byStatus[status.value as IdeaStatus];
          return (
            <div key={status.value} className="flex flex-col">
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <Chip tone={status.tone}>{status.label}</Chip>
                <span className="text-[10px] text-muted-foreground">
                  {list.length}
                </span>
                <button
                  onClick={() => setCreating(true)}
                  aria-label={`Add idea to ${status.label}`}
                  className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className="flex-1 space-y-3 rounded-lg border border-dashed border-border bg-secondary/30 p-2">
                {list.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-muted-foreground/70">
                    empty column
                  </p>
                )}
                {list.map((idea) => (
                  <div key={idea.id} className="relative">
                    <IdeaCard
                      idea={idea}
                      onEdit={setEditing}
                      onTogglePin={(i) => store.togglePin("idea", i.id)}
                      onDelete={(i) => store.removeIdea(i.id)}
                    />
                    <button
                      onClick={() =>
                        store.updateIdea(idea.id, { status: NEXT_STATUS[idea.status] })
                      }
                      title="Promote to next status"
                      className="press absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      <ArrowRight className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <CaptureModal
        kind="idea"
        open={createOpen}
        onOpenChange={(v) => {
          if (deepLink) setParams({}, { replace: true });
          setCreating(v);
        }}
        store={store}
      />
      <CaptureModal
        kind="idea"
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        store={store}
        editItem={editing ?? undefined}
      />
    </div>
  );
}
