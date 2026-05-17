import { redirect } from "next/navigation";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { getActivityLogs, getCurrentProfile } from "@/lib/data";
import { formatDate } from "@/lib/utils";

export default async function ActivityLogsPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = (await searchParams) ?? {};
  const [logs, currentProfile] = await Promise.all([getActivityLogs(), getCurrentProfile()]);

  if (currentProfile.role === "employee") redirect("/");

  return (
    <>
      <PageHeader title="Activity Logs" description="Audit trail for stock, sales, Gmail password access, advances, expenses, and settings." />
      <ResponsiveTable
        rows={logs}
        searchQuery={params.q}
        searchPlaceholder="Search activity logs..."
        columns={[
          { key: "action", header: "Action", cell: (row) => row.action.replaceAll("_", " "), searchValue: (row) => row.action },
          { key: "table", header: "Table", cell: (row) => row.table_name, searchValue: (row) => row.table_name },
          { key: "user", header: "User", cell: (row) => row.user?.name ?? row.user_id ?? "-", searchValue: (row) => row.user?.name ?? row.user_id ?? "" },
          { key: "record", header: "Record", cell: (row) => row.record_id ?? "-" },
          { key: "date", header: "Created", cell: (row) => formatDate(row.created_at) }
        ]}
      />
    </>
  );
}
