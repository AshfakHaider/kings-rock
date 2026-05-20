import { deleteSale } from "@/app/actions";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { getCurrentProfile, getSettings, getSoldAccounts } from "@/lib/data";
import { getProfit } from "@/lib/metrics";
import { stockDisplayTitle } from "@/lib/stock-title";
import { formatDate, money } from "@/lib/utils";

export default async function SoldAccountsPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = (await searchParams) ?? {};
  const [settings, allSoldAccounts, currentProfile] = await Promise.all([
    getSettings(),
    getSoldAccounts(),
    getCurrentProfile()
  ]);
  const canViewProfit = currentProfile.role !== "employee";
  const canManageSales = currentProfile.role !== "employee";
  const soldAccounts =
    currentProfile.role === "employee"
      ? allSoldAccounts.filter((sale) => sale.employee_id === currentProfile.id)
      : allSoldAccounts;
  type SoldRow = (typeof soldAccounts)[number];

  return (
    <>
      <PageHeader
        title="Sold Accounts"
        description={
          canViewProfit
            ? "Complete sold account history with sale amount, source, date, and profit."
            : "Your sold account history with sale amount, source, and date."
        }
      />
      <ResponsiveTable
        rows={soldAccounts}
        searchQuery={params.q}
        searchPlaceholder="Search sales by account, employee, buyer, source..."
        columns={[
          {
            key: "account",
            header: "Account",
            cell: (row) => (
              <div>
                <p className="truncate font-medium">
                  {stockDisplayTitle(row.stock_account?.secret_code, row.stock_account?.account_title ?? row.stock_account_id)}
                </p>
                <p className="text-xs text-muted-foreground">{row.stock_account?.game_name ?? "-"}</p>
              </div>
            ),
            searchValue: (row) => `${row.stock_account?.secret_code ?? ""} ${row.stock_account?.account_title ?? ""} ${row.stock_account?.game_name ?? ""}`
          },
          {
            key: "employee",
            header: "Sold by",
            cell: (row) => (
              <div>
                <p className="font-medium">{row.employee?.name ?? "Unknown employee"}</p>
                <p className="text-xs text-muted-foreground">{row.employee?.email ?? row.employee_id}</p>
              </div>
            ),
            searchValue: (row) => `${row.employee?.name ?? ""} ${row.employee?.email ?? ""} ${row.employee_id}`
          },
          { key: "amount", header: "Sold amount", cell: (row) => money(row.sold_amount, settings.currency) },
          ...(canViewProfit
            ? [{ key: "profit", header: "Profit", cell: (row: SoldRow) => money(getProfit(row), settings.currency) } as const]
            : []),
          { key: "source", header: "Source", cell: (row) => row.sold_source_website ?? "-", searchValue: (row) => row.sold_source_website ?? "" },
          { key: "payment", header: "Payment", cell: (row) => <StatusBadge value={row.payment_status} />, searchValue: (row) => row.payment_status },
          { key: "date", header: "Sold date", cell: (row) => formatDate(row.sold_date) },
          ...(canManageSales
            ? [{
                key: "actions",
                header: "Actions",
                cell: (row: SoldRow) => (
                  <form action={deleteSale}>
                    <input type="hidden" name="id" value={row.id} />
                    <DeleteButton label="Delete" />
                  </form>
                )
              } as const]
            : [])
        ]}
      />
    </>
  );
}
