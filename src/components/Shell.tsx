import Link from "next/link";
import { auth, signOut } from "../../auth";
import type { Role } from "@/db/schema";

interface NavItem {
  label: string;
  href: string;
}

/**
 * Sidebar navigation per role. Settings always appears as the last item so
 * the user has a predictable "manage me" entry point in addition to the
 * topbar user menu.
 */
function navFor(role: Role): NavItem[] {
  const SETTINGS: NavItem = { label: "Settings", href: rootFor(role) + "/settings" };
  switch (role) {
    case "admin":
      return [
        { label: "Dashboard", href: "/admin" },
        { label: "Clients", href: "/admin/clients" },
        { label: "Backups", href: "/admin/backups" },
        { label: "Audit log", href: "/admin/audit" },
        SETTINGS,
      ];
    case "store":
      return [
        { label: "Dashboard", href: "/app" },
        { label: "Owners", href: "/app/owners" },
        { label: "Employees", href: "/app/employees" },
        { label: "Customers", href: "/app/customers" },
        { label: "Files", href: "/app/files" },
        SETTINGS,
      ];
    case "owner":
      return [
        { label: "Dashboard", href: "/app" },
        { label: "Employees", href: "/app/employees" },
        { label: "Customers", href: "/app/customers" },
        { label: "Files", href: "/app/files" },
        SETTINGS,
      ];
    case "employee":
      return [
        { label: "Dashboard", href: "/app" },
        { label: "Customers", href: "/app/customers" },
        { label: "Files", href: "/app/files" },
        SETTINGS,
      ];
    case "customer":
      return [
        { label: "Dashboard", href: "/app" },
        { label: "My files", href: "/app/files" },
        SETTINGS,
      ];
  }
}

function rootFor(role: Role) {
  return role === "admin" ? "/admin" : "/app";
}

function titleFor(role: Role) {
  return {
    admin: "Quidvis admin",
    store: "Store console",
    owner: "Owner console",
    employee: "Employee console",
    customer: "My account",
  }[role];
}

export async function Shell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  if (!user) return <div className="p-8">Not signed in.</div>;

  const items = navFor(user.role);
  const root = rootFor(user.role);

  return (
    <div className="flex min-h-screen">
      {/* ─── Sidebar ─── */}
      <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white">
        <div className="px-5 py-4 text-sm font-semibold text-zinc-900">
          {titleFor(user.role)}
        </div>
        <nav className="px-2 pb-4">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="block rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              {it.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* ─── Topbar ─── */}
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <div className="text-sm text-zinc-500">
            {user.role[0].toUpperCase() + user.role.slice(1)}
            {user.role === "employee" && (
              <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
                {user.isPrimary ? "primary" : "secondary"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-700">
              {user.firstName} {user.lastName}
            </span>
            <Link
              href={`${root}/settings`}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              Settings
            </Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
