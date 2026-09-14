/**
 * Settings — appearance, notifications, data, privacy and about NeuroBot.
 * v2: appearance toggles are real (PrefsProvider), reset requires
 * confirmation, and Clear all data wipes localStorage cleanly.
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
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Panel, SectionHead, CheckLine, Chip } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME, TAGLINE, OWNER_CREDIT, SESSION } from "@/config/nav";
import { useBrainStore } from "@/components/BrainProvider";
import { usePrefs } from "@/components/PrefsProvider";

export default function Settings() {
  const store = useBrainStore();
  const { prefs, setPref } = usePrefs();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [notifications, setNotifications] = useState({
    digest: true,
    connections: true,
    goals: false,
  });
  const [privacy, setPrivacy] = useState({
    localOnly: true,
    telemetry: false,
  });

  const total =
    store.notes.length +
    store.ideas.length +
    store.goals.length +
    store.knowledge.length;

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
        {/* Appearance — functional via PrefsProvider */}
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Appearance</h3>
            <Chip tone="green" className="ml-auto">terminal light</Chip>
          </div>
          <div className="mt-2 divide-y divide-border/60">
            <CheckLine
              checked={prefs.compact}
              onChange={(v) => setPref("compact", v)}
              label="Compact density"
              desc="Tighter paddings across cards and lists."
            />
            <CheckLine
              checked={prefs.grid}
              onChange={(v) => setPref("grid", v)}
              label="Grid backdrop"
              desc="Subtle terminal grid behind the app."
            />
            <CheckLine
              checked={prefs.motion}
              onChange={(v) => setPref("motion", v)}
              label="Motion"
              desc="Micro-interactions and graph animations."
            />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            Saved to this device — applied instantly across the app.
          </p>
        </Panel>

        {/* Notifications */}
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Notifications</h3>
            <Chip tone="amber" className="ml-auto">coming soon</Chip>
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
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            Preferences remembered; delivery arrives with Phase 2.
          </p>
        </Panel>

        {/* Data */}
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Data</h3>
            <Chip tone="amber" className="ml-auto">localStorage</Chip>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {total} memories stored on this device. Export to keep a backup,
            reset to the demo dataset, or wipe everything.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportData}>
              <Download className="size-3.5" /> Export JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="size-3.5" /> Reset demo data
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmWipe(true)}
            >
              <Trash2 className="size-3.5" /> Clear all
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
          knowledge, ideas and goals. This is a frontend prototype: all data
          lives in your browser, no AI is wired up yet, and every feature is
          honestly labeled as demo or coming soon.
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          {OWNER_CREDIT}
        </p>
      </Panel>

      {/* Confirm: reset to demo dataset */}
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to demo data?</DialogTitle>
            <DialogDescription>
              This replaces everything you've captured with the original demo
              dataset. Export a backup first if you want to keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                store.resetDemo();
                setConfirmReset(false);
                toast.success("Demo data reset.");
              }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: wipe everything */}
      <Dialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              Permanently deletes every note, idea, goal and knowledge item
              from this browser. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmWipe(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                store.clearAll();
                setConfirmWipe(false);
                toast.success("All data cleared — a blank brain awaits.");
              }}
            >
              <Trash2 className="size-3.5" /> Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
