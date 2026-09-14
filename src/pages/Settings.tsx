/**
 * Settings — appearance, notifications, data, privacy and about NeuroBot.
 * All local-only; no backend exists in Phase 1.
 */
import { useState } from "react";
import {
  Bell,
  Database,
  Download,
  Eye,
  Info,
  RotateCcw,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Panel, SectionHead, CheckLine, Chip } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { APP_NAME, TAGLINE, OWNER_CREDIT, SESSION } from "@/config/nav";
import { useBrainStore } from "@/components/BrainProvider";

export default function Settings() {
  const store = useBrainStore();
  const [appearance, setAppearance] = useState({
    compact: false,
    gridBg: true,
    animations: true,
  });
  const [notifications, setNotifications] = useState({
    digest: true,
    connections: true,
    goals: false,
  });
  const [privacy, setPrivacy] = useState({
    localOnly: true,
    telemetry: false,
  });

  const exportData = () => {
    const data = {
      notes: store.notes,
      ideas: store.ideas,
      goals: store.goals,
      knowledge: store.knowledge,
      activity: store.activity,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neurobot-export.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Brain exported as JSON.");
  };

  return (
    <div className="rise space-y-6">
      <SectionHead
        title="Settings"
        sub="tuned locally — everything stays on this device"
        icon={SettingsIcon}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Appearance */}
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Appearance</h3>
            <Chip tone="green" className="ml-auto">terminal light</Chip>
          </div>
          <div className="mt-2 divide-y divide-border/60">
            <CheckLine
              checked={appearance.compact}
              onChange={(v) => setAppearance((s) => ({ ...s, compact: v }))}
              label="Compact density"
              desc="Tighter paddings across cards and lists."
            />
            <CheckLine
              checked={appearance.gridBg}
              onChange={(v) => setAppearance((s) => ({ ...s, gridBg: v }))}
              label="Grid backdrop"
              desc="Subtle terminal grid behind the app."
            />
            <CheckLine
              checked={appearance.animations}
              onChange={(v) => setAppearance((s) => ({ ...s, animations: v }))}
              label="Motion"
              desc="Micro-interactions and graph animations."
            />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            Appearance preferences are visual-only in this prototype.
          </p>
        </Panel>

        {/* Notifications */}
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Notifications</h3>
          </div>
          <div className="mt-2 divide-y divide-border/60">
            <CheckLine
              checked={notifications.digest}
              onChange={(v) => setNotifications((s) => ({ ...s, digest: v }))}
              label="Weekly brain digest"
              desc="A one-screen summary of the week's captures."
            />
            <CheckLine
              checked={notifications.connections}
              onChange={(v) => setNotifications((s) => ({ ...s, connections: v }))}
              label="New connection found"
              desc="When two memories link up."
            />
            <CheckLine
              checked={notifications.goals}
              onChange={(v) => setNotifications((s) => ({ ...s, goals: v }))}
              label="Goal nudges"
              desc="Deadline reminders for active goals."
            />
          </div>
        </Panel>

        {/* Data */}
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Data</h3>
            <Chip tone="amber" className="ml-auto">localStorage</Chip>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {store.notes.length + store.ideas.length + store.goals.length + store.knowledge.length}{" "}
            memories stored on this device. Export to keep a backup, or reset
            to the original demo dataset.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportData}>
              <Download className="size-3.5" /> Export JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                store.resetDemo();
                toast.success("Demo data reset.");
              }}
            >
              <RotateCcw className="size-3.5" /> Reset demo data
            </Button>
          </div>
        </Panel>

        {/* Privacy */}
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Privacy</h3>
          </div>
          <div className="mt-2 divide-y divide-border/60">
            <CheckLine
              checked={privacy.localOnly}
              onChange={(v) => setPrivacy((s) => ({ ...s, localOnly: v }))}
              label="Keep my brain local"
              desc="Data never leaves this browser in Phase 1."
            />
            <CheckLine
              checked={privacy.telemetry}
              onChange={(v) => setPrivacy((s) => ({ ...s, telemetry: v }))}
              label="Anonymous usage stats"
              desc="Disabled by default. Nothing is collected yet."
            />
          </div>
        </Panel>
      </div>

      {/* About */}
      <Panel className="p-5">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">About {APP_NAME}</h3>
          <Chip tone="gray" className="ml-auto">{SESSION}</Chip>
        </div>
        <Separator className="my-3" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {APP_NAME} — {TAGLINE} Capture, organize, connect and retrieve your
          knowledge, ideas and goals. Phase 1 is a frontend prototype: all data
          lives in your browser, no AI is wired up yet, and every feature is
          honestly labeled as demo or coming soon.
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          {OWNER_CREDIT}
        </p>
      </Panel>
    </div>
  );
}
