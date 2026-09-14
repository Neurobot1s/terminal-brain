/**
 * Dashboard — the centerpiece.
 * Moment it opens: knowledge graph + introduction + credit to Tanishq Lalwani.
 * v2: Momentum panel (streak + 14-day activity), pinned memories strip.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Brain,
  Flame,
  Lightbulb,
  Mic,
  Network,
  Pin,
  Send,
  Share2,
  Terminal,
  Zap,
} from "lucide-react";
import { NeuralGraph } from "@/components/NeuralGraph";
import { QuickCapture } from "@/components/QuickCapture";
import { NeuroVisionCard } from "@/components/NeuroVision";
import { StatCard } from "@/components/StatCard";
import { ActivityItem, NoteCard } from "@/components/cards";
import { Panel, TermWindow, SectionHead, StatusDot } from "@/components/terminal";
import { GRAPH_NODES, GRAPH_EDGES } from "@/config/graph-data";
import { APP_NAME, TAGLINE, OWNER_CREDIT } from "@/config/nav";
import { useBrainStore } from "@/components/BrainProvider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { computeStats, daysUntil, formatDate } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Tiny 14-day activity bar chart. */
function Sparkbars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-12 items-end gap-1" aria-hidden>
      {data.map((v, i) => (
        <div key={i} className="group relative flex-1">
          <div
            className={cn(
              "w-full rounded-sm transition-all",
              i === data.length - 1 ? "bg-amber-term" : "bg-primary/60 group-hover:bg-primary",
            )}
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const store = useBrainStore();
  const navigate = useNavigate();
  const [ask, setAsk] = useState("");
  const stats = useMemo(() => computeStats(store), [store]);
  const activeGoals = store.goals.filter((g) => g.status === "active").length;

  const pinned = useMemo(
    () =>
      [
        ...store.notes.filter((n) => n.pinned).map((n) => ({ id: n.id, kind: "note" as const, title: n.title, createdAt: n.createdAt })),
        ...store.ideas.filter((i) => i.pinned).map((i) => ({ id: i.id, kind: "idea" as const, title: i.title, createdAt: i.createdAt })),
        ...store.goals.filter((g) => g.pinned).map((g) => ({ id: g.id, kind: "goal" as const, title: g.title, createdAt: g.createdAt })),
        ...store.knowledge.filter((k) => k.pinned).map((k) => ({ id: k.id, kind: "knowledge" as const, title: k.title, createdAt: k.createdAt })),
      ].sort((a, b) => b.createdAt - a.createdAt),
    [store.notes, store.ideas, store.goals, store.knowledge],
  );

  const nextGoal = useMemo(
    () =>
      store.goals
        .filter((g) => g.status === "active")
        .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))[0],
    [store.goals],
  );

  const pinnedRoute: Record<string, string> = {
    note: "/notes",
    idea: "/ideas",
    goal: "/goals",
    knowledge: "/knowledge",
  };

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

      {/* Momentum + activity */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <SectionHead title="Momentum" />
          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded border border-amber-term/40 bg-amber-term/10 text-amber-strong">
                <Flame className="size-4" />
              </span>
              <div>
                <p className="text-xl font-semibold tabular-nums leading-none">
                  {stats.streak} day{stats.streak === 1 ? "" : "s"}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  capture streak
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xl font-semibold tabular-nums leading-none">
                  {stats.monthTotal}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  last 14 days
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Sparkbars data={stats.sparkline} />
              <div className="mt-1 flex justify-between text-[9px] text-muted-foreground/60">
                <span>14d ago</span>
                <span>today</span>
              </div>
 </div>
            {nextGoal && (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  next deadline
                </p>
                <p className="mt-0.5 truncate text-xs font-medium">{nextGoal.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(nextGoal.deadline)} ·{" "}
                  <span className={cn(daysUntil(nextGoal.deadline) <= 14 ? "text-amber-strong" : "")}>
                    {daysUntil(nextGoal.deadline)}d left
                  </span>
                </p>
              </div>
            )}
          </Panel>
        </div>

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
      </div>

      {/* Pinned memories */}
      {pinned.length > 0 && (
        <div>
          <SectionHead
            title="Pinned"
            icon={Pin}
            count={pinned.length}
            sub="kept at the top of your brain"
          />
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {pinned.map((p) => (
              <Link
                key={`${p.kind}-${p.id}`}
                to={pinnedRoute[p.kind]}
                className="press card-lift w-56 shrink-0 rounded-lg border border-primary/30 bg-primary/[0.04] p-3"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <Pin className="size-3 text-primary" />
                  {p.kind}
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug">
                  {p.title}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

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
            <span className="rounded border border-border bg-secondary px-2 py-1">capture</span>
            <span className="text-primary">→</span>
            <span className="rounded border border-border bg-secondary px-2 py-1">organize</span>
            <span className="text-primary">→</span>
            <span className="rounded border border-border bg-secondary px-2 py-1">connect</span>
            <span className="text-primary">→</span>
            <span className="rounded border border-border bg-secondary px-2 py-1">retrieve</span>
          </div>
          <p className="mt-4 border-t border-border/60 pt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            {OWNER_CREDIT}
          </p>
        </div>
      </Panel>

      {/* Coming soon */}
      <div className="space-y-4">
        <SectionHead title="Coming Soon" />
        <NeuroVisionCard />
      </div>
    </div>
  );
}
