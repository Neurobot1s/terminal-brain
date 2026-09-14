/**
 * Demo knowledge-graph dataset. Phase 1 = visual demo only — connections are
 * hand-authored for the prototype, not AI-generated.
 */
export interface GraphNode {
  id: string;
  label: string;
  topic: "AI" | "Programming" | "Business" | "Education" | "Science";
  value: number; // relative weight 1..3
}

export interface GraphEdge {
  a: string; // node id
  b: string;
}

export const GRAPH_NODES: GraphNode[] = [
  { id: "ai", label: "Artificial Intelligence", topic: "AI", value: 3 },
  { id: "ml", label: "Machine Learning", topic: "AI", value: 2 },
  { id: "prog", label: "Programming", topic: "Programming", value: 3 },
  { id: "neurobot", label: "NeuroBot", topic: "Business", value: 3 },
  { id: "founder", label: "Entrepreneurship", topic: "Business", value: 2 },
  { id: "edu", label: "Education", topic: "Education", value: 2 },
  { id: "llm", label: "LLMs", topic: "AI", value: 1 },
  { id: "zettel", label: "Zettelkasten", topic: "Education", value: 1 },
  { id: "crdt", label: "Local-first", topic: "Programming", value: 1 },
  { id: "product", label: "Product Design", topic: "Business", value: 1 },
];

export const GRAPH_EDGES: GraphEdge[] = [
  { a: "ai", b: "ml" },
  { a: "ai", b: "llm" },
  { a: "ml", b: "prog" },
  { a: "ai", b: "neurobot" },
  { a: "neurobot", b: "founder" },
  { a: "neurobot", b: "product" },
  { a: "neurobot", b: "edu" },
  { a: "edu", b: "zettel" },
  { a: "prog", b: "crdt" },
  { a: "prog", b: "edu" },
  { a: "founder", b: "prog" },
];
