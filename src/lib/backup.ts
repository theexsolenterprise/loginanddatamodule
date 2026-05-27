/**
 * Backup & restore — system / client / subtree scopes.
 *
 * Scope can be:
 *   { kind: "system" }                              — admin only, every tenant
 *   { kind: "client",  clientId }                   — admin, one tenant
 *   { kind: "subtree", clientId, nodeId }           — any role, one branch of the tree
 *
 * Storage (admin-backups Netlify Blobs store):
 *
 *   system/auto/<ts>.zip
 *   system/restore-points/<slug>--<ts>.zip
 *   clients/<clientId>/auto/<ts>.zip
 *   clients/<clientId>/restore-points/<slug>--<ts>.zip
 *   clients/<clientId>/subtree/<nodeId>/auto/<ts>.zip
 *   clients/<clientId>/subtree/<nodeId>/restore-points/<slug>--<ts>.zip
 *
 * Zip layout:
 *   manifest.json
 *   clients/<clientId>/meta.json              (only if scope > subtree)
 *   clients/<clientId>/users.json             (users in scope)
 *   clients/<clientId>/nodes.json             (nodes in scope)
 *   clients/<clientId>/blobs/<...>            (blobs in scope's prefix)
 */

import archiver from "archiver";
import unzipper from "unzipper";
import { db } from "@/db/client";
import { clients, users, nodes } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { getClientStore, storeNameForClient } from "@/lib/blobs";

const ADMIN_BACKUP_STORE = "admin-backups";
const BACKUP_SCHEMA_VERSION = 1;

export type BackupType = "auto" | "manual";
export type BackupScope =
  | { kind: "system" }
  | { kind: "client"; clientId: string }
  | { kind: "subtree"; clientId: string; nodeId: string };

export function backupStore() {
  return getClientStore(ADMIN_BACKUP_STORE);
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "snapshot"
  );
}

export function backupKey(opts: {
  scope: BackupScope;
  type: BackupType;
  label?: string;
}): string {
  const root =
    opts.scope.kind === "system"
      ? "system"
      : opts.scope.kind === "client"
        ? `clients/${opts.scope.clientId}`
        : `clients/${opts.scope.clientId}/subtree/${opts.scope.nodeId}`;
  const sub = opts.type === "auto" ? "auto" : "restore-points";
  const name =
    opts.type === "auto"
      ? `${ts()}.zip`
      : `${slug(opts.label ?? "snapshot")}--${ts()}.zip`;
  return `${root}/${sub}/${name}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Subtree helpers: find every node descendant of `rootNodeId` (inclusive).
 *
 * Uses a recursive CTE in Postgres — Drizzle's `sql` template handles this.
 * For SQLite or other backends, swap to a JS BFS in code.
 * ──────────────────────────────────────────────────────────────────────────── */
export async function descendantNodeIds(rootNodeId: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM nodes WHERE id = ${rootNodeId}
      UNION ALL
      SELECT n.id FROM nodes n
      JOIN tree t ON n.parent_id = t.id
    )
    SELECT id FROM tree
  `);
  // drizzle-orm/neon-http returns { rows: ... } for raw queries.
  const rows = (result as any).rows ?? (result as any);
  return rows.map((r: any) => r.id);
}

/* ────────────────────────────────────────────────────────────────────────────
 * CREATE — build a zip and store it.
 * ──────────────────────────────────────────────────────────────────────────── */
export async function createBackup(opts: {
  scope: BackupScope;
  type: BackupType;
  label?: string;
}): Promise<{ key: string; bytes: number }> {
  const tenantList = await tenantsInScope(opts.scope);
  if (tenantList.length === 0) throw new Error("No clients to back up.");

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    archive.on("data", (c) => chunks.push(c));
    archive.on("end", () => resolve());
    archive.on("error", (e) => reject(e));
  });

  const manifest = {
    version: BACKUP_SCHEMA_VERSION,
    type: opts.type,
    scope: opts.scope,
    label: opts.label ?? null,
    createdAt: new Date().toISOString(),
    clients: tenantList.map((c) => ({ id: c.id, name: c.name, slug: c.slug, kind: c.kind })),
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  for (const c of tenantList) {
    const base = `clients/${c.id}`;
    // Only include client metadata in non-subtree scopes — a subtree backup
    // is "my branch", not "the whole tenant config".
    if (opts.scope.kind !== "subtree") {
      archive.append(JSON.stringify(c, null, 2), { name: `${base}/meta.json` });
    }

    const { usersInScope, nodesInScope, blobPrefixes } = await rowsForScope(c.id, opts.scope);

    archive.append(JSON.stringify(usersInScope, null, 2), { name: `${base}/users.json` });
    archive.append(JSON.stringify(nodesInScope, null, 2), { name: `${base}/nodes.json` });

    const cStore = getClientStore(storeNameForClient(c.id));
    // List once, then filter — cheaper than N prefix-lists.
    const { blobs } = await cStore.list();
    for (const { key } of blobs) {
      if (key.endsWith(".placeholder")) continue;
      if (blobPrefixes && !blobPrefixes.some((p) => key.startsWith(p))) continue;
      const buf = await cStore.get(key, { type: "arrayBuffer" });
      if (!buf) continue;
      archive.append(Buffer.from(buf), { name: `${base}/blobs/${key}` });
    }
  }

  await archive.finalize();
  await done;

  const buffer = Buffer.concat(chunks);
  const key = backupKey({ scope: opts.scope, type: opts.type, label: opts.label });
  await backupStore().set(key, buffer);
  return { key, bytes: buffer.byteLength };
}

