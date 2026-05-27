import Link from "next/link";
import { db } from "@/db/client";
import { clients, users, nodes } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export default async function AdminDashboard() {
  const [clientCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients);
  const [userCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  const [nodeCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(nodes);

  const recent = await db
    .select({ id: clients.id, name: clients.name, kind: clients.kind, slug: clients.slug, createdAt: clients.createdAt })
    .from(clients)
    .orderBy(sql`${clients.createdAt} desc`)
    .limit(5);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Hi, admin.</h1>
        <Link
          href="/admin/clients/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
        >
          + Onboard client
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Clients" value={clientCount?.count ?? 0} />
        <Stat label="Users" value={userCount?.count ?? 0} />
        <Stat label="Tree nodes" value={nodeCount?.count ?? 0} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700">
          Recent clients
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No clients yet. Onboard one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link href={`/admin/clients/${c.id}`} className="text-sm font-medium text-zinc-900 hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-xs text-zinc-500">{c.kind} · {c.slug}</p>
                </div>
                <span className="text-xs text-zinc-400">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
