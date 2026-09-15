/**
 * brainClient — React adapter over the Convex `brain` functions.
 *
 * Exposes the same shape the UI already consumes (notes/ideas/goals/knowledge/
 * activity arrays + CRUD callbacks), backed by the Convex database instead of
 * localStorage. Queries return an empty brain until authenticated.
 * `seedBrain` is auto-invoked once per signed-in user with an empty brain.
 *
 * Row types intentionally reuse the plain interfaces from lib/store (string
 * ids) so pages and cards keep their existing imports; branded Convex `Id`s
 * are cast at the mutation boundary only.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type {
  ActivityEntry,
  Goal,
  GoalStatus,
  Idea,
  IdeaStatus,
  ItemKind,
  KnowledgeItem,
  Note,
} from "./store";

export type BrainRow = Note | Idea | Goal | KnowledgeItem;
export type ActivityRow = ActivityEntry;

export interface ConvexBrainData {
  notes: Note[];
  ideas: Idea[];
  goals: Goal[];
  knowledge: KnowledgeItem[];
  activity: ActivityEntry[];
}

const EMPTY: ConvexBrainData = {
  notes: [],
  ideas: [],
  goals: [],
  knowledge: [],
  activity: [],
};

export interface BrainClientStore extends ConvexBrainData {
  loading: boolean;
  addNote: (n: { title: string; body: string; category: string }) => Promise<unknown>;
  updateNote: (
    id: string,
    patch: { title?: string; body?: string; category?: string },
  ) => Promise<unknown>;
  removeNote: (id: string) => Promise<unknown>;
  addIdea: (i: {
    title: string;
    body: string;
    category: string;
    status: IdeaStatus;
  }) => Promise<unknown>;
  updateIdea: (
    id: string,
    patch: {
      title?: string;
      body?: string;
      category?: string;
      status?: IdeaStatus;
    },
  ) => Promise<unknown>;
  removeIdea: (id: string) => Promise<unknown>;
  addGoal: (g: {
    title: string;
    body: string;
    progress: number;
    deadline: string;
    status: GoalStatus;
  }) => Promise<unknown>;
  updateGoal: (
    id: string,
    patch: {
      title?: string;
      body?: string;
      progress?: number;
      deadline?: string;
      status?: GoalStatus;
    },
  ) => Promise<unknown>;
  removeGoal: (id: string) => Promise<unknown>;
  addKnowledge: (k: {
    title: string;
    body: string;
    topic: string;
    source: string;
  }) => Promise<unknown>;
  updateKnowledge: (
    id: string,
    patch: { title?: string; body?: string; topic?: string; source?: string },
  ) => Promise<unknown>;
  removeKnowledge: (id: string) => Promise<unknown>;
  removeActivity: (id: string) => Promise<unknown>;
  togglePin: (kind: ItemKind, id: string) => void;
  resetDemo: () => Promise<unknown>;
  clearAll: () => Promise<unknown>;
}

/** Runtime ids are strings; cast for the typed Convex mutation calls. */
const noteId = (id: string) => id as Id<"brainNotes">;
const ideaId = (id: string) => id as Id<"brainIdeas">;
const goalId = (id: string) => id as Id<"brainGoals">;
const knowledgeId = (id: string) => id as Id<"brainKnowledge">;
const activityId = (id: string) => id as Id<"brainActivity">;

/**
 * Convex-backed store with the same call signatures the UI already uses.
 */
