import { SettingsTabs } from "@/components/SettingsTabs";
import { TeamSection } from "@/components/TeamSection";

export default function AppLoginTabPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
      <SettingsTabs base="/app/settings" active="login" />
      <p className="text-xs text-zinc-500">
        People you can manage. You can edit their name + email, reset their password,
        link/unlink Google, disable, or delete them.
      </p>
      <TeamSection />
    </div>
  );
}
