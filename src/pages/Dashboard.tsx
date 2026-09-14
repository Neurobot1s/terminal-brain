/**
 * Dashboard — the v1 centerpiece.
 * Moment it opens: knowledge graph + introduction + credit to Tanishq Lalwani.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Brain,
  Lightbulb,
  Mic,
  Network,
  Send,
  Share2,
  Terminal,
  Zap,
} from "lucide-react";
import { NeuralGraph } from "@/components/NeuralGraph";
import { QuickCapture } from "@/components/QuickCapture";
import { NeuroVisionCard } from "@/components/NeuroVision";
import { StatCard } from "@/components/StatCard";
import { ActivityItem } from "@/components/cards";
import { Panel, TermWindow, SectionHead, StatusDot } from "@/components/terminal";
import { GRAPH_NODES, GRAPH_EDGES } from "@/config/graph-data";
import { APP_NAME, TAGLINE, OWNER_CREDIT } from "@/config/nav";
import { useBrainStore } from "@/components/BrainProvider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Dashboard() {
  const store = useBrainStore();
  const navigate = useNavigate();
  const [ask, setAsk] = useState("");
  const activeGoals = store.goals.filter((g) => g.status === "active").length;

  const submitAsk = () => {
    if (!ask.trim()) return;
    toast.info("NeuroBot is a prototype — retrieval is coming soon.", {
      description: "Phase 2 will answer from your captured memories.",
    });
    setAsk("");
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="rise space-y-6">
      {/* Boot header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="size-3.5 text-primary" />
          <span>
            neurobot@local <span className="text-border">~</span> $ brain --status
          </span>
          <span className="ml-1 inline-flex items-center gap-1.5 text-primary">
            <StatusDot pulse /> online
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your second brain is ready. What should we think about today?
        </p>
      </div>

      {/* Knowledge graph — the hero, first thing after the greeting */}
      <TermWindow
        title="neural_map.json — knowledge graph (visual demo)"
        right={
          <Link to="/connections" className="text-[11px] text-primary hover:underline">
            expand →
          </Link>
        }
      >
        <div className="p-3 sm:p-4">
          <NeuralGraph
            nodes={GRAPH_NODES}
            edges={GRAPH_EDGES}
            variant="card"
            className="term-dots rounded border border-border/60 bg-secondary/30 p-2"
          />
        </div>
      </TermWindow>

      {/* Ask-your-brain box (demo only — no AI wired) */}
      <Panel className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Zap className="size-3 text-primary" />
          ask your brain
          <span className="ml-auto hidden sm:inline">demo — retrieval ships in phase 2</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitAsk();
          }}
          className="mt-3 flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2.5 transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15"
        >
          <span className="select-none text-sm text-primary">&gt;</span>
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask your brain anything…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
          {ask ? (
            <span className="blink select-none text-sm text-primary">▍</span>
          ) : null}
          <button
            type="button"
            aria-label="Voice input (coming soon)"
            onClick={() =>
              toast.info("Voice input is coming soon — see the Live button.")
            }
            className="press rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Mic className="size-4" />
          </button>
          <Button type="submit" size="icon-sm" disabled={!ask.trim()} aria-label="Send">
            <Send className="size-3.5" />
          </Button>
        </form>
      </Panel>

      {/* Introduction + credit */}
      <Panel className="relative overflow-hidden p-5">
        <div className="term-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Brain className="size-4 text-primary" />
            <h2 className="text-base font-bold tracking-tight">
              {APP_NAME} <span className="text-muted-foreground">—</span>{" "}
              <span className="text-primary">{TAGLINE}</span>
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {APP_NAME} is not just another chatbot. It is your personal second
            brain — a place to capture what you learn, connect it to what you
            already know, and retrieve it the moment you need it. Notes become
            knowledge, knowledge becomes connections, and connections become
            insight.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded border border-border bg-secondary px-2 py-1">
              capture
            </span>
            <span className="text-primary">→</span>
            <span className="rounded border border-border bg-secondary px-2 py-1">
              organize
            </span>
            <span className="text-primary">→</span>
            <span className="rounded border border-border bg-secondary px-2 py-1">
              connect
            </span>
            <span className="text-primary">→</span>
            <span className="rounded border border-border bg-secondary px-2 py-1">
              retrieve
            </span>
          </div>
          <p className="mt-4 border-t border-border/60 pt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            {OWNER_CREDIT}
          </p>
        </div>
      </Panel>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={Brain}
          label="Knowledge"
          value={store.knowledge.length}
          glyph="~/knowledge"
          onClick={() => navigate("/knowledge")}
        />
        <StatCard
          icon={Lightbulb}
          label="Ideas"
          value={store.ideas.length}
          glyph="~/ideas"
          onClick={() => navigate("/ideas")}
        />
        <StatCard
          icon={Network}
          label="Active Goals"
          value={activeGoals}
          glyph="~/goals"
          onClick={() => navigate("/goals")}
        />
        <StatCard
          icon={Share2}
          label="Connections"
          value={GRAPH_EDGES.length}
          glyph="~/links"
          onClick={() => navigate("/connections")}
        />
      </div>

      {/* Quick capture */}
      <QuickCapture store={store} />

      {/* Recent activity + NeuroVision */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionHead title="Recent Activity" />
          <TermWindow title="activity.log" bodyClassName="divide-y divide-border/60">
            {store.activity.slice(0, 6).map((a) => (
              <ActivityItem key={a.id} entry={a} onDelete={store.removeActivity} />
            ))}
            {store.activity.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                nothing yet — capture your first thought above
              </p>
            )}
          </TermWindow>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <SectionHead title="Coming Soon" />
          <NeuroVisionCard />
        </div>
      </div>
    </div>
  );
}
