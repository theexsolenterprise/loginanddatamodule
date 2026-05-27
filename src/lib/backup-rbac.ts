/**
 * Backup-specific authorization: who can backup/restore what scope.
 *
 * Pulled out of lib/rbac.ts so the rules sit next to the backup code that
 * uses them — easier to audit.
 */

import { db } from "@/db/client";
import { nodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { BackupScope } from "@/lib/backup";
import type { Actor } from "@/lib/rbac";

export async function canBackupScope(actor: Actor, scope: BackupScope): Promise<boolean> {
  if (actor.role === "admin") return true; // admin can do any scope
  if (scope.kind === "system" || scope.kind === "client") return false;

  // subtree: must belong to actor's client AND the actor's user-linked node
  // must be an ancestor (or equal) of the scope's nodeId.
  if (scope.clientId !== actor.clientId) return false;

  const myNodeId = await nodeIdForUser(actor.id);
  if (!myNodeId) return false;
  if (myNodeId === scope.nodeId) return true;

  // Walk up from scope.nodeId; if we hit myNodeId, allow.
  let cursor: string | null = scope.nodeId;
  while (cursor) {
    if (cursor === myNodeId) return true;
    const [row] = await db.select({ parentId: nodes.parentId }).from(nodes).where(eq(nodes.id, cursor)).limit(1);
    cursor = row?.parentId ?? null;
  }
  return false;
}

async function nodeIdForUser(userId: string): Promise<string | null> {
  const [row] = await db.select({ id: nodes.id }).from(nodes).where(eq(nodes.userId, userId)).limit(1);
  return row?.id ?? null;
}
