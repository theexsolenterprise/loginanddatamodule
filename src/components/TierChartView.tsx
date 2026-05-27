import type { ChartNode, GraphNode, GraphEdge, Tier } from "@/types/client-structure";

/**
 * Read-only view of a client's structure. Renders the new free-placement
 * graph (nodes grouped by level + arrows for edges) when present; falls
 * back to the linear tree or legacy tiers list otherwise.
 */

const PALETTE = [
  { ring: "ring-indigo-200", chip: "bg-indigo-100 text-indigo-700", text: "text-indigo-900" },
  { ring: "ring-emerald-200", chip: "bg-emerald-100 text-emerald-700", text: "text-emerald-900" },
  { ring: "ring-sky-200", chip: "bg-sky-100 text-sky-700", text: "text-sky-900" },
  { ring: "ring-amber-200", chip: "bg-amber-100 text-amber-700", text: "text-amber-900" },
  { ring: "ring-rose-200", chip: "bg-rose-100 text-rose-700", text: "text-rose-900" },
  { ring: "ring-violet-200", chip: "bg-violet-100 text-violet-700", text: "text-violet-900" },
];
function pal(d: number) {
  return PALETTE[d % PALETTE.length];
}

export function TierChartView({
  graph, boxes, tiers,
}: {
  graph?: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  boxes?: ChartNode[];
  tiers?: Tier[];
}) {
  if (graph && graph.nodes.length > 0) return <GraphLevels graph={graph} />;

  // Fallback to legacy tree (boxes) or tiers.
  const tree: ChartNode[] | null = boxes && boxes.length > 0
    ? boxes
    : (tiers && tiers.length > 0 ? tierToTree(tiers) : null);
  if (!tree || tree.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3 text-center text-xs text-zinc-500">
        No structure configured yet.
      </p>
    );
  }
  return <LegacyTree tree={tree} />;
}

/* ─── Graph mode: group nodes by level horizontally ──────────────────────── */

function GraphLevels({ graph }: { graph: { nodes: GraphNode[]; edges: GraphEdge[] } }) {
  const byLevel = new Map<number, GraphNode[]>();
  for (const n of graph.nodes) {
    const arr = byLevel.get(n.level) ?? [];
    arr.push(n);
    byLevel.set(n.level, arr);
  }
  // Within a level, sort by x so the read-only view mirrors canvas placement.
  for (const arr of byLevel.values()) arr.sort((a, b) => a.x - b.x);
  const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);

  const idToLabel: Record<string, string> = {};
  for (const n of graph.nodes) idToLabel[n.id] = n.label;
  const incoming = new Map<string, string[]>(); // targetId → [sourceLabel]
  for (const e of graph.edges) {
    const arr = incoming.get(e.target) ?? [];
    arr.push(idToLabel[e.source] ?? "?");
    incoming.set(e.target, arr);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit flex-col items-center gap-3">
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-semibold text-white">
          Admin
        </span>
        {levels.map((lvl, i) => {
          const arr = byLevel.get(lvl)!;
          return (
            <div key={lvl} className="flex flex-col items-center gap-1.5">
              {i === 0 && <Connector />}
              <div className="flex flex-wrap items-start justify-center gap-3">
                {arr.map((n) => {
                  const p = pal(lvl);
                  const unlimited = n.cap == null;
                  const parents = incoming.get(n.id) ?? [];
                  return (
                    <div
                      key={n.id}
                      className={"min-w-[160px] max-w-[220px] rounded-lg border bg-white px-3 py-2 ring-1 " + p.ring}
                    >
                      <div className="flex items-center gap-2">
                        <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " + p.chip}>
                          {lvl + 1}
                        </span>
                        <span className={"truncate text-sm font-medium " + p.text}>{n.label}</span>
                      </div>
                      {n.description && (
                        <div className="mt-0.5 truncate text-[11px] text-zinc-600">{n.description}</div>
                      )}
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {unlimited ? "∞" : n.cap} · {n.bucketing}
                      </div>
                      {parents.length > 1 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {parents.map((p, i) => (
                            <span key={i} className="inline-flex items-center rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] text-violet-700">
                              ← {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {i < levels.length - 1 && <Connector />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Legacy renderers ───────────────────────────────────────────────────── */

function LegacyTree({ tree }: { tree: ChartNode[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit flex-col items-center gap-2">
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-semibold text-white">
          Admin
        </span>
        <Connector />
        <LegacyRow nodes={tree} depth={0} />
      </div>
    </div>
  );
}

function LegacyRow({ nodes, depth }: { nodes: ChartNode[]; depth: number }) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-3">
      {nodes.map((n) => (
        <div key={n.id} className="flex flex-col items-center gap-1.5">
          <LegacyCard node={n} depth={depth} />
          {n.children.length > 0 && (
            <>
              <Connector />
              <LegacyRow nodes={n.children} depth={depth + 1} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function LegacyCard({ node, depth }: { node: ChartNode; depth: number }) {
  const p = pal(depth);
  const unlimited = node.cap == null;
  return (
    <div className={"min-w-[160px] max-w-[240px] rounded-lg border bg-white px-3 py-2 ring-1 " + p.ring}>
      <div className="flex items-center gap-2">
        <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " + p.chip}>
          {depth + 1}
        </span>
        <span className={"truncate text-sm font-medium " + p.text}>{node.label}</span>
      </div>
      {node.description && (
        <div className="mt-0.5 truncate text-[11px] text-zinc-600">{node.description}</div>
      )}
      <div className="mt-1 text-[10px] text-zinc-500">
        {unlimited ? "∞" : node.cap} · {node.bucketing}
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="my-0 flex justify-center">
      <div className="h-4 w-px bg-zinc-300" />
    </div>
  );
}

function tierToTree(tiers: Tier[]): ChartNode[] {
  let cursor: ChartNode | null = null;
  for (let i = tiers.length - 1; i >= 0; i--) {
    const t = tiers[i];
    const node: ChartNode = {
      id: `legacy-${i}`,
      label: t.label,
      description: undefined,
      cap: t.cap,
      bucketing: t.bucketing,
      children: cursor ? [cursor] : [],
    };
    cursor = node;
  }
  return cursor ? [cursor] : [];
}
