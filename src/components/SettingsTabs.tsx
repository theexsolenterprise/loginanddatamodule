import Link from "next/link";

export interface SettingsTabsProps {
  base: string; // "/admin/settings" or "/app/settings"
  active: "account" | "login" | "backup";
}

/**
 * Tab bar shown at the top of every Settings page. Pure links — no client
 * JS — so deep-links work from anywhere and the active state survives a
 * reload.
 */
export function SettingsTabs({ base, active }: SettingsTabsProps) {
  const tabs: { id: SettingsTabsProps["active"]; label: string; href: string }[] = [
    { id: "account", label: "Account", href: base },
    { id: "login", label: "Login & users", href: `${base}/login` },
    { id: "backup", label: "Backup & files", href: `${base}/backup` },
  ];
  return (
    <nav className="flex gap-1 border-b border-zinc-200">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={
              "rounded-t-md px-4 py-2 text-sm font-medium transition " +
              (on
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