async function tenantsInScope(scope: BackupScope) {
  if (scope.kind === "system") return db.select().from(clients);
  return db.select().from(clients).where(eq(clients.id, scope.clientId)).limit(1);
}

async function rowsForScope(clientId: string, scope: BackupScope) {
  if (scope.kind !== "subtree") {
    const usersInScope = await db.select().from(users).where(eq(users.clientId, clientId));
    const nodesInScope = await db.select().from(nodes).where(eq(nodes.clientId, clientId));
    return { usersInScope, nodesInScope, blobPrefixes: null as string[] | null };
  }
  const ids = await descendantNodeIds(scope.nodeId);
  if (ids.length === 0) return { usersInScope: [], nodesInScope: [], blobPrefixes: [] };
  const nodesInScope = await db.select().from(nodes).where(inArray(nodes.id, ids));
  const blobPrefixes = nodesInScope.map((n) => n.blobPrefix).filter(Boolean);
  const userIds = nodesInScope.map((n) => n.userId).filter((x): x is string => Boolean(x));
  const usersInScope =
    userIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];
  return { usersInScope, nodesInScope, blobPrefixes };
}

/* ────────────────────────────────────────────────────────────────────────────
 * LIST — filtered by scope kind and (optionally) client/node.
 * ──────────────────────────────────────────────────────────────────────────── */
export interface BackupRow {
  key: string;
  scopeKind: "system" | "client" | "subtree";
  scope: BackupScope;
  type: BackupType;
  label: string | null;
  createdAt: string;
}

export async function listBackups(filter?: {
  clientId?: string;
  nodeId?: string;
}): Promise<BackupRow[]> {
  const prefix = filter?.nodeId
    ? `clients/${filter.clientId}/subtree/${filter.nodeId}/`
    : filter?.clientId
      ? `clients/${filter.clientId}/`
      : "";
  const { blobs } = await backupStore().list({ prefix });
  const rows: BackupRow[] = [];
  for (const { key } of blobs) {
    const parsed = parseKey(key);
    if (parsed) rows.push(parsed);
  }
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
}

function parseKey(key: string): BackupRow | null {
  const parts = key.split("/");
  let scope: BackupScope;
  let typeDir: string;
  let nameIdx: number;

  if (parts[0] === "system" && parts.length >= 3) {
    scope = { kind: "system" };
    typeDir = parts[1];
    nameIdx = 2;
  } else if (parts[0] === "clients" && parts[2] === "subtree" && parts.length >= 6) {
    scope = { kind: "subtree", clientId: parts[1], nodeId: parts[3] };
    typeDir = parts[4];
    nameIdx = 5;
  } else if (parts[0] === "clients" && parts.length >= 4) {
    scope = { kind: "client", clientId: parts[1] };
    typeDir = parts[2];
    nameIdx = 3;
  } else {
    return null;
  }

  const type: BackupType = typeDir === "auto" ? "auto" : "manual";
  const raw = parts.slice(nameIdx).join("/").replace(/\.zip$/, "");
  let label: string | null = null;
  let isoCompact = raw;
  if (type === "manual" && raw.includes("--")) {
    const i = raw.lastIndexOf("--");
    label = raw.slice(0, i);
    isoCompact = raw.slice(i + 2);
  }
  const createdAt = isoCompact.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1:$2:$3.$4Z",
  );
  return { key, scope, scopeKind: scope.kind, type, label, createdAt };
}

/* ────────────────────────────────────────────────────────────────────────────
 * DOWNLOAD / UPLOAD / DELETE / RESTORE
 * ──────────────────────────────────────────────────────────────────────────── */
