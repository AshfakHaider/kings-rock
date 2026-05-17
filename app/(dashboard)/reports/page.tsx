import { CsvExport } from "@/components/modules/csv-export";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import {
  getAdvanceTransactions,
  getCurrentProfile,
  getExpenses,
  getGmailAccounts,
  getSettings,
  getSoldAccounts,
  getStockAccounts
} from "@/lib/data";
import { getAdvanceBalance, getProfit } from "@/lib/metrics";
import { formatDate, money } from "@/lib/utils";

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const [settings, stockAccounts, soldAccounts, gmailAccounts, expenses, advanceTransactions, currentProfile] =
    await Promise.all([
      getSettings(),
      getStockAccounts(),
      getSoldAccounts(),
      getGmailAccounts(),
      getExpenses(),
      getAdvanceTransactions(),
      getCurrentProfile()
    ]);
  if (currentProfile.role === "employee") redirect("/");
  const canViewFinancials = true;

  const sales = soldAccounts.filter((sale) => {
    const saleDate = new Date(sale.sold_date);
    if (params.employee && sale.employee_id !== params.employee) return false;
    if (params.game && sale.stock_account?.game_name !== params.game) return false;
    if (params.source && sale.sold_source_website !== params.source) return false;
    if (params.month && saleDate.getMonth() + 1 !== Number(params.month)) return false;
    if (params.year && saleDate.getFullYear() !== Number(params.year)) return false;
    if (params.from && sale.sold_date < params.from) return false;
    if (params.to && sale.sold_date > params.to) return false;
    return true;
  });

  const csvRows = sales.map((sale) => ({
    account: sale.stock_account?.account_title,
    game: sale.stock_account?.game_name,
    employee: sale.employee?.name,
    sold_amount: sale.sold_amount,
    ...(canViewFinancials
      ? {
          buying_cost: sale.stock_account?.buying_price,
          profit: getProfit(sale)
        }
      : {}),
    source: sale.sold_source_website,
    sold_date: sale.sold_date
  }));

  const stockValue = stockAccounts
    .filter((account) => !params.status || account.status === params.status)
    .reduce((sum, account) => sum + Number(account.buying_price), 0);
  const grossProfit = sales.reduce((sum, sale) => sum + getProfit(sale), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const visibleAdvanceTransactions = advanceTransactions;
  type SaleRow = (typeof sales)[number];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Filter by date, month, year, employee, game, sale source, and account status."
        action={<CsvExport rows={csvRows} filename="sales-report.csv" />}
      />

      <form className="grid gap-3 rounded-lg border bg-card p-4 shadow-soft md:grid-cols-4">
        <input className="rounded-md border px-3 py-2 text-sm" type="date" name="from" defaultValue={params.from} />
        <input className="rounded-md border px-3 py-2 text-sm" type="date" name="to" defaultValue={params.to} />
        <input className="rounded-md border px-3 py-2 text-sm" type="number" min="1" max="12" name="month" placeholder="Month number" defaultValue={params.month} />
        <input className="rounded-md border px-3 py-2 text-sm" type="number" min="2020" name="year" placeholder="Year" defaultValue={params.year} />
        <input className="rounded-md border px-3 py-2 text-sm" name="employee" placeholder="Employee ID" defaultValue={params.employee} />
        <input className="rounded-md border px-3 py-2 text-sm" name="game" placeholder="Game name" defaultValue={params.game} />
        <input className="rounded-md border px-3 py-2 text-sm" name="source" placeholder="Sale source" defaultValue={params.source} />
        <select className="rounded-md border px-3 py-2 text-sm" name="status" defaultValue={params.status}>
          <option value="">Any account status</option>
          {["available", "assigned", "sold", "hold", "problem"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Apply filters</button>
      </form>

      {canViewFinancials ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4 shadow-soft">
            <p className="text-sm text-muted-foreground">Gross profit</p>
            <p className="mt-2 text-2xl font-semibold">{money(grossProfit, settings.currency)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-soft">
            <p className="text-sm text-muted-foreground">Net profit</p>
            <p className="mt-2 text-2xl font-semibold">{money(grossProfit - expenseTotal, settings.currency)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-soft">
            <p className="text-sm text-muted-foreground">Filtered stock value</p>
            <p className="mt-2 text-2xl font-semibold">{money(stockValue, settings.currency)}</p>
          </div>
        </div>
      ) : null}

      <ResponsiveTable
        rows={sales}
        searchPlaceholder="Search report sales..."
        columns={[
          { key: "account", header: "Account", cell: (row) => row.stock_account?.account_title ?? "-" },
          { key: "employee", header: "Employee", cell: (row) => row.employee?.name ?? "-" },
          { key: "amount", header: "Sold", cell: (row) => money(row.sold_amount, settings.currency) },
          ...(canViewFinancials
            ? [{ key: "profit", header: "Profit", cell: (row: SaleRow) => money(getProfit(row), settings.currency) } as const]
            : []),
          { key: "source", header: "Source", cell: (row) => row.sold_source_website ?? "-" },
          { key: "date", header: "Date", cell: (row) => formatDate(row.sold_date) }
        ]}
      />

      <ResponsiveTable
        rows={gmailAccounts}
        searchPlaceholder="Search Gmail report..."
        columns={[
          { key: "email", header: "Email", cell: (row) => row.email },
          { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
          { key: "added", header: "Added", cell: (row) => formatDate(row.date_added) }
        ]}
      />

      <div className="rounded-lg border bg-card p-4 shadow-soft">
        <p className="text-sm text-muted-foreground">Advance/fund balance</p>
        <p className="mt-2 text-2xl font-semibold">
          {money(getAdvanceBalance(visibleAdvanceTransactions), settings.currency)}
        </p>
      </div>
    </>
  );
}
