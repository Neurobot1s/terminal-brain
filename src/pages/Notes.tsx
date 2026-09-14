/**
 * Notes — create, edit, delete, search and categorize notes.
 * v2: universal CaptureModal, pinned-first ordering, undoable deletes,
 * `?capture=note` deep link (driven by the C N hotkey).
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { FileText, Plus } from "lucide-react";
import { NoteCard } from "@/components/cards";
import { CaptureModal } from "@/components/capture-forms";
import { SearchBar } from "@/components/SearchBar";
import { Panel, SectionHead } from "@/components/terminal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
  const [params, setParams] = useSearchParams();

  // Deep link: /notes?capture=note opens the create modal (derived, no effect).
  const deepLink = params.get("capture") === "note";
  const createOpen = creating || deepLink;

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
      .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.createdAt - a.createdAt);
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
                onTogglePin={(note) => store.togglePin("note", note.id)}
                onDelete={(note) => store.removeNote(note.id)}
              />
            </div>
          ))}
        </div>
      )}

      <CaptureModal
        kind="note"
        open={createOpen}
        onOpenChange={(v) => {
          if (deepLink) setParams({}, { replace: true });
          setCreating(v);
        }}
        store={store}
      />
      <CaptureModal
        kind="note"
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        store={store}
        editItem={editing ?? undefined}
      />
    </div>
  );
}
