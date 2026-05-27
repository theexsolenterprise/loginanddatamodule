import { SettingsTabs } from "@/components/SettingsTabs";
import { ClientCard } from "@/components/ClientCard";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { sql } from "drizzle-orm";

export default async function AdminLoginTabPage() {
  const list = await db.select().from(clients).orderBy(sql`${clients.createdAt} desc`);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
      <SettingsTabs base="/admin/settings" active="login" />

      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Clients & users</h2>
          <p className="text-xs text-zinc-500">
            One box per client. Invite, edit email, reset password, link/unlink Google, disable, or delete users —
            and click "Edit structure" to reshape that tenant's tiers.
          </p>
        </div>
        <a
          href="/admin/clients/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
        >
          + Onboard client
        </a>
      </header>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          No clients yet. Onboard one to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {list.map((c) => (
            <ClientCard key={c.id} client={c} mode="login" />
          ))}
        </div>
      )}
    </div>
  );
}
