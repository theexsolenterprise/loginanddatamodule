import { db } from "@/db/client";
import { users, nodes } from "@/db/schema";
import { and, eq, ne, inArray, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "../../auth";
import { canManage, ACTIONS, can, type Actor } from "@/lib/rbac";
import { descendantNodeIds } from "@/lib/backup";
import { sendInvite, sendPasswordReset } from "@/lib/email";

/**
 * Lists users that the current actor can manage and lets them edit name,
 * email, reset password, change role/tier, disable/enable, and invite new
 * users below them.
 *
 * Visibility scope:
 *   admin          → every user except themselves
 *   store/owner/employee  → users whose node is in the actor's subtree
 *   customer       → none (returns null so the section hides entirely)
 *
 * Permission gates are enforced in the server actions too, so the UI can't
 * be tricked into managing a forbidden target by editing form data.
 */
export async function TeamSection() {
  const session = await auth();
  const me = session!.user;
  const actor: Actor = {
    id: me.id, role: me.role, clientId: me.clientId, isPrimary: me.isPrimary,
  };
  if (!can(actor, ACTIONS.USER_INVITE) && me.role !== "admin") {
    // No subordinates and no invite permission → render nothing.
    return null;
  }

  // Resolve which users are visible.
  const visible = await visibleUsers(actor);

  async function updateUser(formData: FormData) {
    "use server";
    const targetId = String(formData.get("id"));
    const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return;
    if (!canManage(actor, asActor(target))) throw new Error("Forbidden");
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const isPrimary = formData.get("isPrimary") === "on";
    await db.update(users).set({
      firstName: firstName || target.firstName,
      lastName: lastName || target.lastName,
      email: email || target.email,
      isPrimary,
      updatedAt: new Date(),
    }).where(eq(users.id, targetId));
    revalidatePath("/admin/settings");
    revalidatePath("/app/settings");
  }

  async function resetPassword(formData: FormData) {
    "use server";
    const targetId = String(formData.get("id"));
    const next = String(formData.get("password") ?? "");
    if (next.length < 8) throw new Error("Password must be 8+ characters.");
    const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return;
    if (!canManage(actor, asActor(target))) throw new Error("Forbidden");
    const passwordHash = await bcrypt.hash(next, 12);
    await db.update(users).set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, targetId));
    // Best-effort notify; ignore if email isn't configured.
    sendPasswordReset({
      to: target.email,
      firstName: target.firstName,
      newPassword: next,
      setBy: `${me.firstName} ${me.lastName}`.trim(),
      appUrl: process.env.APP_URL ?? "http://localhost:8888",
    }).catch((e) => console.warn("[email] reset notify failed", e));
  }

  async function deleteUser(formData: FormData) {
    "use server";
    const targetId = String(formData.get("id"));
    const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return;
    if (!canManage(actor, asActor(target))) throw new Error("Forbidden");
    if (target.id === actor.id) throw new Error("Cannot delete yourself here.");
    await db.delete(users).where(eq(users.id, targetId));
    revalidatePath("/admin/settings");
    revalidatePath("/app/settings");
  }

  async function setDisabled(formData: FormData) {
    "use server";
    const targetId = String(formData.get("id"));
    const disable = formData.get("disable") === "true";
    const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return;
    if (!canManage(actor, asActor(target))) throw new Error("Forbidden");
    await db.update(users).set({
      disabledAt: disable ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(users.id, targetId));
    revalidatePath("/admin/settings");
    revalidatePath("/app/settings");
  }

  async function inviteUser(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const role = String(formData.get("role") ?? "");
    const password = String(formData.get("password") ?? "");
    const isPrimary = formData.get("isPrimary") === "on";
    const allowed = allowedInviteRoles(actor);
    if (!allowed.includes(role as any)) throw new Error("Cannot invite that role.");
    if (!email || !firstName || !lastName || password.length < 8) {
      throw new Error("Fill all fields; password must be 8+ chars.");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(users).values({
      clientId: actor.clientId,
      role: role as any,
      isPrimary,
      email, firstName, lastName, passwordHash,
    });
    sendInvite({
      to: email, firstName,
      tempPassword: password,
      inviterName: `${me.firstName} ${me.lastName}`.trim(),
      appUrl: process.env.APP_URL ?? "http://localhost:8888",
    }).catch((e) => console.warn("[email] invite failed", e));
    revalidatePath("/admin/settings");
    revalidatePath("/app/settings");
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">
          Team — people I can manage
        </h2>
        <span className="text-xs text-zinc-500">{visible.length} user(s)</span>
      </header>

      {/* Invite */}
      {allowedInviteRoles(actor).length > 0 && (
        <form action={inviteUser} className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-6">
          <input name="firstName" placeholder="First name" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          <input name="lastName" placeholder="Last name" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          <input name="email" type="email" placeholder="Email" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:col-span-2" />
          <select name="role" defaultValue={allowedInviteRoles(actor)[0]} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
            {allowedInviteRoles(actor).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input name="password" type="password" placeholder="Temp password" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 sm:col-span-5">
            <input type="checkbox" name="isPrimary" defaultChecked />
            Primary tier (only matters for employees)
          </label>
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800">Invite</button>
        </form>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-zinc-300 p-4 text-xs text-zinc-500">
          No subordinates yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100">
          {visible.map((u) => (
            <li key={u.id} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-12 sm:items-center">
              <form action={updateUser} className="contents">
                <input type="hidden" name="id" value={u.id} />
                <input name="firstName" defaultValue={u.firstName} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:col-span-2" />
                <input name="lastName" defaultValue={u.lastName} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:col-span-2" />
                <input name="email" defaultValue={u.email} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:col-span-3" />
                <span className="text-xs text-zinc-500 sm:col-span-2">
                  {u.role}
                  {u.role === "employee" && (
                    <label className="ml-2 inline-flex items-center gap-1">
                      <input type="checkbox" name="isPrimary" defaultChecked={u.isPrimary} />
                      primary
                    </label>
                  )}
                </span>
                <span className="text-xs text-zinc-500 sm:col-span-2">
                  {u.disabledAt ? <span className="text-amber-600">disabled</span> : <span className="text-emerald-600">active</span>}
                </span>
                <button type="submit" className="rounded-md bg-zinc-100 px-2 py-1 text-xs hover:bg-zinc-200 sm:col-span-1">
                  Save
                </button>
              </form>
              <form action={resetPassword} className="flex items-center gap-2 sm:col-start-1 sm:col-span-7">
                <input type="hidden" name="id" value={u.id} />
                <input name="password" type="password" placeholder="New password" className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs" />
                <button type="submit" className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-50">
                  Reset password
                </button>
              </form>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-5 sm:justify-self-end">
                <form action={setDisabled}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="disable" value={u.disabledAt ? "false" : "true"} />
                  <button
                    type="submit"
                    className={
                      "rounded-md border px-2 py-1 text-xs " +
                      (u.disabledAt
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100")
                    }
                  >
                    {u.disabledAt ? "Enable" : "Disable"}
                  </button>
                </form>
                <form action={deleteUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What roles can `actor` invite? Stays in sync with the RBAC rank table. */
function allowedInviteRoles(actor: Actor): string[] {
  if (actor.role === "admin") return ["store", "owner", "employee", "customer"];
  if (actor.role === "store") return ["owner", "employee", "customer"];
  if (actor.role === "owner") return ["employee", "customer"];
  if (actor.role === "employee" && actor.isPrimary) return ["customer"];
  return [];
}

function asActor(u: any): Actor {
  return { id: u.id, role: u.role, clientId: u.clientId, isPrimary: u.isPrimary };
}

async function visibleUsers(actor: Actor) {
  if (actor.role === "admin") {
    return db.select().from(users).where(ne(users.id, actor.id));
  }
  if (!actor.clientId) return [];
  // Same-client users with strictly lower rank than the actor.
  const all = await db.select().from(users).where(eq(users.clientId, actor.clientId));
  return all.filter((u) => u.id !== actor.id && canManage(actor, asActor(u)));
}
