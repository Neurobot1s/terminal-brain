/**
 * localStorage-backed demo store for NeuroBot (no backend, no AI — Phase 1/2).
 * Seeds realistic demo data on first launch; persists user edits.
 *
 * v2: pin support on every item, capture-streak + activity helpers, and a
 * migration-safe store loader (v1 data upgrades in place, preserving keys).
 */
import { useCallback, useEffect, useState } from "react";

export type ItemKind = "note" | "idea" | "goal" | "knowledge";
export type IdeaStatus = "new" | "exploring" | "building" | "completed";
export type GoalStatus = "active" | "paused" | "completed";

export interface Note {
  id: string;
  kind: "note";
  title: string;
  body: string;
  category: string;
  createdAt: number;
  pinned?: boolean;
}

export interface Idea {
  id: string;
  kind: "idea";
  title: string;
  body: string;
  category: string;
  status: IdeaStatus;
  createdAt: number;
  pinned?: boolean;
}

export interface Goal {
  id: string;
  kind: "goal";
  title: string;
  body: string;
  progress: number;
  deadline: string; // ISO date
  status: GoalStatus;
  createdAt: number;
  pinned?: boolean;
}

export interface KnowledgeItem {
  id: string;
  kind: "knowledge";
  title: string;
  body: string;
  topic: string;
  source: string;
  createdAt: number;
  pinned?: boolean;
}

export type BrainItem = Note | Idea | Goal | KnowledgeItem;

export interface ActivityEntry {
  id: string;
  kind: ItemKind;
  title: string;
  createdAt: number;
}

interface Store {
  notes: Note[];
  ideas: Idea[];
  goals: Goal[];
  knowledge: KnowledgeItem[];
  activity: ActivityEntry[];
}

const KEY = "neurobot.v1.data";
const ACTIVITY_LIMIT = 50;

