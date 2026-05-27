/**
 * Folder provisioner & blob-prefix helpers.
 *
 * "Dynamic" means: the folder layout is generated from `structure.tiers[]`,
 * not from a hardcoded role list. Each tier contributes one top-level
 * folder; bucketing decides whether that folder will hold per-instance
 * subfolders or shared content.
 */

import { db } from "@/db/client";
import { clients, nodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensurePrefix, getClientStore, storeNameForClient } from "@/lib/blobs";
import type { ClientStructure, Tier, GraphNode, GraphEdge } from "@/types/client-structure";

/**
 * Compute the initial folder plan for a freshly-onboarded client.
 *
 * Rules:
 *   bucketing = "separate"             → `<key>/`           (per-instance subfolders go here later)
 *   bucketing = "combined", subBuckets=1   → `<key>/_shared/`   (one pool)
 *   bucketing = "combined", subBuckets=null → `<key>/`         (unlimited subfolders go here later)
 *   bucketing = "combined", subBuckets=N   → `<key>/` + N placeholders `<key>/sub-1/`, etc.
 */
export function defaultFolderPlan(structure: ClientStructure): string[] {
  // Prefer the graph projection — it mirrors the actual chart the admin built.
  if (structure.graph && structure.graph.nodes.length > 0) {
    return folderPlanFromGraph(structure.graph);
  }
  // Fallback for clients without a graph yet.
  const out: string[] = [];
  for (const tier of structure.tiers ?? []) {
    if (tier.bucketing === "separate") {
      out.push(`${tier.key}/`);
      continue;
    }
    if (tier.subBuckets === 1) {
      out.push(`${tier.key}/_shared/`);
    } else if (tier.subBuckets == null) {
      out.push(`${tier.key}/`);
    } else {
      out.push(`${tier.key}/`);
      for (let i = 1; i <= tier.subBuckets; i++) out.push(`${tier.key}/sub-${i}/`);
    }
  }
  return out;
}

/**
 * Project a graph into a folder layout.
 *
 * Each node becomes one folder. A node's path is built by walking up its
 * *canonical* parent chain — the first incoming edge wins (defining a
 * spanning tree over the graph). Other incoming edges remain logical-only
 * relationships in the data, not folder duplicates.
 *
 * Combined-bucketed nodes ignore their parent chain and live at root
 * (`<label>/`), to reflect their "shared across peers" semantics.
 *
 * Slug collisions get a numeric suffix so two boxes both labelled
 * "Store" still get distinct prefixes.
 */
export function folderPlanFromGraph(graph: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}): string[] {
  // Index nodes + map of canonical parent (first incoming edge wins).
  const nodeById = new Map<string, GraphNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);
  const canonParent = new Map<string, string>();
  for (const e of graph.edges) {
    if (!canonParent.has(e.target)) canonParent.set(e.target, e.source);
  }
  // Compute path per node, memoized.
  const pathFor = new Map<string, string>();
  const usedSlugs = new Set<string>(); // for global collision avoidance at root

  function pathOf(id: string): string {
    if (pathFor.has(id)) return pathFor.get(id)!;
    const n = nodeById.get(id);
    if (!n) return "";
    const mySlug = slug(n.label) || `node-${id.slice(0, 6)}`;
    if (n.bucketing === "combined") {
      // Combined → flat at root, ignore parent.
      const taken = uniquify(mySlug, usedSlugs);
      const p = `${taken}/`;
      pathFor.set(id, p);
      return p;
    }
    const parentId = canonParent.get(id);
    if (!parentId) {
      const taken = uniquify(mySlug, usedSlugs);
      const p = `${taken}/`;
      pathFor.set(id, p);
      return p;
    }
    const parentPath = pathOf(parentId);
    const p = `${parentPath}${mySlug}/`;
    pathFor.set(id, p);
    return p;
  }

  return graph.nodes.map((n) => pathOf(n.id));
}

function uniquify(base: string, seen: Set<string>): string {
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  let i = 2;
  while (seen.has(`${base}-${i}`)) i++;
  const out = `${base}-${i}`;
  seen.add(out);
  return out;
}

/** Provision the Netlify Blobs store for a new client. */
export async function provisionClientStore(opts: {
  clientId: string;
  structure: ClientStructure;
}): Promise<string> {
  const storeName = storeNameForClient(opts.clientId);
  const store = getClientStore(storeName);

  await store.set(
    "_meta/manifest.json",
    JSON.stringify(
      {
        clientId: opts.clientId,
        provisionedAt: new Date().toISOString(),
        structure: opts.structure,
      },
      null,
      2,
    ),
  );

  for (const prefix of defaultFolderPlan(opts.structure)) {
    await ensurePrefix(store, prefix);
  }
  return storeName;
}

/**
 * Compute the blob prefix for a single node, walking up the parent chain
 * AND respecting each ancestor tier's bucketing rule.
 *
 * Example: a "patient" node (combined customer) under a "Mercy" store
 * (separate) has prefix `customer/<patientName>/` — the store does NOT
 * prefix it because the tier is combined.
 */
export async function computeBlobPrefix(nodeId: string, structure: ClientStructure): Promise<string> {
  const chain: { type: string; name: string }[] = [];
  let cursor: string | null = nodeId;
  while (cursor) {
    const [row] = await db.select().from(nodes).where(eq(nodes.id, cursor)).limit(1);
    if (!row) break;
    chain.unshift({ type: row.type, name: slug(row.name) });
    cursor = row.parentId;
  }
  const out: string[] = [];
  for (const link of chain) {
    const tier = findTierByRoleAs(structure, link.type);
    if (tier?.bucketing === "combined") {
      // combined → flat at root, ignore parent's prefix
      out.length = 0;
      out.push(`${tier.key}/${link.name}/`);
    } else {
      out.push(`${tier?.key ?? link.type}/${link.name}/`);
    }
  }
  return out.join("");
}

function findTierByRoleAs(structure: ClientStructure, roleAs: string): Tier | undefined {
  return structure.tiers.find((t) => t.roleAs === roleAs);
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function provisionNodeFolder(storeName: string, prefix: string): Promise<void> {
  const store = getClientStore(storeName);
  await ensurePrefix(store, prefix);
}
