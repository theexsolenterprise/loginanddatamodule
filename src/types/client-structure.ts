import { z } from "zod";

/**
 * ClientLabels — what each role/node-type is called *inside* this tenant.
 * Defaults are filled in by `defaultLabels()` below; the admin can override
 * any subset at onboarding.
 *
 * Example overrides for a clinic:
 *   { store: "Hospital", owner: "Director", employee: "Doctor",
 *     customer: "Patient", employeePrimary: "Attending",
 *     employeeSecondary: "Resident" }
 */
export const ClientLabelsSchema = z.object({
  store: z.string().min(1).default("Store"),
  owner: z.string().min(1).default("Owner"),
  employee: z.string().min(1).default("Employee"),
  customer: z.string().min(1).default("Customer"),
  employeePrimary: z.string().min(1).default("Primary employee"),
  employeeSecondary: z.string().min(1).default("Secondary employee"),
});
export type ClientLabels = z.infer<typeof ClientLabelsSchema>;

/**
 * A single tier in a client's org chart.
 *
 * - `key`        — slug. Used in URLs and blob paths. Must be unique within
 *                  the client.
 * - `label`      — human-readable name (e.g. "Regional Manager").
 * - `roleAs`     — which base RBAC role this tier inherits. The label is
 *                  cosmetic; permissions come from `roleAs`. A client can
 *                  have many tiers that all map to e.g. "owner".
 * - `cap`        — soft upper bound on instances; `null` = unlimited.
 * - `bucketing`  — controls scoping:
 *     • "separate" → this tier is *scoped under its parent*. Each store gets
 *       its own owners; each owner gets its own employees. Path:
 *       `<parentKey>/<parentInstance>/<key>/<instance>/...`.
 *     • "combined" → this tier is *shared across all peers* of the tier
 *       above. One pool of customers shared by all stores. Path:
 *       `<key>/<instance>/...` (no parent prefix).
 */
/**
 * Tier and Instance are mutually recursive: an Instance can carry its own
 * `branch: Tier[]` so a single instance overrides the default chain for
 * whatever lives under it. Each `Tier` likewise has zero-or-more Instances.
 *
 * Mutually-recursive Zod schemas need an explicit type annotation + z.lazy
 * to break the cycle before the runtime values exist.
 */
export type Instance = {
  label?: string;
  description?: string;
  branch?: Tier[];
};

export type Tier = {
  key: string;
  label: string;
  roleAs: "store" | "owner" | "employee" | "customer";
  cap: number | null;
  bucketing: "separate" | "combined";
  subBuckets: number | null;
  instances?: Instance[];
};

export const InstanceSchema: z.ZodType<Instance> = z.lazy(() =>
  z.object({
    label: z.string().optional(),
    description: z.string().optional(),
    branch: z.array(TierSchema).optional(),
  }),
) as z.ZodType<Instance>;

export const TierSchema: z.ZodType<Tier> = z.lazy(() =>
  z.object({
    key: z.string().min(1).regex(/^[a-z0-9-]+$/),
    label: z.string().min(1),
    roleAs: z.enum(["store", "owner", "employee", "customer"]),
    cap: z.number().int().nullable().default(null),
    bucketing: z.enum(["separate", "combined"]).default("separate"),
    subBuckets: z.number().int().nullable().default(1),
    instances: z.array(InstanceSchema).optional().default([]),
  }),
) as z.ZodType<Tier>;

/**
 * ClientStructure — shape of the org tree the tenant can hold.
 *
 * - `tiers`        — ordered list of tiers (top = closest to admin). Every
 *                    client gets a tiers array; the legacy `roles` field
 *                    below is derived from it for backwards compat.
 * - `linkPolicy`   — "strict": every child must have a parent in the tier
 *                    above. "flexible": children can hang off any ancestor.
 * - `employeeTiers`— toggle whether "primary/secondary" employee distinction
 *                    is exposed in this client's UI.
 * - `roles`        — *derived* convenience copy of each tier's `roleAs`.
 *                    Kept so old read paths keep working.
 */
/**
 * ChartNode — the new canonical shape.
 *
 * A simple recursive tree: every position in the chart is a node. Children
 * fan out below; siblings under the same parent are parallel chains.
 * Boxes with `cap: N` represent N instances at that position. `cap: null`
 * = unlimited.
 */
export type ChartNode = {
  id: string;
  label: string;
  description?: string;
  cap: number | null;
  bucketing: "separate" | "combined";
  /** IDs of OTHER nodes anywhere in the tree this node also links to. */
  linksTo?: string[];
  children: ChartNode[];
};

export const ChartNodeSchema: z.ZodType<ChartNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string().min(1),
    description: z.string().optional(),
    cap: z.number().int().nullable(),
    bucketing: z.enum(["separate", "combined"]),
    linksTo: z.array(z.string()).optional(),
    children: z.array(ChartNodeSchema).default([]),
  }),
) as z.ZodType<ChartNode>;

