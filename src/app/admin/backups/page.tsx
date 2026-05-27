import Link from "next/link";
import { listBackups, type BackupRow } from "@/lib/backup";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function AdminBackupsPage(
  props: { searchParams: Promise<{ clientId?: string }> },
) {
  const { clientId } = await props.searchParams;
  let title = "All backups";
  let tenantName: string | null = null;
  if (clientId) {
    const [c] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (c) {
      title = `Backups · ${c.name}`;
      tenantName = c.name;
    }
  }
  const rows = await listBackups(clientId ? { clientId } : undefined);

  const grouped: Record<string, BackupRow[]> = { auto: [], manual: [] };
  for (const r of rows) grouped[r.type].push(r);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        <Link href="/admin/settings" className="text-xs text-zinc-600 hover:underline">
          Manage in Settings →
        </Link>
      </header>

      <Section
        heading="Manual restore points"
        rows={grouped.manual}
        empty="No manual restore points yet. Use Settings → Data Backup → Create Restore Point."
      />
      <Section
        heading="Automatic backups (twice daily)"
        rows={grouped.auto}
        empty="No automatic backups yet. The next scheduled run is at 00:00 / 12:00 UTC."
      />
    </div>
  );
}

function Section({
  heading, rows, empty,
}: { heading: string; rows: BackupRow[]; empty: string }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700">
        {heading}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Scope</th>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-2 text-zinc-700">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-zinc-500">{r.scopeKind}</td>
                <td className="px-4 py-2 text-zinc-500">{r.label ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/settings/restore?key=${encodeURIComponent(r.key)}`}
                    className="text-xs text-zinc-700 hover:underline"
                  >
                    Restore →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
