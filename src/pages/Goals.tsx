/**
 * Goals — track outcomes with progress bars and deadlines.
 */
import { useMemo, useState } from "react";
import { Network, Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { GoalCard } from "@/components/cards";
import { SectionHead, Panel } from "@/components/terminal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GOAL_STATUSES } from "@/config/kinds";
import { useBrainStore } from "@/components/BrainProvider";
import { daysUntil } from "@/lib/store";
import type { Goal, GoalStatus } from "@/lib/store";

/** Render-safe default deadline: 30 days out, memoized at module load. */
const defaultDeadline = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

export default function Goals() {
  const store = useBrainStore();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const stats = useMemo(() => {
    const active = store.goals.filter((g) => g.status === "active");
    const done = store.goals.filter((g) => g.status === "completed");
    const avg = active.length
      ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length)
      : 0;
    return { active: active.length, done: done.length, avg };
  }, [store.goals]);

  return (
    <div className="rise space-y-5">
      <SectionHead
        title="Goals"
        sub="outcomes with progress and deadlines"
        icon={Network}
        count={store.goals.length}
        right={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New Goal
          </Button>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">active</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{stats.active}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">completed</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{stats.done}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">avg progress</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{stats.avg}%</p>
        </div>
      </div>

      <div className="columns-1 gap-3 sm:columns-2">
        {store.goals
          .slice()
          .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))
          .map((g) => (
            <div key={g.id} className="mb-3 break-inside-avoid">
              <GoalCard
                goal={g}
                onEdit={setEditing}
                onDelete={(goal) => store.removeGoal(goal.id)}
              />
            </div>
          ))}
        {store.goals.length === 0 && (
          <Panel className="p-10 text-center sm:col-span-2">
            <p className="text-sm text-muted-foreground">
              no goals yet — set your first outcome
            </p>
          </Panel>
        )}
      </div>

      <GoalEditor
        open={creating}
        onOpenChange={setCreating}
        onSubmit={(values) => store.addGoal(values)}
      />
      {editing && (
        <GoalEditor
          open
          onOpenChange={(v) => !v && setEditing(null)}
          initial={editing}
          onSubmit={(values) => store.updateGoal(editing.id, values)}
        />
      )}
    </div>
  );
}

function GoalEditor({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Goal;
  onSubmit: (values: {
    title: string;
    body: string;
    progress: number;
    deadline: string;
    status: GoalStatus;
  }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [deadline, setDeadline] = useState(
    initial?.deadline ?? defaultDeadline(),
  );
  const [status, setStatus] = useState<GoalStatus>(initial?.status ?? "active");

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), body: body.trim(), progress, deadline, status });
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit goal" : "New goal"}
      subtitle={initial ? "$ vim goal.yaml" : "$ touch goal.yaml"}
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
            placeholder="What outcome are you chasing?"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Description</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Why does this matter? What does done look like?"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Progress — {progress}%
            </Label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Deadline</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as GoalStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOAL_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Progress value={progress} className="mt-1 h-1.5" />
        <div className="mt-1 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!title.trim()}>
            {initial ? "Save changes" : "Set goal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
