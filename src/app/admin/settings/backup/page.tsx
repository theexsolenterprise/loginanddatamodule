import { SettingsTabs } from "@/components/SettingsTabs";
import { ClientCard } from "@/components/ClientCard";
import { DataBackupCard } from "@/components/DataBackupCard";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { sql } from "drizzle-orm";

export default async function AdminBackupTabPage() {
  const list = await db.select().from(clients).orderBy(sql`${clients.createdAt} desc`);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
      <SettingsTabs base="/admin/settings" active="backup" />

      <header>
        <h2 className="text-base font-semibold text-zinc-900">Backup & files</h2>
        <p className="text-xs text-zinc-500">
          A system-wide backup (rolls back everything) and one card per client (rolls back just that tenant).
          Click Import to upload a previous backup — you'll be asked merge or replace before anything is overwritten.
        </p>
      </header>

      {/* System-wide */}
      <section>
        <DataBackupCard
          scope={{ kind: "system" }}
          title="System-wide backup"
          description="All clients, all users, all blobs. Use for disaster recovery."
        />
      </section>

      {/* Per client */}
      {list.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-semibold text-zinc-900">Per-client backups</h3>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {list.map((c) => (
              <ClientCard key={c.id} client={c} mode="backup" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
