import { SettingsForm } from "@/components/SettingsForm";
import { SettingsTabs } from "@/components/SettingsTabs";

export default function AppSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
      <SettingsTabs base="/app/settings" active="account" />
      <SettingsForm />
    </div>
  );
}
