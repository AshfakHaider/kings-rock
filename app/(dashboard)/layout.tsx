import { AppShell } from "@/components/modules/app-shell";
import { getCurrentProfile, getSettings } from "@/lib/data";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profile, settings] = await Promise.all([getCurrentProfile(), getSettings()]);

  return (
    <AppShell profile={profile} businessName={settings.business_name}>
      {children}
    </AppShell>
  );
}
