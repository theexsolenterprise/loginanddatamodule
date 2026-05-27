import { db } from "@/db/client";
import { auditLog, users, clients } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export default async function AuditLogPage() {
  // Join actor + client for display. Keep result set bounded.
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      target: auditLog.target,
      metadata: auditLog.metadata,
      actorEmail: users.email,
      actorFirst: users.firstName,
      actorLast: users.lastName,
      clientName: clients.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .leftJoin(clients, eq(clients.id, auditLog.clientId))
    .orderBy(desc(auditLog.at))
    .limit(200);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">Audit log</h1>
        <p className="text-xs text-zinc-500">
          Append-only trail of who did what. The 200 most recent events are shown.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          No events yet. The log fills up as admins create clients, run backups, and restore data.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                    {new Date(r.at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {r.actorFirst ? (
                      <span>
                        {r.actorFirst} {r.actorLast}{" "}
                        <span className="text-xs text-zinc-400">{r.actorEmail}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{r.action}</code>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{r.clientName ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">{r.target ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
