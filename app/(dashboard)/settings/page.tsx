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
          <dl className="mt-3 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted p-3">
              <dt className="text-muted-foreground">Can view profit</dt>
              <dd className="font-medium">{settings.employee_permissions.can_view_profit ? "Yes" : "No"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted p-3">
              <dt className="text-muted-foreground">Can view buying price</dt>
              <dd className="font-medium">{settings.employee_permissions.can_view_buying_price ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );
}
