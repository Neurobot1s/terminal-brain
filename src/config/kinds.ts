/**
 * Metadata for the four captured item kinds — icon, tone, verb, color.
 */
import {
  Brain,
  FileText,
  Lightbulb,
  Network,
  type LucideIcon,
} from "lucide-react";
import type { ItemKind } from "@/lib/store";

export interface KindMeta {
  label: string;
  plural: string;
  icon: LucideIcon;
  tone: "green" | "amber" | "cyan" | "violet" | "gray";
  verb: string;
}

export const ITEM_META: Record<ItemKind, KindMeta> = {
  note: {
    label: "note",
    plural: "Notes",
    icon: FileText,
    tone: "cyan",
    verb: "captured",
  },
  idea: {
    label: "idea",
    plural: "Ideas",
    icon: Lightbulb,
    tone: "amber",
    verb: "logged",
  },
  goal: {
    label: "goal",
    plural: "Goals",
    icon: Network,
    tone: "violet",
    verb: "set",
  },
  knowledge: {
    label: "knowledge",
    plural: "Knowledge",
    icon: Brain,
    tone: "green",
    verb: "captured",
  },
};

export const IDEA_STATUSES = [
  { value: "new", label: "New", tone: "gray" as const },
  { value: "exploring", label: "Exploring", tone: "cyan" as const },
  { value: "building", label: "Building", tone: "amber" as const },
  { value: "completed", label: "Completed", tone: "green" as const },
];

export const GOAL_STATUSES = [
  { value: "active", label: "Active", tone: "green" as const },
  { value: "paused", label: "Paused", tone: "amber" as const },
  { value: "completed", label: "Completed", tone: "gray" as const },
];
