/**
 * NeuralGraph — interactive knowledge-graph visualization.
 * Phase 1: hand-authored demo layout. Hover a node to see its topic; edges
 * are decorative, not AI-generated.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { GraphEdge, GraphNode } from "@/config/graph-data";
import { cn } from "@/lib/utils";

const TOPIC_COLORS: Record<GraphNode["topic"], string> = {
  AI: "#166534", // terminal green
  Programming: "#155e75", // terminal cyan
  Business: "#8a4b08", // terminal amber
  Education: "#5b21b6", // terminal violet
  Science: "#9f1239", // terminal rose
};

const TOPIC_SOFT: Record<GraphNode["topic"], string> = {
  AI: "oklch(0.4744 0.1136 150.86 / 10%)",
  Programming: "oklch(0.5424 0.1071 197.49 / 10%)",
  Business: "oklch(0.6641 0.1124 74.7 / 12%)",
  Education: "oklch(0.5624 0.1364 272.67 / 10%)",
  Science: "oklch(0.5496 0.1755 32.6 / 10%)",
};

const BASE_R = { small: 7, large: 10 };

// Hand-authored layout in 0..1 relative coords (module-scope: stable across renders).
const LAYOUT: Record<string, { x: number; y: number }> = {
  ai: { x: 0.5, y: 0.3 },
  ml: { x: 0.28, y: 0.52 },
  llm: { x: 0.74, y: 0.18 },
  prog: { x: 0.5, y: 0.72 },
  neurobot: { x: 0.79, y: 0.5 },
  founder: { x: 0.93, y: 0.78 },
  edu: { x: 0.24, y: 0.9 },
  zettel: { x: 0.09, y: 0.66 },
  crdt: { x: 0.87, y: 0.9 },
  product: { x: 0.64, y: 0.88 },
};

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  variant?: "card" | "page";
  className?: string;
  onNodeClick?: (node: GraphNode) => void;
}

export function NeuralGraph({
  nodes,
  edges,
  variant = "card",
  className,
  onNodeClick,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const W = variant === "card" ? 640 : 960;
  const H = variant === "card" ? 420 : 560;
  const scale = variant === "page" ? 1.35 : 1;

  const positioned = useMemo(
    () =>
      nodes.map((n) => {
        const pos = LAYOUT[n.id] ?? { x: 0.5, y: 0.5 };
        return {
          ...n,
          cx: pos.x * W,
          cy: pos.y * H,
          r: (n.value >= 3 ? BASE_R.large : BASE_R.small) * scale,
        };
      }),
    [nodes, W, H, scale],
  );

  const byId = useMemo(
    () => Object.fromEntries(positioned.map((n) => [n.id, n])),
    [positioned],
  );

  const curves = useMemo(() => {
    return edges
      .map((e) => {
        const a = byId[e.a];
        const b = byId[e.b];
        if (!a || !b) return null;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const len = Math.hypot(dx, dy) || 1;
        const bow = 0.12 * len;
        const cxp = (a.cx + b.cx) / 2 + (-dy / len) * bow;
        const cyp = (a.cy + b.cy) / 2 + (dx / len) * bow;
        return {
          key: `${e.a}-${e.b}`,
          d: `M ${a.cx} ${a.cy} Q ${cxp} ${cyp} ${b.cx} ${b.cy}`,
          a: e.a,
          b: e.b,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [edges, byId]);

  const activeEdges = useMemo(
    () =>
      new Set(
        curves
          .filter((c) => c.a === hovered || c.b === hovered)
          .map((c) => c.key),
      ),
    [curves, hovered],
  );

  // Wandering pulse particle along the ai→neurobot hero edge.
  const pulse = useMemo(() => {
    const e = curves.find((c) => c.key === "ai-neurobot");
    const a = byId["ai"];
    const b = byId["neurobot"];
    if (!e || !a || !b) return null;
    const parts = e.d.split("Q ")[1].trim().split(/\s+/);
    const c = { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
    return { p0: { x: a.cx, y: a.cy }, c, p2: { x: b.cx, y: b.cy } };
  }, [curves, byId]);

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label="Knowledge graph demo visualization"
      >
        {/* curved edges */}
        {curves.map((c) => {
          const isActive = activeEdges.has(c.key);
          const dim = hovered !== null && !isActive;
          return (
            <motion.path
              key={c.key}
              d={c.d}
              fill="none"
              stroke={dim ? "var(--border)" : "var(--primary)"}
              strokeOpacity={dim ? 0.55 : isActive ? 0.8 : 0.3}
              strokeWidth={isActive ? 1.7 : 1.1}
              className={isActive ? "edge-flow" : undefined}
            />
          );
        })}

        {/* wandering pulse particle on the hero edge */}
        {pulse && (
          <motion.circle
            r={3.2}
            fill="var(--primary)"
            cx={pulse.p0.x}
            cy={pulse.p0.y}
            initial={{ opacity: 0 }}
            animate={{
              cx: [pulse.p0.x, pulse.c.x, pulse.p2.x],
              cy: [pulse.p0.y, pulse.c.y, pulse.p2.y],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          />
        )}

        {/* nodes */}
        {positioned.map((n) => {
          const isHovered = hovered === n.id;
          const linked = curves.some(
            (c) => (c.a === n.id || c.b === n.id) && activeEdges.has(c.key),
          );
          const dim = hovered !== null && !isHovered && !linked;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onNodeClick?.(n)}
              opacity={dim ? 0.35 : 1}
              style={{ transition: "opacity .2s" }}
            >
              <circle
                cx={n.cx}
                cy={n.cy}
                r={isHovered ? n.r * 1.8 : n.r}
                fill={TOPIC_SOFT[n.topic]}
                stroke={TOPIC_COLORS[n.topic]}
                strokeWidth={1.5}
                style={{ transition: "all .2s" }}
              />
              <circle cx={n.cx} cy={n.cy} r={3} fill={TOPIC_COLORS[n.topic]} />
              <text
                x={n.cx}
                y={n.cy - n.r - 8}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={variant === "page" ? 12 : 11}
                fontWeight={600}
                opacity={dim ? 0.4 : 1}
                style={{ transition: "opacity .2s" }}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-1 pt-2 text-[10px] text-muted-foreground">
        {Object.entries(TOPIC_COLORS).map(([topic, color]) => (
          <span key={topic} className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-full" style={{ background: color }} />
            {topic}
          </span>
        ))}
        <span className="ml-auto hidden md:inline">
          visual demo — links are illustrative
        </span>
      </div>
    </div>
  );
}
