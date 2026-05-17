import { FormCard, SettingsForm } from "@/components/modules/forms";
import { PageHeader } from "@/components/modules/page-header";
import { getCurrentProfile, getSettings } from "@/lib/data";

export default async function SettingsPage() {
  const [profile, settings] = await Promise.all([getCurrentProfile(), getSettings()]);

  return (
    <>
      <PageHeader title="Settings" description="Business name, currency, categories, source websites, and employee permissions." />
      {profile.role === "admin" ? (
        <FormCard title="Edit business settings">
          <SettingsForm settings={settings} />
        </FormCard>
      ) : (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-soft">
          Settings are visible to managers and employees, but only admins can update them.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-soft">
          <p className="text-sm text-muted-foreground">Business</p>
          <p className="mt-2 text-xl font-semibold">{settings.business_name}</p>
          <p className="text-sm text-muted-foreground">Currency: {settings.currency}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-soft">
          <p className="text-sm text-muted-foreground">Employee permissions</p>
          <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(settings.employee_permissions, null, 2)}
          </pre>
        </div>
      </div>
    </>
  );
}
