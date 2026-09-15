/**
 * Item cards: NoteCard, IdeaCard, GoalCard, KnowledgeCard + ActivityItem.
 * Shared card chrome with pin / edit / delete micro-actions and undo toasts.
 */
import { CalendarDays, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Panel, KindChip, Chip } from "@/components/terminal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ITEM_META, IDEA_STATUSES } from "@/config/kinds";
import type { ActivityEntry, Goal, Idea, KnowledgeItem, Note } from "@/lib/store";
import { daysUntil, formatDate, formatDay, timeAgo } from "@/lib/store";

function CardActions({
  pinned,
  onTogglePin,
  onEdit,
  onDelete,
  kindLabel,
}: {
  pinned?: boolean;
  onTogglePin?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  kindLabel: string;
}) {
  const handleDelete = () => {
    const undo = onDelete();
    if (typeof undo === "function") {
      toast(`${kindLabel} deleted.`, {
        action: { label: "Undo", onClick: undo },
        duration: 6000,
      });
      return;
    }
    toast(`${kindLabel} deleted.`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          aria-label="Item actions"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {onTogglePin && (
          <DropdownMenuItem onClick={onTogglePin}>
            {pinned ? (
              <>
                <PinOff className="size-3.5" /> Unpin
              </>
            ) : (
              <>
                <Pin className="size-3.5" /> Pin to top
              </>
            )}
          </DropdownMenuItem>
        )}
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="size-3.5" /> Delete
          <span className="ml-auto text-[10px] text-muted-foreground">undoable</span>
          <span className="sr-only"> with toast</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      <span className="sr-only">{kindLabel} actions</span>
    </DropdownMenu>
  );
}

function CardShell({
  children,
  className,
  pinned,
}: {
  children: React.ReactNode;
  className?: string;
  pinned?: boolean;
}) {
  return (
    <Panel
      className={cn(
        "card-lift flex flex-col p-4",
        pinned && "border-primary/50 bg-primary/[0.04]",
        className,
      )}
    >
      {pinned && (
        <span className="absolute -top-2 right-3 rounded border border-primary/40 bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary shadow-sm">
          pinned
        </span>
      )}
      {children}
    </Panel>
  );
}

export function NoteCard({
  note,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  note: Note;
  onEdit?: (note: Note) => void;
  /** Return an undo callback when deletion is reversible (sync stores). */
  onDelete: (note: Note) => unknown;
  onTogglePin?: (note: Note) => void;
}) {
  return (
    <CardShell pinned={note.pinned} className="relative">
      <div className="flex items-start justify-between gap-2">
        <KindChip kind="note" />
        <CardActions
          kindLabel="Note"
          pinned={note.pinned}
          onTogglePin={onTogglePin ? () => onTogglePin(note) : undefined}
          onEdit={onEdit ? () => onEdit(note) : undefined}
          onDelete={() => onDelete(note)}
        />
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{note.title}</h3>
      {note.body && (
        <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {note.body}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-secondary px-1.5 py-0.5">#{note.category.toLowerCase()}</span>
        <span className="ml-auto">{timeAgo(note.createdAt)}</span>
      </div>
    </CardShell>
  );
}

export function IdeaCard({
  idea,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  idea: Idea;
  onEdit?: (idea: Idea) => void;
  onDelete: (idea: Idea) => unknown;
  onTogglePin?: (idea: Idea) => void;
}) {
  const tone = IDEA_STATUSES.find((s) => s.value === idea.status)?.tone ?? "gray";
  const label = IDEA_STATUSES.find((s) => s.value === idea.status)?.label ?? idea.status;
  return (
    <CardShell pinned={idea.pinned} className="relative">
      <div className="flex items-start justify-between gap-2">
        <KindChip kind="idea" />
        <CardActions
          kindLabel="Idea"
          pinned={idea.pinned}
          onTogglePin={onTogglePin ? () => onTogglePin(idea) : undefined}
          onEdit={onEdit ? () => onEdit(idea) : undefined}
          onDelete={() => onDelete(idea)}
        />
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{idea.title}</h3>
      {idea.body && (
        <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {idea.body}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-secondary px-1.5 py-0.5">
          #{idea.category.toLowerCase()}
        </span>
        <Chip tone={tone}>{label}</Chip>
        <span className="ml-auto">{formatDay(idea.createdAt)}</span>
      </div>
    </CardShell>
  );
}

export function GoalCard({
  goal,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  goal: Goal;
  onEdit?: (goal: Goal) => void;
  onDelete: (goal: Goal) => unknown;
  onTogglePin?: (goal: Goal) => void;
}) {
  const overdue =
    goal.status === "active" &&
    goal.progress < 100 &&
    daysUntil(goal.deadline) < 0;
  return (
    <CardShell pinned={goal.pinned} className="relative">
      <div className="flex items-start justify-between gap-2">
        <KindChip kind="goal" />
        <CardActions
          kindLabel="Goal"
          pinned={goal.pinned}
          onTogglePin={onTogglePin ? () => onTogglePin(goal) : undefined}
          onEdit={onEdit ? () => onEdit(goal) : undefined}
          onDelete={() => onDelete(goal)}
        />
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{goal.title}</h3>
      {goal.body && (
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {goal.body}
        </p>
      )}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{goal.progress}% complete</span>
          <span className={cn("inline-flex items-center gap-1", overdue && "text-term-rose")}>
            <CalendarDays className="size-3" />
            {formatDate(goal.deadline)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              overdue ? "bg-term-rose" : "bg-primary",
            )}
            style={{ width: `${goal.progress}%` }}
          />
        </div>
      </div>
    </CardShell>
  );
}

export function KnowledgeCard({
  item,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  item: KnowledgeItem;
  onEdit?: (item: KnowledgeItem) => void;
  onDelete: (item: KnowledgeItem) => unknown;
  onTogglePin?: (item: KnowledgeItem) => void;
}) {
  return (
    <CardShell pinned={item.pinned} className="relative">
      <div className="flex items-start justify-between gap-2">
        <KindChip kind="knowledge" />
        <CardActions
          kindLabel="Knowledge"
          pinned={item.pinned}
          onTogglePin={onTogglePin ? () => onTogglePin(item) : undefined}
          onEdit={onEdit ? () => onEdit(item) : undefined}
          onDelete={() => onDelete(item)}
        />
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{item.title}</h3>
      {item.body && (
        <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {item.body}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-secondary px-1.5 py-0.5">
          #{item.topic.toLowerCase()}
        </span>
        {item.source && <span className="truncate">src: {item.source}</span>}
        <span className="ml-auto shrink-0">{timeAgo(item.createdAt)}</span>
      </div>
    </CardShell>
  );
}

export function ActivityItem({
  entry,
  onDelete,
}: {
  entry: ActivityEntry;
  onDelete: (id: string) => unknown;
}) {
  const meta = ITEM_META[entry.kind];
  const Icon = meta.icon;
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded border",
          meta.tone === "green" && "border-primary/25 bg-primary/10 text-primary",
          meta.tone === "amber" && "border-amber-term/30 bg-amber-term/10 text-amber-strong",
          meta.tone === "cyan" && "border-term-cyan/25 bg-term-cyan/10 text-term-cyan",
          meta.tone === "violet" && "border-term-violet/25 bg-term-violet/10 text-term-violet",
          meta.tone === "gray" && "border-border bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="size-3" />
        <span className="sr-only">{meta.label}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{entry.title}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {timeAgo(entry.createdAt)}
      </span>
      <button
        onClick={() => onDelete(entry.id)}
        aria-label="Delete activity entry"
        className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-all hover:bg-secondary hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
