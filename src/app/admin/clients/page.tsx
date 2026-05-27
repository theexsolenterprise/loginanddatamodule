import Link from "next/link";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { sql } from "drizzle-orm";

export default async function ClientsListPage() {
  const list = await db
    .select()
    .from(clients)
    .orderBy(sql`${clients.createdAt} desc`);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Clients</h1>
        <Link
          href="/admin/clients/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
        >
          + Onboard client
        </Link>
      </header>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          No clients yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{c.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{c.kind}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{c.slug}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/clients/${c.id}`}
                      className="text-xs text-zinc-700 hover:underline"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