export function useBrainConvex(): BrainClientStore {
  const data = useQuery(api.brain.getAll);

  const notes = useMemo<Note[]>(
    () => (data?.notes as unknown as Note[] | undefined) ?? EMPTY.notes,
    [data?.notes],
  );
  const ideas = useMemo<Idea[]>(
    () => (data?.ideas as unknown as Idea[] | undefined) ?? EMPTY.ideas,
    [data?.ideas],
  );
  const goals = useMemo<Goal[]>(
    () => (data?.goals as unknown as Goal[] | undefined) ?? EMPTY.goals,
    [data?.goals],
  );
  const knowledge = useMemo<KnowledgeItem[]>(
    () => (data?.knowledge as unknown as KnowledgeItem[] | undefined) ?? EMPTY.knowledge,
    [data?.knowledge],
  );
  const activity = useMemo<ActivityEntry[]>(
    () => (data?.activity as unknown as ActivityEntry[] | undefined) ?? EMPTY.activity,
    [data?.activity],
  );

  const addNoteM = useMutation(api.brain.addNote);
  const updateNoteM = useMutation(api.brain.updateNote);
  const removeNoteM = useMutation(api.brain.removeNote);
  const addIdeaM = useMutation(api.brain.addIdea);
  const updateIdeaM = useMutation(api.brain.updateIdea);
  const removeIdeaM = useMutation(api.brain.removeIdea);
  const addGoalM = useMutation(api.brain.addGoal);
  const updateGoalM = useMutation(api.brain.updateGoal);
  const removeGoalM = useMutation(api.brain.removeGoal);
  const addKnowledgeM = useMutation(api.brain.addKnowledge);
  const updateKnowledgeM = useMutation(api.brain.updateKnowledge);
  const removeKnowledgeM = useMutation(api.brain.removeKnowledge);
  const removeActivityM = useMutation(api.brain.removeActivity);
  const setNotePinnedM = useMutation(api.brain.setNotePinned);
  const setIdeaPinnedM = useMutation(api.brain.setIdeaPinned);
  const setGoalPinnedM = useMutation(api.brain.setGoalPinned);
  const setKnowledgePinnedM = useMutation(api.brain.setKnowledgePinned);
  const clearAllM = useMutation(api.brain.clearAll);
  const seedM = useMutation(api.brain.seedBrain);

  // Auto-seed a fresh brain (first sign-in) so the demo content appears.
  const seededRef = useRef(false);
  useEffect(() => {
    if (data && !seededRef.current && data.notes.length === 0) {
      seededRef.current = true;
      void seedM({});
    }
  }, [data, seedM]);

  const togglePin = (kind: ItemKind, id: string) => {
    if (kind === "note") {
      const n = notes.find((x) => x.id === id);
      if (n) void setNotePinnedM({ id: noteId(id), pinned: !n.pinned });
    } else if (kind === "idea") {
      const i = ideas.find((x) => x.id === id);
      if (i) void setIdeaPinnedM({ id: ideaId(id), pinned: !i.pinned });
    } else if (kind === "goal") {
      const g = goals.find((x) => x.id === id);
      if (g) void setGoalPinnedM({ id: goalId(id), pinned: !g.pinned });
    } else {
      const k = knowledge.find((x) => x.id === id);
      if (k) void setKnowledgePinnedM({ id: knowledgeId(id), pinned: !k.pinned });
    }
  };

  const store: BrainClientStore = useMemo(
    () => ({
      notes,
      ideas,
      goals,
      knowledge,
      activity,
      loading: data === undefined,
      addNote: (n) => addNoteM(n),
      updateNote: (id, patch) => updateNoteM({ id: noteId(id), ...patch }),
      removeNote: (id) => removeNoteM({ id: noteId(id) }),
      addIdea: (i) => addIdeaM(i),
      updateIdea: (id, patch) => updateIdeaM({ id: ideaId(id), ...patch }),
      removeIdea: (id) => removeIdeaM({ id: ideaId(id) }),
      addGoal: (g) => addGoalM(g),
      updateGoal: (id, patch) => updateGoalM({ id: goalId(id), ...patch }),
      removeGoal: (id) => removeGoalM({ id: goalId(id) }),
      addKnowledge: (k) => addKnowledgeM(k),
      updateKnowledge: (id, patch) => updateKnowledgeM({ id: knowledgeId(id), ...patch }),
      removeKnowledge: (id) => removeKnowledgeM({ id: knowledgeId(id) }),
      removeActivity: (id) => removeActivityM({ id: activityId(id) }),
      togglePin,
      resetDemo: () => seedM({ force: true }),
      clearAll: () => clearAllM({}),
    }),
    // Mutations are stable; data slices drive re-memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, notes, ideas, goals, knowledge, activity],
  );

  return store;
}
