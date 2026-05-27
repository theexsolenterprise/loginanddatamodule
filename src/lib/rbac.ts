/**
 * RBAC — Role-Based Access Control helpers.
 *
 * This module is the *single source of truth* for "who can do what to whom".
 * Every API route and server action should call `canManage()` or `can()`
 * instead of writing its own role checks.
 *
 * Design:
 *   - "Manage" = create / read / update / delete *another user's* account
 *     (name, password, role, etc.).
 *   - "Act"    = perform a non-user-management action (read data, write data,
 *     run backup, etc.). Permissions are keyed by string actions.
 */

import type { Role, User } from "@/db/schema";

/* ────────────────────────────────────────────────────────────────────────────
 * Role hierarchy. Higher numbers = more privileged. Same client only.
 * ──────────────────────────────────────────────────────────────────────────── */
const RANK: Record<Role, number> = {
  customer: 1,
  employee: 2,
  owner: 3,
  store: 4,
  admin: 5,
};

export type Actor = Pick<User, "id" | "role" | "clientId" | "isPrimary">;

/**
 * canManage — can `actor` create/update/delete `target`?
 *
 * Rules:
 *   1. Admin can manage anyone.
 *   2. Same-client: a higher rank can manage a strictly lower rank.
 *   3. A user can always manage *themselves* (password, profile, etc.).
 *   4. A "secondary" employee cannot manage other users at all, even if rank
 *      math would allow it. Secondary = limited tier.
 *   5. Cross-client: never, except admin.
 */
export function canManage(actor: Actor, target: Actor): boolean {
  if (actor.role === "admin") return true;
  if (actor.id === target.id) return true;
  if (actor.clientId !== target.clientId) return false;
  if (actor.role === "employee" && !actor.isPrimary) return false;
  return RANK[actor.role] > RANK[target.role];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action permissions. Default-deny — actions not listed for a role are denied.
 *
 * EDITABLE BY USER — this matrix is intentionally short and opinionated; tune
 * it to your domain. Add/remove actions as you discover them in the UI.
 * ──────────────────────────────────────────────────────────────────────────── */
export const ACTIONS = {
  CLIENT_CRUD: "client:crud", // create/edit/delete tenants
  CLIENT_BACKUP: "client:backup", // download tenant backup zip
  USER_INVITE: "user:invite", // create new users within a client
  USER_DISABLE: "user:disable", // soft-disable a user
  BLOB_WRITE: "blob:write", // upload data into the client store
  BLOB_READ: "blob:read", // download/list data
  STRUCTURE_EDIT: "structure:edit", // reshape labels/caps on a client
  SELF_ACCOUNT: "self:account", // change own password/name/email
} as const;
export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

const PERMISSIONS: Record<Role, Set<Action>> = {
  admin: new Set([
    ACTIONS.CLIENT_CRUD,
    ACTIONS.CLIENT_BACKUP,
    ACTIONS.USER_INVITE,
    ACTIONS.USER_DISABLE,
    ACTIONS.BLOB_WRITE,
    ACTIONS.BLOB_READ,
    ACTIONS.STRUCTURE_EDIT,
    ACTIONS.SELF_ACCOUNT,
  ]),
  store: new Set([
    ACTIONS.USER_INVITE,
    ACTIONS.USER_DISABLE,
    ACTIONS.BLOB_READ,
    ACTIONS.BLOB_WRITE,
    ACTIONS.SELF_ACCOUNT,
  ]),
  owner: new Set([
    ACTIONS.USER_INVITE,
    ACTIONS.BLOB_READ,
    ACTIONS.BLOB_WRITE,
    ACTIONS.SELF_ACCOUNT,
  ]),
  employee: new Set([
    // Primary vs. secondary is enforced by `can()` below, not here.
    ACTIONS.BLOB_READ,
    ACTIONS.BLOB_WRITE,
    ACTIONS.SELF_ACCOUNT,
  ]),
  customer: new Set([
    ACTIONS.BLOB_READ, // own data only — enforce in the handler with a prefix check
    ACTIONS.SELF_ACCOUNT,
  ]),
};

const SECONDARY_EMPLOYEE_DENY: Set<Action> = new Set([ACTIONS.BLOB_WRITE]);

export function can(actor: Actor, action: Action): boolean {
  const allowed = PERMISSIONS[actor.role]?.has(action) ?? false;
  if (!allowed) return false;
  if (actor.role === "employee" && !actor.isPrimary && SECONDARY_EMPLOYEE_DENY.has(action)) {
    return false;
  }
  return true;
}

/** Throwing variant for use in API routes — yields a 403 Response. */
export function assertCan(actor: Actor, action: Action) {
  if (!can(actor, action)) {
    throw new Response(`Forbidden: missing permission "${action}"`, { status: 403 });
  }
}