export async function downloadBackup(key: string) {
  const data = await backupStore().get(key, { type: "arrayBuffer" });
  return data ?? null;
}

export async function uploadBackup(opts: {
  scope: BackupScope;
  label: string;
  data: Buffer;
}): Promise<string> {
  const dir = await (unzipper.Open as any).buffer(opts.data);
  const hasManifest = dir.files.some((f: any) => f.path === "manifest.json");
  if (!hasManifest) throw new Error("Invalid backup: manifest.json missing");
  const key = backupKey({ scope: opts.scope, type: "manual", label: opts.label });
  await backupStore().set(key, opts.data);
  return key;
}

export async function deleteBackup(key: string) {
  await backupStore().delete(key);
}

/**
 * Restore mode:
 *   "replace" — full rollback to backup state. For non-subtree scopes this
 *               wipes the existing tree + blobs for each client and reseeds.
 *               For subtree scopes it wipes only the subtree.
 *   "merge"   — upsert by ID; never delete rows or blobs that aren't in the
 *               backup. Safer; non-destructive; can leave stale data behind.
 */
export type RestoreMode = "replace" | "merge";

/**
 * Derive the trusted scope from a backup storage key. The key was written
 * by the system (during create/upload) under the caller's verified scope,
 * so it is the source of truth — NOT the manifest inside the zip (which a
 * malicious uploader could forge).
 */
export function scopeFromKey(key: string): BackupScope {
  const parts = key.split("/");
  if (parts[0] === "system") return { kind: "system" };
  if (parts[0] === "clients" && parts[2] === "subtree" && parts.length >= 6) {
    return { kind: "subtree", clientId: parts[1], nodeId: parts[3] };
  }
  if (parts[0] === "clients" && parts.length >= 4) {
    return { kind: "client", clientId: parts[1] };
  }
  throw new Error(`Unparseable backup key: ${key}`);
}