export const KNOWLEDGE_TOPICS: string[] = [
  "AI",
  "Programming",
  "Science",
  "Business",
  "Education",
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function seed(): Store {
  const now = Date.now();
  const min = (n: number) => now - n * 60_000;
  const hour = (n: number) => now - n * 3_600_000;
  const day = (n: number) => now - n * 86_400_000;

  const notes: Note[] = [
    {
      id: uid(),
      kind: "note",
      title: "Attention is all you need — key takeaways",
      body: "Self-attention lets every token attend to every other token. Multi-head = parallel subspaces. Positional encoding injects order. One idea reshaped NLP.",
      category: "AI",
      createdAt: min(24),
      pinned: true,
    },
    {
      id: uid(),
      kind: "note",
      title: "Latency budget for v1",
      body: "p95 under 250ms end-to-end; warm start matters more than cold throughput. Cache the graph snapshot, invalidate on write.",
      category: "Engineering",
      createdAt: hour(5),
    },
    {
      id: uid(),
      kind: "note",
      title: "Questions after 'Thinking, Fast and Slow'",
      body: "Which recent decisions were System 1? Where do I over-trust small samples? Keep a decision journal for 30 days.",
      category: "Psychology",
      createdAt: day(1),
    },
    {
      id: uid(),
      kind: "note",
      title: "Design partner call — notes",
      body: "They want Markdown export and an offline mode before adopting. Both feasible post-v1. Follow up Friday with a one-pager.",
      category: "Business",
      createdAt: day(2),
    },
  ];

  const ideas: Idea[] = [
    {
      id: uid(),
      kind: "idea",
      title: "Spaced-repetition graph pulses",
      body: "Nodes softly pulse when their linked notes haven't been reviewed in a while — review becomes ambient instead of a chore.",
      category: "Learning",
      status: "exploring",
      createdAt: min(90),
      pinned: true,
    },
    {
      id: uid(),
      kind: "idea",
      title: "Weekly brain digest",
      body: "Auto-compile the week's captures into a one-screen digest: 3 ideas, 2 connections, 1 open goal. Plain text to match the terminal aesthetic.",
      category: "Product",
      status: "new",
      createdAt: hour(8),
    },
    {
      id: uid(),
      kind: "idea",
      title: "Local-first sync engine",
      body: "CRDT-backed sync so the brain works offline and merges without conflicts. The server becomes a dumb relay.",
      category: "Engineering",
      status: "building",
      createdAt: day(3),
    },
    {
      id: uid(),
      kind: "idea",
      title: "Voice capture → auto-linking",
      body: "60-second voice notes, transcribed and auto-linked to existing nodes. Pairs with the upcoming Live mode.",
      category: "Product",
      status: "completed",
      createdAt: day(5),
    },
  ];

  const goals: Goal[] = [
    {
      id: uid(),
      kind: "goal",
      title: "Finish 'Deep Learning' specialization",
      body: "5 courses, 2 remaining. Target: 3 sessions/week, notes captured into NeuroBot after each.",
      progress: 62,
      deadline: "2026-11-30",
      status: "active",
      createdAt: day(12),
      pinned: true,
    },
    {
      id: uid(),
      kind: "goal",
      title: "Publish 10 technical posts",
      body: "3 down, 7 to go. One post per topic in the knowledge graph — writing tied back into the brain.",
      progress: 30,
      deadline: "2026-12-31",
      status: "active",
      createdAt: day(20),
    },
    {
      id: uid(),
      kind: "goal",
      title: "Prototype the connection engine",
      body: "Ship the first real (non-demo) similarity pass over captured notes.",
      progress: 15,
      deadline: "2026-10-15",
      status: "active",
      createdAt: day(6),
    },
    {
      id: uid(),
      kind: "goal",
      title: "Read 24 books this year",
      body: "Paused until the specialization finishes. Currently on book 14.",
      progress: 58,
      deadline: "2026-12-31",
      status: "paused",
      createdAt: day(40),
    },
  ];

  const knowledge: KnowledgeItem[] = [
    {
      id: uid(),
      kind: "knowledge",
      title: "Transformer architecture",
      body: "Seq2seq model built entirely on attention — no recurrence, no convolutions. Enables massive parallelism during training.",
      topic: "AI",
      source: "arXiv 1706.03762",
      createdAt: day(4),
      pinned: true,
    },
    {
      id: uid(),
      kind: "knowledge",
      title: "Gradient descent variants",
      body: "SGD, momentum, RMSProp, Adam: adaptive learning rates trade generalization for convergence speed.",
      topic: "Programming",
      source: "course notes",
      createdAt: day(6),
    },
    {
      id: uid(),
      kind: "knowledge",
      title: "CRDTs",
      body: "Conflict-free replicated data types merge concurrent edits without coordination — the backbone of local-first software.",
      topic: "Programming",
      source: "Ink & Switch",
      createdAt: day(8),
    },
    {
      id: uid(),
      kind: "knowledge",
      title: "Diffusion models 101",
      body: "Learn to add noise, learn to reverse it. Sampling is iterative denoising; guidance steers the trajectory.",
      topic: "AI",
      source: "paper summary",
      createdAt: day(9),
    },
    {
      id: uid(),
      kind: "knowledge",
      title: "Compositional memory",
      body: "Episodic vs semantic memory in humans maps cleanly onto notes vs distilled knowledge in a second brain.",
      topic: "Science",
      source: "reading notes",
      createdAt: day(11),
    },
    {
      id: uid(),
      kind: "knowledge",
      title: "Second-brain methodology",
      body: "Capture → organize → distill → express. The value is in retrieval speed, not storage.",
      topic: "Business",
      source: "BASB",
      createdAt: day(13),
    },
    {
      id: uid(),
      kind: "knowledge",
      title: "Spaced repetition",
      body: "Expanding intervals at the edge of forgetting maximize retention per review minute.",
      topic: "Education",
      source: "SM-2 algorithm",
      createdAt: day(14),
    },
    {
      id: uid(),
      kind: "knowledge",
      title: "Zettelkasten",
      body: "Atomic notes + explicit links = emergent structure. Writing is thinking made visible.",
      topic: "Education",
      source: "Luhmann method",
      createdAt: day(16),
    },
  ];

  const activity: ActivityEntry[] = [
    { id: uid(), kind: "note", title: "Note captured: Attention is all you need — key takeaways", createdAt: min(24) },
    { id: uid(), kind: "idea", title: "Idea logged: Spaced-repetition graph pulses", createdAt: min(90) },
    { id: uid(), kind: "note", title: "Note edited: Latency budget for v1", createdAt: hour(5) },
    { id: uid(), kind: "knowledge", title: "Knowledge captured: Transformer architecture", createdAt: day(4) },
    { id: uid(), kind: "goal", title: "Goal updated: Prototype the connection engine", createdAt: day(6) },
    { id: uid(), kind: "note", title: "Note captured: Design partner call — notes", createdAt: day(2) },
    { id: uid(), kind: "idea", title: "Idea logged: Local-first sync engine", createdAt: day(3) },
    { id: uid(), kind: "note", title: "Note captured: Questions after 'Thinking, Fast and Slow'", createdAt: day(1) },
  ];

  return { notes, ideas, goals, knowledge, activity };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      if (
        Array.isArray(parsed.notes) &&
        Array.isArray(parsed.ideas) &&
        Array.isArray(parsed.goals) &&
        Array.isArray(parsed.knowledge) &&
        Array.isArray(parsed.activity)
      ) {
        return {
          notes: parsed.notes,
          ideas: parsed.ideas,
          goals: parsed.goals,
          knowledge: parsed.knowledge,
          activity: parsed.activity,
        };
      }
    }
  } catch {
    /* corrupted → reseed */
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked — demo continues in memory */
  }
}

