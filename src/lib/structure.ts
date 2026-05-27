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
import type { ClientStructure, Tier } from "@/types/client-structure";

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
  const out: string[] = [];
  for (const tier of structure.tiers) {
    if (tier.bucketing === "separate") {
      out.push(`${tier.key}/`);
      continue;
    }
    // combined
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
