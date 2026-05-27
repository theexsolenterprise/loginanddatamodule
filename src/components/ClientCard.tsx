import Link from "next/link";
import { db } from "@/db/client";
import { users, accounts, type Client } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { ClientStructure } from "@/types/client-structure";
import { DataBackupCard } from "@/components/DataBackupCard";

interface ClientCardProps {
  client: Client;
  mode: "login" | "backup";
}

/**
 * One box per client. In "login" mode it lists every user under that client
 * with quick CRUD; in "backup" mode it embeds the DataBackupCard scoped to
 * that client.
 */
export async function ClientCard({ client, mode }: ClientCardProps) {
  const structure = (client.structure ?? {}) as ClientStructure;
  const clientUsers = await db
    .select()
    .from(users)
    .where(eq(users.clientId, client.id))
    .orderBy(users.role);

  // Look up which users have a Google account linked.
  const ids = clientUsers.map((u) => u.id);
  const linked =
    ids.length > 0
      ? await db.select().from(accounts).where(eq(accounts.provider, "google"))
      : [];
  const googleSet = new Set(linked.filter((a) => ids.includes(a.userId)).map((a) => a.userId));

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5">
      <header className="flex items-start justify-between border-b border-zinc-100 pb-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">{client.name}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {client.kind} · {client.slug} ·{" "}
            <span className={client.status === "active" ? "text-emerald-600" : "text-amber-600"}>
              {client.status}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/clients/${client.id}/edit`}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            Edit structure
          </Link>
          <Link
            href={`/admin/clients/${client.id}`}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            Details
          </Link>
        </div>
      </header>

      {/* Tier strip — visual reminder of the client's structure */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(structure.tiers ?? []).map((t) => (
          <span
            key={t.key}
            className={
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs " +
              (t.bucketing === "combined"
                ? "bg-amber-50 text-amber-700"
                : "bg-zinc-100 text-zinc-700")
            }
            title={`acts as ${t.roleAs} · ${t.bucketing}${t.bucketing === "combined" ? `, ${t.subBuckets ?? "∞"} sub` : ""}`}
          >
            <span className="font-medium">{t.label}</span>
            <span className="text-[10px] text-zinc-500">/{t.key}</span>
          </span>
        ))}
      </div>

      {/* Body */}
      {mode === "login" ? (
        <LoginPanel client={client} users={clientUsers} googleSet={googleSet} />
      ) : (
        <div className="mt-4">
          <DataBackupCard
            scope={{ kind: "client", clientId: client.id }}
            title={`${client.name} — backup`}
            description="Everything inside this tenant: users, structure, blob files."
          />
        </div>
      )}
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Login panel — list users, quick actions per user (email, password, Google).
 * Server actions on each row. Admin guard is implicit: this card is only
 * rendered from /admin/settings/login.
 * ──────────────────────────────────────────────────────────────────────────── */

async function LoginPanel({
  client, users: list, googleSet,
}: {
  client: Client;
  users: any[];
  googleSet: Set<string>;
}) {
  async function updateEmail(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!id || !email) return;
    await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, id));
    revalidatePath("/admin/settings/login");
  }

  async function resetPassword(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) throw new Error("Password must be 8+ characters.");
    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async function inviteUser(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const role = String(formData.get("role") ?? "");
    const password = String(formData.get("password") ?? "");
    const isPrimary = formData.get("isPrimary") === "on";
    if (!email || !firstName || !lastName || password.length < 8) {
      throw new Error("Fill all fields; password must be 8+ chars.");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(users).values({
      clientId: client.id,
      role: role as any, isPrimary,
      email, firstName, lastName, passwordHash,
    });
    revalidatePath("/admin/settings/login");
  }

  async function unlinkGoogle(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    await db.delete(accounts).where(and(eq(accounts.userId, id), eq(accounts.provider, "google")));
    revalidatePath("/admin/settings/login");
  }

  async function deleteUser(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    await db.delete(users).where(eq(users.id, id));
    revalidatePath("/admin/settings/login");
  }

  async function setDisabled(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const disable = formData.get("disable") === "true";
    await db.update(users).set({
      disabledAt: disable ? new Date() : null, updatedAt: new Date(),
    }).where(eq(users.id, id));
    revalidatePath("/admin/settings/login");
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Invite row */}
      <form action={inviteUser} className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-6">
        <input name="firstName" placeholder="First name" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        <input name="lastName" placeholder="Last name" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        <input name="email" type="email" placeholder="Email" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:col-span-2" />
        <select name="role" defaultValue="employee" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
          <option value="store">store</option>
          <option value="owner">owner</option>
          <option value="employee">employee</option>
          <option value="customer">customer</option>
        </select>
        <input name="password" type="password" placeholder="Temp password" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 sm:col-span-5">
          <input type="checkbox" name="isPrimary" defaultChecked /> Primary tier
        </label>
        <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800">
          + Invite user
        </button>
      </form>

      {/* User list */}
      {list.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-4 text-xs text-zinc-500">
          No users in this tenant yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {list.map((u) => (
            <li key={u.id} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-12 sm:items-center">
              {/* Identity */}
              <div className="sm:col-span-3">
                <p className="text-sm font-medium text-zinc-900">{u.firstName} {u.lastName}</p>
                <p className="text-xs text-zinc-500">
                  {u.role}{u.role === "employee" && (u.isPrimary ? " · primary" : " · secondary")}
                  {u.disabledAt && <span className="ml-1 text-amber-600">· disabled</span>}
                </p>
              </div>

              {/* Email change */}
              <form action={updateEmail} className="flex items-center gap-1 sm:col-span-4">
                <input type="hidden" name="id" value={u.id} />
                <input
                  name="email" type="email" defaultValue={u.email}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                />
                <button className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] hover:bg-zinc-200">save</button>
              </form>

              {/* Password reset */}
              <form action={resetPassword} className="flex items-center gap-1 sm:col-span-3">
                <input type="hidden" name="id" value={u.id} />
                <input
                  name="password" type="password" placeholder="new password (8+)"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                />
                <button className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] hover:bg-zinc-200">reset</button>
              </form>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 sm:col-span-2">
                {googleSet.has(u.id) ? (
                  <form action={unlinkGoogle}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] text-blue-700 hover:bg-blue-100">
                      unlink Google
                    </button>
                  </form>
                ) : (
                  <span className="text-[10px] text-zinc-400">no Google</span>
                )}
                <form action={setDisabled}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="disable" value={u.disabledAt ? "false" : "true"} />
                  <button className={
                    "rounded-md border px-2 py-1 text-[10px] " +
                    (u.disabledAt
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100")
                  }>
                    {u.disabledAt ? "enable" : "disable"}
                  </button>
                </form>
                <form action={deleteUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] text-red-700 hover:bg-red-100">
                    delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
