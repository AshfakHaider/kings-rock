import {
  Banknote,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  Mail,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Wallet
} from "lucide-react";
import { BarMetricChart } from "@/components/modules/charts";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatCard } from "@/components/modules/stat-card";
import { Select } from "@/components/ui/select";
import {
  getCurrentProfile,
  getDashboardExpenseTotal,
  getDashboardPaidSales,
  getDashboardSnapshot,
  getDashboardWaitingSales,
  getStockTotals,
  getStockValueByGameSummary
} from "@/lib/data";
import { employeeProfitSeries, getProfit, saleCashDate, salesBySource } from "@/lib/metrics";
import type { SoldAccount } from "@/lib/types";
import { formatDate, money } from "@/lib/utils";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function safeYear(value: string | undefined, fallback: number) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : fallback;
}

function safeMonth(value: string | undefined, fallback: number) {
  if (value === "all") return "all" as const;
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : fallback;
}

function buildMonthlySeriesForYear(sales: SoldAccount[], year: number) {
  return monthNames.map((month, index) => {
    const monthSales = sales.filter((sale) => {
      const cashDate = new Date(saleCashDate(sale));
      return cashDate.getFullYear() === year && cashDate.getMonth() === index;
    });

    return {
      month: month.slice(0, 3),
      sales: monthSales.reduce((total, sale) => total + Number(sale.sold_amount), 0),
      profit: monthSales.reduce((total, sale) => total + getProfit(sale), 0)
    };
  });
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; year?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const now = new Date();
  const selectedYear = safeYear(params.year, now.getFullYear());
  const selectedMonth = safeMonth(params.month, now.getMonth() + 1);
  const [snapshot, currentProfile] = await Promise.all([
    getDashboardSnapshot(),
    getCurrentProfile()
  ]);
  const canViewFinancials = snapshot.role !== "employee";
  const metrics = snapshot.metrics;
  const employeeId = currentProfile.role === "employee" ? currentProfile.id : null;

  const [
    stockTotals,
    currentStockValueByGame,
    filteredPaidSales,
    selectedYearPaidSales,
    filteredWaitingPayments,
    filteredExpenseAmount
  ] = await Promise.all([
    getStockTotals({ excludeSold: true }),
    getStockValueByGameSummary(),
    getDashboardPaidSales({ year: selectedYear, month: selectedMonth, employeeId }),
    getDashboardPaidSales({ year: selectedYear, month: "all", employeeId }),
    getDashboardWaitingSales({ year: selectedYear, month: selectedMonth, employeeId, limit: 8 }),
    getDashboardExpenseTotal({ year: selectedYear, month: selectedMonth, paidBy: employeeId })
  ]);

  const totalStockBuyingValue = stockTotals.buyingValue;
  const totalStockSellingValue = stockTotals.sellingValue;
  const filteredSalesAmount = filteredPaidSales.reduce((total, sale) => total + Number(sale.sold_amount), 0);
  const filteredBuyingCost = filteredPaidSales.reduce((total, sale) => total + Number(sale.stock_account?.buying_price ?? 0), 0);
  const filteredGrossProfit = filteredSalesAmount - filteredBuyingCost;
  const filteredWaitingAmount = filteredWaitingPayments.reduce((total, sale) => total + Number(sale.sold_amount), 0);
  const selectedYearProfit = selectedYearPaidSales.reduce((total, sale) => total + getProfit(sale), 0);
  const sourceRows = canViewFinancials ? salesBySource(filteredPaidSales).slice(0, 5) : [];
  const yearOptions = Array.from(
    new Set([
      now.getFullYear(),
      selectedYear,
      now.getFullYear() - 1,
      now.getFullYear() - 2,
      now.getFullYear() + 1
    ])
  )
    .filter((year) => Number.isInteger(year) && year >= 2020 && year <= 2100)
    .sort((a, b) => b - a);
  const periodLabel = selectedMonth === "all" ? String(selectedYear) : `${monthNames[selectedMonth - 1]} ${selectedYear}`;
  const yearMonthlySeries = buildMonthlySeriesForYear(selectedYearPaidSales, selectedYear);
  const filteredEmployeeSeries = employeeProfitSeries(filteredPaidSales);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          canViewFinancials
            ? "Live business overview for stock, sales, profit, Gmail inventory, and employee funds."
            : "Your assigned sales overview, Gmail inventory, and employee funds."
        }
      />

      <form className="grid gap-3 rounded-lg border bg-card p-4 shadow-soft sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-2">
          <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="dashboard_month">
            Month
          </label>
          <Select id="dashboard_month" name="month" defaultValue={String(selectedMonth)}>
            <option value="all">All months</option>
            {monthNames.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="dashboard_year">
            Year
          </label>
          <Select id="dashboard_year" name="year" defaultValue={String(selectedYear)}>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <CalendarDays className="h-4 w-4" />
          Apply filter
        </button>
      </form>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total stock accounts" value={String(metrics.totalStockAccounts)} icon={Boxes} />
        {canViewFinancials ? (
          <StatCard
            title="Stock buying value"
            value={money(totalStockBuyingValue, snapshot.currency)}
            icon={Wallet}
          />
        ) : null}
        <StatCard
          title="Stock selling value"
          value={money(totalStockSellingValue, snapshot.currency)}
          icon={Banknote}
          tone="good"
        />
        <StatCard title={`Paid sold accounts (${periodLabel})`} value={String(filteredPaidSales.length)} icon={ShoppingCart} />
        <StatCard
          title={`Received sales (${periodLabel})`}
          value={money(filteredSalesAmount, snapshot.currency)}
          icon={Banknote}
          tone="good"
        />
        <StatCard
          title={`Waiting payments (${periodLabel})`}
          value={String(filteredWaitingPayments.length)}
          icon={Clock3}
          tone="warn"
        />
        <StatCard
          title={`Waiting amount (${periodLabel})`}
          value={money(filteredWaitingAmount, snapshot.currency)}
          icon={Banknote}
          tone="warn"
        />
        {canViewFinancials ? (
          <>
            <StatCard
              title={`Buying cost (${periodLabel})`}
              value={money(filteredBuyingCost, snapshot.currency)}
              icon={Boxes}
            />
            <StatCard
              title={`Gross profit (${periodLabel})`}
              value={money(filteredGrossProfit, snapshot.currency)}
              icon={TrendingUp}
              tone="good"
            />
          </>
        ) : null}
        <StatCard
          title={`Expenses (${periodLabel})`}
          value={money(filteredExpenseAmount, snapshot.currency)}
          icon={ReceiptText}
          tone="warn"
        />
        {canViewFinancials ? (
          <>
            <StatCard
              title={`Net profit/loss (${periodLabel})`}
              value={money(filteredGrossProfit - filteredExpenseAmount, snapshot.currency)}
              icon={ChartNoAxesCombined}
              tone={filteredGrossProfit - filteredExpenseAmount >= 0 ? "good" : "warn"}
            />
            <StatCard
              title={selectedMonth === "all" ? "Selected period profit" : "Monthly profit"}
              value={money(filteredGrossProfit, snapshot.currency)}
              icon={TrendingUp}
            />
            <StatCard
              title={`Yearly profit (${selectedYear})`}
              value={money(selectedYearProfit, snapshot.currency)}
              icon={TrendingUp}
            />
          </>
        ) : null}
        <StatCard title="Available Gmail" value={String(metrics.availableGmailCount)} icon={Mail} />
        <StatCard
          title="Employee advance balance"
          value={money(metrics.employeeAdvanceBalance, snapshot.currency)}
          icon={Banknote}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Waiting For Payment</h2>
          <p className="text-sm text-muted-foreground">
            Accounts sold in {periodLabel}, but the platform payment has not been received yet.
          </p>
        </div>
        <ResponsiveTable
          rows={filteredWaitingPayments}
          searchPlaceholder="Search waiting payments..."
          emptyTitle="No waiting payments"
          emptyDescription="When a sold account is waiting for platform payout, it will appear here."
          columns={[
            {
              key: "account",
              header: "Account",
              cell: (row) => row.stock_account?.account_title ?? row.stock_account_id,
              searchValue: (row) => `${row.stock_account?.secret_code ?? ""} ${row.stock_account?.account_title ?? ""}`
            },
            {
              key: "employee",
              header: "Sold by",
              cell: (row) => row.employee?.name ?? row.employee_id,
              searchValue: (row) => row.employee?.name ?? row.employee_id
            },
            { key: "amount", header: "Amount", cell: (row) => money(row.sold_amount, snapshot.currency) },
            { key: "source", header: "Source", cell: (row) => row.sold_source_website ?? "-", searchValue: (row) => row.sold_source_website ?? "" },
            { key: "date", header: "Sold date", cell: (row) => formatDate(row.sold_date) }
          ]}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <BarMetricChart
          title={canViewFinancials ? "Monthly sales and profit" : "Monthly sales"}
          data={yearMonthlySeries}
          xKey="month"
          bars={[
            { key: "sales", name: "Sales", color: "#14b8a6" },
            ...(canViewFinancials ? [{ key: "profit", name: "Profit", color: "#f59e0b" }] : [])
          ]}
        />
        {canViewFinancials ? (
          <>
            <BarMetricChart
              title="Employee profit comparison"
              data={filteredEmployeeSeries}
              xKey="name"
              bars={[
                { key: "profit", name: "Profit", color: "#22c55e" },
                { key: "sales", name: "Sales", color: "#38bdf8" }
              ]}
            />
            <BarMetricChart
              title="Stock value by game"
              data={currentStockValueByGame}
              xKey="game"
              bars={[{ key: "value", name: "Stock value", color: "#fb7185" }]}
            />
          </>
        ) : null}
      </section>

      {canViewFinancials ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Best sale sources</h2>
            <p className="text-sm text-muted-foreground">Top sources by accounts sold in {periodLabel}.</p>
          </div>
          <ResponsiveTable
            rows={sourceRows}
            searchPlaceholder="Search sources..."
            emptyTitle="No source sales yet"
            emptyDescription="When accounts are sold, source totals will appear here."
            columns={[
              { key: "source", header: "Source", cell: (row) => row.source, searchValue: (row) => row.source },
              { key: "count", header: "Accounts sold", cell: (row) => row.soldCount },
              { key: "sales", header: "Total sales", cell: (row) => money(row.totalSales, snapshot.currency) },
              { key: "profit", header: "Profit", cell: (row) => money(row.profit, snapshot.currency) }
            ]}
          />
        </section>
      ) : null}
    </>
  );
}
