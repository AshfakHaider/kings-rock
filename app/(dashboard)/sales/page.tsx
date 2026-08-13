import Link from "next/link";
import { MarkSoldModal } from "@/components/sales/mark-sold-modal";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { assignedEmployeeNames, DEFAULT_PAGE_SIZE, getCurrentProfile, getProfiles, getSettings, getStockAccountsPage } from "@/lib/data";
import { stockDisplayTitle } from "@/lib/stock-title";
import { formatDate, money } from "@/lib/utils";

function withoutImages<T extends { image_url?: string | null; image_urls?: string[] | null }>(account: T) {
  return {
    ...account,
    image_url: null,
    image_urls: []
  };
}

export default async function SalesPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const params = (await searchParams) ?? {};
  const page = Number(params.page ?? 1);
  const [settings, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getProfiles(),
    getCurrentProfile()
  ]);
  const stockPage = await getStockAccountsPage({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    q: params.q,
    excludeSold: true,
    assignedOnly: true,
    assignedEmployeeId: currentProfile.role === "employee" ? currentProfile.id : null
  });
  const canViewBuyingPrice = currentProfile.role !== "employee";
  const sellableAccounts = stockPage.rows;
  const employees =
    currentProfile.role === "employee"
      ? profiles.filter((profile) => profile.id === currentProfile.id)
      : profiles.filter((profile) => profile.role !== "admin" && profile.status === "active");
  type SalesRow = (typeof sellableAccounts)[number];

  return (
    <>
      <PageHeader
        title="Sales"
        description="Assigned accounts ready for selling are shown here. Open an account or mark it as sold."
      />

      <ResponsiveTable
        rows={sellableAccounts}
        searchQuery={params.q}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        totalRows={stockPage.total}
        serverSide
        searchPlaceholder="Search accounts by code, title, game..."
        emptyTitle="No accounts ready for sale"
        emptyDescription="Assign stock accounts to an employee first, then they will appear here."
        columns={[
          {
            key: "account",
            header: "Account",
            cell: (row) => (
              <Link href={`/stock-accounts/${row.id}`} className="block rounded-md p-1 -m-1 hover:bg-muted">
                <p className="truncate font-medium text-primary">{stockDisplayTitle(row.secret_code, row.account_title)}</p>
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
          {
            key: "employee",
            header: "Assigned",
            cell: (row) => assignedEmployeeNames(row).join(", ") || "Unassigned",
            searchValue: (row) => assignedEmployeeNames(row).join(" ")
          },
          { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} />, searchValue: (row) => row.status },
          {
            key: "actions",
            header: "Action",
            cell: (row) => (
              <MarkSoldModal
                account={withoutImages(row)}
                employees={employees}
                sourceWebsites={settings.sale_source_websites}
              />
            )
          }
        ]}
      />
    </>
  );
}
