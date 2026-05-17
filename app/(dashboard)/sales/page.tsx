import Link from "next/link";
import { MarkSoldModal } from "@/components/sales/mark-sold-modal";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { getCurrentProfile, getProfiles, getSettings, getStockAccounts } from "@/lib/data";
import { formatDate, money } from "@/lib/utils";

function withoutImages<T extends { image_url?: string | null; image_urls?: string[] | null }>(account: T) {
  return {
    ...account,
    image_url: null,
    image_urls: []
  };
}

export default async function SalesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = (await searchParams) ?? {};
  const [settings, stockAccounts, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getStockAccounts(),
    getProfiles(),
    getCurrentProfile()
  ]);
  const canViewBuyingPrice = currentProfile.role !== "employee";
  const sellableAccounts = stockAccounts.filter((account) => {
    if (account.status === "sold") return false;
    if (currentProfile.role === "employee") {
      return account.assigned_employee_id === currentProfile.id;
    }
    return true;
  });
  const employees =
    currentProfile.role === "employee"
      ? profiles.filter((profile) => profile.id === currentProfile.id)
      : profiles.filter((profile) => profile.role !== "admin" && profile.status === "active");
  type SalesRow = (typeof sellableAccounts)[number];

  return (
    <>
      <PageHeader
        title="Sales"
        description="Every account except sold accounts is shown here. Open an account or mark it as sold."
      />

      <ResponsiveTable
        rows={sellableAccounts}
        searchQuery={params.q}
        searchPlaceholder="Search accounts by code, title, game..."
        emptyTitle="No accounts ready for sale"
        emptyDescription="Add stock accounts first, then every non-sold account will appear here."
        columns={[
          {
            key: "account",
            header: "Account",
            cell: (row) => (
              <Link href={`/stock-accounts/${row.id}`} className="block rounded-md p-1 -m-1 hover:bg-muted">
                <p className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap font-medium text-primary">
                  {row.secret_code ? <span className="shrink-0 font-semibold">{row.secret_code}</span> : null}
                  <span className="min-w-0 truncate">{row.account_title}</span>
                </p>
                <p className="text-xs text-muted-foreground">{row.game_name}</p>
              </Link>
            ),
            searchValue: (row) => `${row.secret_code ?? ""} ${row.account_title} ${row.game_name}`
          },
          ...(canViewBuyingPrice
            ? [{ key: "buying", header: "Buying price", cell: (row: SalesRow) => money(row.buying_price, settings.currency) } as const]
            : []),
          { key: "selling", header: "Selling price", cell: (row) => money(row.selling_price, settings.currency) },
          { key: "date", header: "Purchase date", cell: (row) => formatDate(row.purchase_date) },
          { key: "employee", header: "Assigned", cell: (row) => row.assigned_employee?.name ?? "Unassigned", searchValue: (row) => row.assigned_employee?.name ?? "" },
          { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} />, searchValue: (row) => row.status },
          { key: "actions", header: "Action", cell: (row) => <MarkSoldModal account={withoutImages(row)} employees={employees} /> }
        ]}
      />
    </>
  );
}
