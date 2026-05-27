import { auth } from "../../../auth";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ClientLabels } from "@/types/client-structure";
import { mergeLabels } from "@/types/client-structure";

/**
 * Tenant dashboard — shared by store, owner, employee, customer.
 * The greeting + visible widgets vary by role; the layout is the same so the
 * UI feels coherent regardless of which seat the user occupies.
 */
export default async function AppDashboard() {
  const session = await auth();
  const user = session!.user;

  let labels: ClientLabels = mergeLabels({});
  let clientName = "—";
  if (user.clientId) {
    const [c] = await db.select().from(clients).where(eq(clients.id, user.clientId)).limit(1);
    if (c) {
      labels = mergeLabels((c.labels ?? {}) as Partial<ClientLabels>);
      clientName = c.name;
    }
  }

  const roleLabel = (() => {
    switch (user.role) {
      case "store":
        return labels.store;
      case "owner":
        return labels.owner;
      case "employee":
        return user.isPrimary ? labels.employeePrimary : labels.employeeSecondary;
      case "customer":
        return labels.customer;
      default:
        return user.role;
    }
  })();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">{clientName}</p>
        <h1 className="text-xl font-semibold text-zinc-900">
          Hi, {user.firstName}.
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          You're signed in as <span className="font-medium">{roleLabel}</span>.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card title="Quick links">
          <Link href={`/app/settings`} label="Account & password" />
          <Link href={`/app/files`} label="Files" />
        </Card>
        <Card title="Your role">
          <p className="text-sm text-zinc-700">{roleLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Access scope is set by your administrator.
          </p>
        </Card>
        <Card title="Need help?">
          <p className="text-sm text-zinc-700">
            Contact your {labels.owner.toLowerCase()} or platform administrator.
          </p>
        </Card>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="block text-sm text-zinc-800 hover:underline">
      → {label}
    </a>
  );
}