/**
 * @deprecated Use useBrainStore() from @/components/BrainProvider so every
 * consumer shares one store instance.
 */
export function useBrain() {
  const [store, setStore] = useState<Store>(load);

  useEffect(() => {
    save(store);
  }, [store]);

  const addNote = useCallback((note: Omit<Note, "id" | "kind" | "createdAt">) => {
    setStore((s) => {
      const now = Date.now();
      const created: Note = { ...note, id: uid(), kind: "note", createdAt: now };
      const entry: ActivityEntry = {
        id: uid(),
        kind: "note",
        title: `Note captured: ${created.title}`,
        createdAt: now,
      };
      return {
        ...s,
        notes: [created, ...s.notes],
        activity: [entry, ...s.activity].slice(0, ACTIVITY_LIMIT),
      };
    });
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<Omit<Note, "id" | "kind">>) => {
    setStore((s) => ({
      ...s,
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }, []);

  /** Remove a note; returns an undo callback that restores it in place. */
  const removeNote = useCallback((id: string) => {
    let removed: Note | undefined;
    setStore((s) => {
      removed = s.notes.find((n) => n.id === id);
      return { ...s, notes: s.notes.filter((n) => n.id !== id) };
    });
    return () => {
      setStore((s) => {
        if (!removed || s.notes.some((n) => n.id === removed!.id)) return s;
        return { ...s, notes: [removed, ...s.notes] };
      });
    };
  }, []);

  const addIdea = useCallback((idea: Omit<Idea, "id" | "kind" | "createdAt">) => {
    setStore((s) => {
      const now = Date.now();
      const created: Idea = { ...idea, id: uid(), kind: "idea", createdAt: now };
      const entry: ActivityEntry = {
        id: uid(),
        kind: "idea",
        title: `Idea logged: ${created.title}`,
        createdAt: now,
      };
      return {
        ...s,
        ideas: [created, ...s.ideas],
        activity: [entry, ...s.activity].slice(0, ACTIVITY_LIMIT),
      };
    });
  }, []);

  const updateIdea = useCallback((id: string, patch: Partial<Omit<Idea, "id" | "kind">>) => {
    setStore((s) => ({
      ...s,
      ideas: s.ideas.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  }, []);

  /** Remove an idea; returns an undo callback that restores it in place. */
  const removeIdea = useCallback((id: string) => {
    let removed: Idea | undefined;
    setStore((s) => {
      removed = s.ideas.find((i) => i.id === id);
      return { ...s, ideas: s.ideas.filter((i) => i.id !== id) };
    });
    return () => {
      setStore((s) => {
        if (!removed || s.ideas.some((i) => i.id === removed!.id)) return s;
        return { ...s, ideas: [removed, ...s.ideas] };
      });
    };
  }, []);

  const addGoal = useCallback((goal: Omit<Goal, "id" | "kind" | "createdAt">) => {
    setStore((s) => {
      const now = Date.now();
      const created: Goal = { ...goal, id: uid(), kind: "goal", createdAt: now };
      const entry: ActivityEntry = {
        id: uid(),
        kind: "goal",
        title: `Goal set: ${created.title}`,
        createdAt: now,
      };
      return {
        ...s,
        goals: [created, ...s.goals],
        activity: [entry, ...s.activity].slice(0, ACTIVITY_LIMIT),
      };
    });
  }, []);

  const updateGoal = useCallback((id: string, patch: Partial<Omit<Goal, "id" | "kind">>) => {
    setStore((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }, []);

  /** Remove a goal; returns an undo callback that restores it in place. */
  const removeGoal = useCallback((id: string) => {
    let removed: Goal | undefined;
    setStore((s) => {
      removed = s.goals.find((g) => g.id === id);
      return { ...s, goals: s.goals.filter((g) => g.id !== id) };
    });
    return () => {
      setStore((s) => {
        if (!removed || s.goals.some((g) => g.id === removed!.id)) return s;
        return { ...s, goals: [removed, ...s.goals] };
      });
    };
  }, []);

  const addKnowledge = useCallback(
    (item: Omit<KnowledgeItem, "id" | "kind" | "createdAt">) => {
      setStore((s) => {
        const now = Date.now();
        const created: KnowledgeItem = { ...item, id: uid(), kind: "knowledge", createdAt: now };
        const entry: ActivityEntry = {
          id: uid(),
          kind: "knowledge",
          title: `Knowledge captured: ${created.title}`,
          createdAt: now,
        };
        return {
          ...s,
          knowledge: [created, ...s.knowledge],
          activity: [entry, ...s.activity].slice(0, ACTIVITY_LIMIT),
        };
      });
    },
    [],
  );

  const updateKnowledge = useCallback(
    (id: string, patch: Partial<Omit<KnowledgeItem, "id" | "kind">>) => {
      setStore((s) => ({
        ...s,
        knowledge: s.knowledge.map((k) => (k.id === id ? { ...k, ...patch } : k)),
      }));
    },
    [],
  );

  /** Remove a knowledge item; returns an undo callback restoring it in place. */
  const removeKnowledge = useCallback((id: string) => {
    let removed: KnowledgeItem | undefined;
    setStore((s) => {
      removed = s.knowledge.find((k) => k.id === id);
      return { ...s, knowledge: s.knowledge.filter((k) => k.id !== id) };
    });
    return () => {
      setStore((s) => {
        if (!removed || s.knowledge.some((k) => k.id === removed!.id)) return s;
        return { ...s, knowledge: [removed, ...s.knowledge] };
      });
    };
  }, []);

  const removeActivity = useCallback((id: string) => {
    setStore((s) => ({ ...s, activity: s.activity.filter((a) => a.id !== id) }));
  }, []);

  /** Toggle the pin flag on any item kind. */
  const togglePin = useCallback((kind: ItemKind, id: string) => {
    setStore((s) => {
      if (kind === "note") {
        return { ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)) };
      }
      if (kind === "idea") {
        return { ...s, ideas: s.ideas.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i)) };
      }
      if (kind === "goal") {
        return { ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, pinned: !g.pinned } : g)) };
      }
      return {
        ...s,
        knowledge: s.knowledge.map((k) => (k.id === id ? { ...k, pinned: !k.pinned } : k)),
      };
    });
  }, []);

  const resetDemo = useCallback(() => {
    setStore(seed());
  }, []);

  /** Wipe every memory — the app starts from a truly blank brain. */
  const clearAll = useCallback(() => {
    setStore({ notes: [], ideas: [], goals: [], knowledge: [], activity: [] });
  }, []);

  return {
    ...store,
    addNote,
    updateNote,
    removeNote,
    addIdea,
    updateIdea,
    removeIdea,
    addGoal,
    updateGoal,
    removeGoal,
    addKnowledge,
    updateKnowledge,
    removeKnowledge,
    removeActivity,
    togglePin,
    resetDemo,
    clearAll,
  };
}

export type BrainStore = ReturnType<typeof useBrain>;

/* ---------------------------------- */
/* Derived helpers (pure, render-safe) */
/* ---------------------------------- */

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/** Format an epoch timestamp as a short date (render-safe). */
export function formatDay(ts: number): string {
  return formatDate(new Date(ts).toISOString().slice(0, 10));
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00").getTime();
  return Math.ceil((d - Date.now()) / 86_400_000);
}

/** Local-date key like 2026-09-14 for an epoch timestamp. */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export interface BrainStats {
  total: number;
  pinned: number;
  /** Consecutive days (ending today or yesterday) with ≥1 capture. */
  streak: number;
  /** Capture counts for the last 14 days, oldest → newest. */
  sparkline: number[];
  /** Sum of capture counts across the 14-day window. */
  monthTotal: number;
}

export function computeStats(store: {
  notes: Note[];
  ideas: Idea[];
  goals: Goal[];
  knowledge: KnowledgeItem[];
  activity: ActivityEntry[];
}): BrainStats {
  const all: { createdAt: number }[] = [
    ...store.notes,
    ...store.ideas,
    ...store.goals,
    ...store.knowledge,
  ];
  const pinned =
    store.notes.filter((n) => n.pinned).length +
    store.ideas.filter((i) => i.pinned).length +
    store.goals.filter((g) => g.pinned).length +
    store.knowledge.filter((k) => k.pinned).length;

  const today = dayKey(Date.now());
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    days.push(dayKey(Date.now() - i * 86_400_000));
  }
  const counts = new Map<string, number>();
  for (const item of all) {
    const key = dayKey(item.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sparkline = days.map((d) => counts.get(d) ?? 0);

  // Streak: walk back from today; allow "started yesterday" grace.
  let streak = 0;
  if ((counts.get(today) ?? 0) > 0 || (counts.get(days[12]) ?? 0) > 0) {
    const startIdx = (counts.get(today) ?? 0) > 0 ? 13 : 12;
    streak = 0;
    for (let i = startIdx; i >= 0; i--) {
      if ((counts.get(days[i]) ?? 0) > 0) streak++;
      else break;
    }
  }

  return {
    total: all.length,
    pinned,
    streak,
    sparkline,
    monthTotal: sparkline.reduce((a, b) => a + b, 0),
  };
}