/**
 * GraphNode — one box on the ReactFlow canvas. `level` is the depth band
 * (0 = closest to admin, then 1, 2, …). Multiple nodes can sit at the same
 * level. `x` is the horizontal position within that band; the canvas keeps
 * vertical spacing uniform so the level lanes stay readable.
 */
export type GraphNode = {
  id: string;
  label: string;
  description?: string;
  level: number;
  x: number;
  y: number;
  cap: number | null;
  bucketing: "separate" | "combined";
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
};

export const GraphNodeSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  description: z.string().optional(),
  level: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
  cap: z.number().int().nullable(),
  bucketing: z.enum(["separate", "combined"]),
});

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});

export const ClientStructureSchema = z.object({
  /** Canonical free-placement canvas: nodes + edges, supports many-to-one. */
  graph: z
    .object({
      nodes: z.array(GraphNodeSchema).default([]),
      edges: z.array(GraphEdgeSchema).default([]),
    })
    .default({ nodes: [], edges: [] }),
  /** Legacy tree (still readable for older clients). */
  boxes: z.array(ChartNodeSchema).default([]),
  /** Legacy tier list — kept for backward compat. */
  tiers: z
    .array(TierSchema)
    .default([]),
  linkPolicy: z.enum(["strict", "flexible"]).default("flexible"),
  employeeTiers: z.boolean().default(true),
  /** Legacy / derived. Don't write — set by mergeStructure() from tiers. */
  roles: z
    .array(z.enum(["store", "owner", "employee", "customer"]))
    .default([]),
});
export type ClientStructure = z.infer<typeof ClientStructureSchema>;

/**
 * Derive legacy `tiers: Tier[]` from a `boxes: ChartNode[]` tree.
 *
 * Mapping: walk depth-first. At each depth we look at the *first* root box's
 * children to determine the next tier's shape (label, cap, bucketing). If
 * siblings differ across instances, the per-instance branches capture it.
 * This is the "best-effort linear projection" used by the folder provisioner.
 */
export function tiersFromBoxes(boxes: ChartNode[]): Tier[] {
  if (boxes.length === 0) return [];
  const out: Tier[] = [];

  // Use the first root as the template; merge in other roots as branches if needed.
  let cursor: ChartNode | undefined = boxes[0];
  while (cursor) {
    out.push(nodeToTier(cursor));
    cursor = cursor.children[0]; // descend along the leftmost path
  }
  return out;
}

function nodeToTier(node: ChartNode): Tier {
  return {
    key: slugify(node.label) || node.id.slice(0, 8),
    label: node.label,
    roleAs: "employee", // placeholder — RBAC inference happens upstream
    cap: node.cap,
    bucketing: node.bucketing,
    subBuckets: node.bucketing === "combined" ? null : 1,
    instances:
      node.cap != null && node.bucketing === "separate"
        ? Array.from({ length: node.cap }, () => ({}))
        : [],
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * Project a graph (nodes + edges) into a degenerate legacy `tiers[]` list.
 * Group nodes by level; pick the first node at each level as the tier
 * archetype. The folder provisioner uses this for prefix layout — anything
 * beyond a linear shape is approximated.
 */
export function tiersFromGraph(graph: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}): Tier[] {
  if (graph.nodes.length === 0) return [];
  const byLevel = new Map<number, GraphNode[]>();
  for (const n of graph.nodes) {
    const arr = byLevel.get(n.level) ?? [];
    arr.push(n);
    byLevel.set(n.level, arr);
  }
  const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
  return levels.map((lvl) => {
    const nodes = byLevel.get(lvl)!;
    const head = nodes[0];
    const sameLabel = nodes.every((n) => n.label === head.label);
    return {
      key: slugify(head.label) || `level-${lvl}`,
      label: sameLabel ? head.label : `Level ${lvl + 1}`,
      roleAs: "employee" as const,
      cap: head.cap,
      bucketing: head.bucketing,
      subBuckets: head.bucketing === "combined" ? null : 1,
      instances: nodes.map((n) => ({
        label: n.label,
        description: n.description,
      })),
    };
  });
}

export function defaultLabels(): ClientLabels {
  return ClientLabelsSchema.parse({});
}
export function defaultStructure(): ClientStructure {
  return ClientStructureSchema.parse({});
}

/** Apply a partial override on top of the defaults. */
export function mergeLabels(over: Partial<ClientLabels> = {}): ClientLabels {
  return ClientLabelsSchema.parse({ ...defaultLabels(), ...over });
}
export function mergeStructure(over: Partial<ClientStructure> = {}): ClientStructure {
  const merged = ClientStructureSchema.parse({ ...defaultStructure(), ...over });
  // Always derive `roles` from `tiers` (single source of truth).
  merged.roles = Array.from(new Set(merged.tiers.map((t) => t.roleAs)));
  return merged;
}
