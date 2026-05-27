import { db } from "@/db/client";
import { users, accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { auth, signIn, signOut } from "../../auth";
import { revalidatePath } from "next/cache";

/**
 * Self-service settings: change name, email, password; link/unlink Google.
 * Available to every authenticated role at `/admin/settings` and
 * `/app/settings`. Server actions enforce that you can only edit yourself —
 * admin overrides go through a separate endpoint (`/admin/clients/[id]/users`).
 */
export async function SettingsForm() {
  const session = await auth();
  const user = session!.user;

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const linkedAccounts = await db
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, user.id));
  const hasGoogle = linkedAccounts.some((a) => a.provider === "google");

  async function updateProfile(formData: FormData) {
    "use server";
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!firstName || !lastName || !email) return;
    await db
      .update(users)
      .set({ firstName, lastName, email, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    revalidatePath("/admin/settings");
    revalidatePath("/app/settings");
  }

  async function changePassword(formData: FormData) {
    "use server";
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    if (next.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    const [me] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (me?.passwordHash) {
      const ok = await bcrypt.compare(current, me.passwordHash);
      if (!ok) throw new Error("Current password is incorrect.");
    }
    const passwordHash = await bcrypt.hash(next, 12);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  async function linkGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/app/settings" });
  }

  async function unlinkGoogle() {
    "use server";
    await db.delete(accounts).where(eq(accounts.userId, user.id));
    revalidatePath("/admin/settings");
    revalidatePath("/app/settings");
  }

  async function signOutEverywhere() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Profile ── */}
      <Section title="Profile">
        <form action={updateProfile} className="space-y-3">
          <Field name="firstName" label="First name" defaultValue={row?.firstName ?? ""} />
          <Field name="lastName" label="Last name" defaultValue={row?.lastName ?? ""} />
          <Field name="email" label="Email" type="email" defaultValue={row?.email ?? ""} />
          <Submit>Save profile</Submit>
        </form>
      </Section>

      {/* ── Password ── */}
      <Section title="Change password">
        <form action={changePassword} className="space-y-3">
          {row?.passwordHash && (
            <Field name="current" label="Current password" type="password" />
          )}
          <Field name="next" label="New password" type="password" />
          <p className="text-xs text-zinc-500">Minimum 8 characters.</p>
          <Submit>Update password</Submit>
        </form>
      </Section>

      {/* ── Google account link ── */}
      <Section title="Google account">
        <p className="text-sm text-zinc-700">
          {hasGoogle
            ? "Google is linked — you can sign in with either email/password or Google."
            : "Link Google to sign in with one click."}
        </p>
        <form action={hasGoogle ? unlinkGoogle : linkGoogle} className="mt-3">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          >
            {hasGoogle ? "Unlink Google" : "Link Google"}
          </button>
        </form>
      </Section>

      {/* ── Session ── */}
      <Section title="Session">
        <p className="text-sm text-zinc-700">
          Signed in as <span className="font-mono">{row?.email}</span>.
        </p>
        <form action={signOutEverywhere} className="mt-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  name, label, defaultValue, type,
}: { name: string; label: string; defaultValue?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      <input
        name={name}
        type={type ?? "text"}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