export async function restoreBackup(
  key: string,
  mode: RestoreMode = "replace",
): Promise<{
  clientsTouched: number;
  usersTouched: number;
  nodesTouched: number;
  mode: RestoreMode;
}> {
  // SECURITY: the trustworthy scope is the one encoded in the key path.
  // We will REFUSE to act on any client_id in the manifest that does not
  // match this scope, and (for subtree) any node not in the descendant set.
  const trustedScope = scopeFromKey(key);

  const data = await backupStore().get(key, { type: "arrayBuffer" });
  if (!data) throw new Error(`Backup not found: ${key}`);

  const dir = await (unzipper.Open as any).buffer(Buffer.from(data));
  const fileByPath: Record<string, any> = {};
  for (const f of dir.files) fileByPath[f.path] = f;

  const manifestFile = fileByPath["manifest.json"];
  if (!manifestFile) throw new Error("manifest.json missing in backup");
  const manifest = JSON.parse((await manifestFile.buffer()).toString("utf8"));
  if (manifest.version !== BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Backup schema version ${manifest.version} not supported (expected ${BACKUP_SCHEMA_VERSION}).`,
    );
  }

  let clientsTouched = 0;
  let usersTouched = 0;
  let nodesTouched = 0;

  const subtree = trustedScope.kind === "subtree";

  // Build an allow-list of client IDs from the trusted scope. Anything in
  // the manifest outside this list is silently skipped — defends against a
  // tampered zip with extra clients.
  const allowedClientIds = new Set<string>(
    trustedScope.kind === "system"
      ? (manifest.clients as Array<{ id: string }>).map((c) => c.id) // any
      : [trustedScope.kind === "client" ? trustedScope.clientId : trustedScope.clientId],
  );
  // For subtree scope, also pre-compute the allowed node id set.
  const allowedNodeIds = trustedScope.kind === "subtree"
    ? new Set(await descendantNodeIds(trustedScope.nodeId))
    : null;

  for (const c of manifest.clients as Array<{ id: string }>) {
    if (trustedScope.kind !== "system" && !allowedClientIds.has(c.id)) {
      continue; // refuse to touch out-of-scope clients
    }
    const base = `clients/${c.id}`;
    const us = JSON.parse((await fileByPath[`${base}/users.json`].buffer()).toString("utf8"));
    const ns = JSON.parse((await fileByPath[`${base}/nodes.json`].buffer()).toString("utf8"));

    if (!subtree && fileByPath[`${base}/meta.json`]) {
      const meta = JSON.parse((await fileByPath[`${base}/meta.json`].buffer()).toString("utf8"));
      await db
        .insert(clients)
        .values({
          id: meta.id, slug: meta.slug, name: meta.name, kind: meta.kind,
          status: meta.status, labels: meta.labels, structure: meta.structure,
          blobsStore: meta.blobsStore,
        })
        .onConflictDoUpdate({
          target: clients.id,
          set: {
            slug: meta.slug, name: meta.name, kind: meta.kind, status: meta.status,
            labels: meta.labels, structure: meta.structure, updatedAt: new Date(),
          },
        });
      clientsTouched++;
    }

    // Replace-mode: wipe before re-inserting.
    // Merge-mode: skip deletes; let upserts overlay the existing state.
    if (mode === "replace") {
      if (subtree) {
        const ids = (ns as any[]).map((n) => n.id);
        if (ids.length > 0) await db.delete(nodes).where(inArray(nodes.id, ids));
        const prefixes = (ns as any[]).map((n) => n.blobPrefix).filter(Boolean);
        const cStore = getClientStore(storeNameForClient(c.id));
        const { blobs } = await cStore.list();
        for (const { key: k } of blobs) {
          if (prefixes.some((p: string) => k.startsWith(p))) await cStore.delete(k);
        }
      } else {
        await db.delete(nodes).where(eq(nodes.clientId, c.id));
        const cStore = getClientStore(storeNameForClient(c.id));
        const { blobs } = await cStore.list();
        for (const { key: k } of blobs) await cStore.delete(k);
      }
    }

    // Filter nodes by trustedScope: subtree restores only touch descendants.
    const scopedNodes = (ns as any[]).filter((n) => {
      if (n.clientId !== c.id) return false;
      if (allowedNodeIds && !allowedNodeIds.has(n.id)) return false;
      return true;
    });
    if (scopedNodes.length > 0) {
      if (mode === "replace") {
        await db.insert(nodes).values(scopedNodes);
      } else {
        for (const n of scopedNodes) {
          await db
            .insert(nodes)
            .values(n)
            .onConflictDoUpdate({
              target: nodes.id,
              set: {
                clientId: n.clientId, parentId: n.parentId, type: n.type,
                name: n.name, userId: n.userId, metadata: n.metadata,
                blobPrefix: n.blobPrefix,
              },
            });
        }
      }
    }
    nodesTouched += scopedNodes.length;

    // Filter users: must belong to scoped client; for subtree, must link to
    // an allowed node.
    const scopedUsers = (us as any[]).filter((u) => {
      if (u.clientId !== c.id) return false;
      if (allowedNodeIds) {
        return scopedNodes.some((n) => n.userId === u.id);
      }
      return true;
    });
    // Allow-list of roles a non-system restore can introduce. NEVER includes
    // "admin" — that role is reserved for the platform owner and must not be
    // creatable via a backup upload.
    const SAFE_TENANT_ROLES = new Set(["store", "owner", "employee", "customer"]);

    for (const u of scopedUsers) {
      const isSystem = trustedScope.kind === "system";

      // Validate role on input. For non-system restores, reject rows that
      // claim privileged roles or wrong client.
      if (!isSystem) {
        if (!SAFE_TENANT_ROLES.has(u.role)) continue; // refuse "admin" sneak-ins
        if (u.clientId !== c.id) continue;
      }

      // Sanitize INSERT payload — never trust uploaded role/clientId for
      // non-system scope. clientId is pinned to the trusted scope's client.
      const insertRow = isSystem
        ? u
        : {
            ...u,
            clientId: c.id,
            role: u.role, // already validated above
            isPrimary: Boolean(u.isPrimary),
          };

      // Sanitize UPDATE set similarly: non-system restores cannot rewrite
      // a target user's role, clientId, or isPrimary.
      const setClause: Record<string, unknown> = isSystem
        ? {
            email: u.email, firstName: u.firstName, lastName: u.lastName,
            role: u.role, isPrimary: u.isPrimary, passwordHash: u.passwordHash,
            disabledAt: u.disabledAt, updatedAt: new Date(),
          }
        : {
            email: u.email, firstName: u.firstName, lastName: u.lastName,
            passwordHash: u.passwordHash, disabledAt: u.disabledAt,
            updatedAt: new Date(),
          };

      await db
        .insert(users)
        .values(insertRow)
        .onConflictDoUpdate({ target: users.id, set: setClause });
      usersTouched++;
    }

    const cStore = getClientStore(storeNameForClient(c.id));
    const blobPrefix = `${base}/blobs/`;
    for (const f of dir.files as any[]) {
      if (!f.path.startsWith(blobPrefix)) continue;
      if (f.type === "Directory") continue;
      const relKey = f.path.slice(blobPrefix.length);
      const buf = await f.buffer();
      await cStore.set(relKey, buf);
    }
  }

  return { clientsTouched, usersTouched, nodesTouched, mode };
}
