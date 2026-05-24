import { deleteSale, markSalePaid } from "@/app/actions";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { Button } from "@/components/ui/button";
import { getCurrentProfile, getSettings, getSoldAccounts } from "@/lib/data";
import { getProfit, isPaidSale, salesBySource } from "@/lib/metrics";
import { stockDisplayTitle } from "@/lib/stock-title";
import { formatDate, money } from "@/lib/utils";

export default async function SoldAccountsPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
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
  const waitingSoldAccounts = soldAccounts.filter((sale) => !isPaidSale(sale));
  const sourceRows = salesBySource(soldAccounts);
  type SoldRow = (typeof soldAccounts)[number];

  return (
    <>
      <PageHeader
        title="Sold Accounts"
        description={
          canViewProfit
            ? "Complete sold account history. Profit counts only after payment is marked paid."
            : "Your sold account history with sale amount, source, and date."
        }
      />
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Waiting For Payment</h2>
          <p className="text-sm text-muted-foreground">Sold accounts waiting for platform payout.</p>
        </div>
        <ResponsiveTable
          rows={waitingSoldAccounts}
          page={Number(params.page ?? 1)}
          searchPlaceholder="Search waiting payments..."
          emptyTitle="No waiting payments"
          emptyDescription="Newly sold accounts will appear here until payment is received."
          columns={[
            {
              key: "account",
              header: "Account",
              cell: (row) => stockDisplayTitle(row.stock_account?.secret_code, row.stock_account?.account_title ?? row.stock_account_id),
              searchValue: (row) => `${row.stock_account?.secret_code ?? ""} ${row.stock_account?.account_title ?? ""}`
            },
            { key: "employee", header: "Sold by", cell: (row) => row.employee?.name ?? row.employee_id, searchValue: (row) => row.employee?.name ?? row.employee_id },
            { key: "amount", header: "Amount", cell: (row) => money(row.sold_amount, settings.currency) },
            { key: "source", header: "Source", cell: (row) => row.sold_source_website ?? "-", searchValue: (row) => row.sold_source_website ?? "" },
            { key: "date", header: "Sold date", cell: (row) => formatDate(row.sold_date) },
            ...(canManageSales
              ? [{
                  key: "action",
                  header: "Action",
                  cell: (row: SoldRow) => (
                    <form action={markSalePaid}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button size="sm">Mark paid</Button>
                    </form>
                  )
                } as const]
              : [])
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Paid Sales by Source</h2>
          <p className="text-sm text-muted-foreground">Only paid sales are included in these totals.</p>
        </div>
        <ResponsiveTable
          rows={sourceRows}
          page={Number(params.page ?? 1)}
          searchPlaceholder="Search sale sources..."
          emptyTitle="No source sales yet"
          emptyDescription="When accounts are sold, source totals will appear here."
          columns={[
            { key: "source", header: "Source", cell: (row) => row.source, searchValue: (row) => row.source },
            { key: "count", header: "Accounts sold", cell: (row) => row.soldCount },
            { key: "sales", header: "Total sales", cell: (row) => money(row.totalSales, settings.currency) },
            ...(canViewProfit
              ? [{ key: "profit", header: "Profit", cell: (row: (typeof sourceRows)[number]) => money(row.profit, settings.currency) } as const]
              : [])
          ]}
        />
      </section>

      <ResponsiveTable
        rows={soldAccounts}
        searchQuery={params.q}
        page={Number(params.page ?? 1)}
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
            ? [{ key: "profit", header: "Profit", cell: (row: SoldRow) => isPaidSale(row) ? money(getProfit(row), settings.currency) : "Waiting payment" } as const]
            : []),
          { key: "source", header: "Source", cell: (row) => row.sold_source_website ?? "-", searchValue: (row) => row.sold_source_website ?? "" },
          { key: "payment", header: "Payment", cell: (row) => <StatusBadge value={row.payment_status} />, searchValue: (row) => row.payment_status },
          { key: "date", header: "Sold date", cell: (row) => formatDate(row.sold_date) },
          { key: "paidDate", header: "Paid date", cell: (row) => row.payment_received_date ? formatDate(row.payment_received_date) : "-" },
          ...(canManageSales
            ? [{
                key: "actions",
                header: "Actions",
                cell: (row: SoldRow) => (
                  <div className="flex flex-wrap gap-2">
                    {!isPaidSale(row) ? (
                      <form action={markSalePaid}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button size="sm">Mark paid</Button>
                      </form>
                    ) : null}
                    <form action={deleteSale}>
                      <input type="hidden" name="id" value={row.id} />
                      <DeleteButton label="Delete" />
                    </form>
                  </div>
                )
              } as const]
            : [])
        ]}
      />
    </>
  );
}
