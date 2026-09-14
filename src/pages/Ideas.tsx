/**
 * Ideas — attractive board grouped by status: New → Exploring → Building →
 * Completed. Cards can be promoted, edited or deleted.
 */
import { useMemo, useState } from "react";
import { ArrowRight, Lightbulb, Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { IdeaCard } from "@/components/cards";
import { SectionHead, Chip } from "@/components/terminal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IDEA_STATUSES } from "@/config/kinds";
import { useBrainStore } from "@/components/BrainProvider";
import type { Idea, IdeaStatus } from "@/lib/store";

const NEXT_STATUS: Record<IdeaStatus, IdeaStatus> = {
  new: "exploring",
  exploring: "building",
  building: "completed",
  completed: "new",
};

const CATEGORIES = [
  "General",
  "AI",
  "Engineering",
  "Product",
  "Business",
  "Learning",
];

export default function Ideas() {
  const store = useBrainStore();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);

  const byStatus = useMemo(() => {
    const map: Record<IdeaStatus, Idea[]> = {
      new: [],
      exploring: [],
      building: [],
      completed: [],
    };
    for (const idea of store.ideas) map[idea.status].push(idea);
    for (const key of Object.keys(map) as IdeaStatus[])
      map[key].sort((a, b) => b.createdAt - a.createdAt);
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

      <IdeaEditor
        open={creating}
        onOpenChange={setCreating}
        onSubmit={(values) => store.addIdea(values)}
      />
      {editing && (
        <IdeaEditor
          open
          onOpenChange={(v) => !v && setEditing(null)}
          initial={editing}
          onSubmit={(values) => store.updateIdea(editing.id, values)}
        />
      )}
    </div>
  );
}

function IdeaEditor({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Idea;
  onSubmit: (values: {
    title: string;
    body: string;
    category: string;
    status: IdeaStatus;
  }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Product");
  const [status, setStatus] = useState<IdeaStatus>(initial?.status ?? "new");

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), body: body.trim(), category, status });
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit idea" : "New idea"}
      subtitle={initial ? "$ vim idea.md" : "$ touch idea.md"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-3"
      >
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What surfaced?"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Description</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the idea — what makes it interesting?"
            rows={4}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as IdeaStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDEA_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!title.trim()}>
            {initial ? "Save changes" : "Log idea"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
