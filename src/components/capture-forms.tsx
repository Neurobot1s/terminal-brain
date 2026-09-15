/**
 * Capture forms — one universal modal for creating AND editing all four item
 * kinds, persisted to localStorage via the shared store.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ITEM_META, IDEA_STATUSES, GOAL_STATUSES } from "@/config/kinds";
import { KNOWLEDGE_TOPICS } from "@/lib/store";
import type { BrainClientStore } from "@/lib/brainClient";
import type {
  Goal,
  GoalStatus,
  Idea,
  IdeaStatus,
  ItemKind,
  KnowledgeItem,
} from "@/lib/store";

const CATEGORY_OPTIONS = [
  "General",
  "AI",
  "Engineering",
  "Product",
  "Business",
  "Learning",
  "Psychology",
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export interface CaptureModalProps {
  kind: ItemKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: BrainClientStore;
  /** When provided the modal switches to edit mode for this item. */
  editItem?:
    | BrainClientStore["notes"][number]
    | Idea
    | Goal
    | KnowledgeItem;
}

/** Generic capture/edit modal used by QuickCapture, pages and the palette. */
export function CaptureModal({
  kind,
  open,
  onOpenChange,
  store,
  editItem,
}: CaptureModalProps) {
  const meta = ITEM_META[kind];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  const [topic, setTopic] = useState<string>(KNOWLEDGE_TOPICS[0]);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<string>("new");
  const [progress, setProgress] = useState(0);
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  // Hydrate fields when opening (create) or when the edit target changes.
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (editItem) {
      setTitle(editItem.title);
      setBody(editItem.body);
      setProgress("progress" in editItem ? editItem.progress : 0);
      setDeadline("deadline" in editItem ? editItem.deadline : "");
      if (kind === "idea" && "category" in editItem && "status" in editItem) {
        setCategory(editItem.category);
        setStatus(editItem.status);
      } else if (kind === "knowledge" && "topic" in editItem && "source" in editItem) {
        setTopic(editItem.topic);
        setSource(editItem.source);
      } else if ("category" in editItem) {
        setCategory(editItem.category);
      }
    } else {
      setTitle("");
      setBody("");
      setCategory("General");
      setTopic(KNOWLEDGE_TOPICS[0]);
      setSource("");
      setStatus(kind === "idea" ? "new" : "active");
      setProgress(0);
      setDeadline("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem, kind]);

  const reset = () => {
    setTitle("");
    setBody("");
    setCategory("General");
    setSource("");
    setStatus(kind === "idea" ? "new" : "active");
    setProgress(0);
    setDeadline("");
    setSaving(false);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 250));
    if (editItem) {
      if (kind === "note") {
        store.updateNote(editItem.id, { title: title.trim(), body: body.trim(), category });
      } else if (kind === "idea") {
        store.updateIdea(editItem.id, {
          title: title.trim(),
          body: body.trim(),
          category,
          status: status as IdeaStatus,
        });
      } else if (kind === "goal") {
        store.updateGoal(editItem.id, {
          title: title.trim(),
          body: body.trim(),
          progress,
          deadline,
          status: status as GoalStatus,
        });
      } else {
        store.updateKnowledge(editItem.id, {
          title: title.trim(),
          body: body.trim(),
          topic,
          source: source.trim() || "captured manually",
        });
      }
      toast.success(`${meta.label} updated.`);
    } else {
      if (kind === "note") {
        store.addNote({ title: title.trim(), body: body.trim(), category });
      } else if (kind === "idea") {
        store.addIdea({
          title: title.trim(),
          body: body.trim(),
          category,
          status: status as IdeaStatus,
        });
      } else if (kind === "goal") {
        store.addGoal({
          title: title.trim(),
          body: body.trim(),
          progress,
          deadline: deadline || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
          status: status as GoalStatus,
        });
      } else {
        store.addKnowledge({
          title: title.trim(),
          body: body.trim(),
          topic,
          source: source.trim() || "captured manually",
        });
      }
      toast.success(`${meta.label} captured to your brain.`);
    }
    if (editItem) onOpenChange(false);
    else reset();
    onOpenChange(false);
  };

  const isGoal = kind === "goal";

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title={editItem ? `Edit ${meta.label}` : `New ${meta.label}`}
      subtitle={
        editItem
          ? `$ neurobot edit --kind ${kind} --id ${editItem.id.slice(0, 6)}`
          : `$ neurobot capture --kind ${kind}`
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-3"
      >
        <Field label={kind === "knowledge" ? "Concept" : "Title"}>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === "idea"
                ? "What surfaced?"
                : kind === "knowledge"
                  ? "e.g. Transformer architecture"
                  : "Title..."
            }
          />
        </Field>

        <Field label="Details">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add context so future-you can retrieve it..."
            rows={3}
          />
        </Field>

        {kind !== "knowledge" && !isGoal && (
          <Field label="Category">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {kind === "knowledge" && (
          <>
            <Field label="Topic">
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_TOPICS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Source (optional)">
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="book, paper, url..."
              />
            </Field>
          </>
        )}

        {kind === "idea" && (
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
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
          </Field>
        )}

        {isGoal && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Progress — ${progress}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
              </Field>
              <Field label="Deadline">
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus}>
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
            </Field>
          </>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !title.trim()}>
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Saving...
              </>
            ) : editItem ? (
              <>
                <Save className="size-3.5" /> Save changes
              </>
            ) : (
              <>
                <Plus className="size-3.5" /> Save to brain
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
