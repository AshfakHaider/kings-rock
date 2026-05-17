import { FormCard, GmailForm } from "@/components/modules/forms";
import { GmailActions } from "@/components/gmail/gmail-actions";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { getGmailAccounts } from "@/lib/data";

export default async function GmailInventoryPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = (await searchParams) ?? {};
  const gmailAccounts = (await getGmailAccounts()).filter((gmail) => gmail.status === "fresh");

  return (
    <>
      <PageHeader title="Gmail Inventory" description="Fresh Gmail accounts only. Mark used removes the Gmail from this list." />
      <FormCard title="Add Gmail">
        <GmailForm />
      </FormCard>
      <ResponsiveTable
        rows={gmailAccounts}
        searchQuery={params.q}
        searchPlaceholder="Search Gmail or recovery phone..."
        emptyTitle="No fresh Gmail accounts"
        emptyDescription="Add Gmail accounts here, or mark used accounts will disappear from this list."
        columns={[
          { key: "email", header: "Gmail", cell: (row) => row.email, searchValue: (row) => row.email },
          { key: "recovery", header: "Recovery phone", cell: (row) => row.recovery_info ?? "-", searchValue: (row) => row.recovery_info ?? "" },
          { key: "actions", header: "Actions", cell: (row) => <GmailActions id={row.id} email={row.email} /> }
        ]}
      />
    </>
  );
}
