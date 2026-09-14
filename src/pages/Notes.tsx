/**
 * Notes — create, edit, delete, search and categorize notes.
 */
import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { NoteCard } from "@/components/cards";
import { SearchBar } from "@/components/SearchBar";
import { Panel, SectionHead } from "@/components/terminal";
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
import { useBrainStore } from "@/components/BrainProvider";
import type { Note } from "@/lib/store";

const CATEGORIES = [
  "General",
  "AI",
  "Engineering",
  "Product",
  "Business",
  "Learning",
  "Psychology",
];

export default function Notes() {
  const store = useBrainStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);

  const categories = useMemo(
    () =>
      Array.from(new Set([...CATEGORIES, ...store.notes.map((n) => n.category)])).sort(),
    [store.notes],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return store.notes
      .filter((n) => category === "all" || n.category === category)
      .filter((n) =>
        q ? (n.title + " " + n.body).toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [store.notes, query, category]);

  return (
    <div className="rise space-y-5">
      <SectionHead
        title="Notes"
        sub="atomic thoughts, saved locally"
        icon={FileText}
        count={store.notes.length}
        right={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New Note
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search notes…"
          resultCount={filtered.length}
          className="sm:max-w-sm"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Panel className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {query || category !== "all"
              ? "no notes match — adjust the filters"
              : "no notes yet — capture your first one"}
          </p>
        </Panel>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
          {filtered.map((n) => (
            <div key={n.id} className="mb-3 break-inside-avoid">
              <NoteCard
                note={n}
                onEdit={setEditing}
                onDelete={(note) => store.removeNote(note.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <NoteEditor
        open={creating}
        onOpenChange={setCreating}
        onSubmit={(values) => store.addNote(values)}
      />

      {/* Edit modal */}
      {editing && (
        <NoteEditor
          open
          onOpenChange={(v) => !v && setEditing(null)}
          initial={editing}
          onSubmit={(values) => store.updateNote(editing.id, values)}
        />
      )}
    </div>
  );
}

function NoteEditor({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Note;
  onSubmit: (values: { title: string; body: string; category: string }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "General");

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), body: body.trim(), category });
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit note" : "New note"}
      subtitle={initial ? "$ vim note.md" : "$ touch note.md"}
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
            placeholder="What's on your mind?"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Body</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write freely — future-you will thank present-you."
            rows={5}
          />
        </div>
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
        <div className="mt-1 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!title.trim()}>
            {initial ? "Save changes" : "Save note"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
