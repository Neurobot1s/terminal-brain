/**
 * Central nav config — drives Sidebar, TopBar dropdown and mobile nav.
 */
import {
  Brain,
  FileText,
  Gauge,
  Lightbulb,
  Network,
  Settings,
  Share2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  glyph: string;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: Gauge, glyph: "~/dash" },
  { to: "/brain", label: "My Brain", icon: Brain, glyph: "~/brain" },
  { to: "/notes", label: "Notes", icon: FileText, glyph: "~/notes" },
  { to: "/ideas", label: "Ideas", icon: Lightbulb, glyph: "~/ideas" },
  { to: "/knowledge", label: "Knowledge", icon: Share2, glyph: "~/knowledge" },
  { to: "/goals", label: "Goals", icon: Network, glyph: "~/goals" },
  { to: "/connections", label: "Connections", icon: Network, glyph: "~/links" },
  { to: "/settings", label: "Settings", icon: Settings, glyph: "~/settings" },
];

export const APP_NAME = "NeuroBot";
export const TAGLINE = "Your Second Brain.";
export const OWNER_CREDIT = "Crafted by TANISHQ LALWANI";
export const SESSION = "v1.0 · prototype";
