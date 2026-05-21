import { redirect } from "next/navigation";
import {
  Banknote,
  Boxes,
  CircleDollarSign,
  ClipboardCheck,
  Medal,
  ReceiptText,
  ShoppingCart,
  Trophy
} from "lucide-react";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatCard } from "@/components/modules/stat-card";
import { StatusBadge } from "@/components/modules/status-badge";
import {
  getAdvanceTransactions,
  getCurrentProfile,
  getDailyTaskCompletions,
  getDailyTasks,
  getExpenses,
  getProfiles,
  getSettings,
  getSoldAccounts,
  getStockAccounts
} from "@/lib/data";
import { getAdvanceBalance, getProfit, isPaidSale, saleCashDate } from "@/lib/metrics";
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

function inSelectedMonth(dateValue: string, year: number, month: number) {
  const date = new Date(dateValue);
  return date.getFullYear() === year && date.getMonth() + 1 === month;
}

function bonusSignal(rank: number, soldCount: number, profit: number, taskCompletionRate: number) {
  if (soldCount === 0) return "No bonus";
  if (taskCompletionRate < 60) return "Review tasks";
  if (rank === 1) return "Highest bonus";
  if (rank <= 3) return "Bonus candidate";
  if (profit > 0) return "Small bonus";
  return "Review";
}

export default async function MonthlyPerformancePage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; year?: string; q?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const now = new Date();
  const selectedMonth = Number(params.month ?? now.getMonth() + 1);
  const selectedYear = Number(params.year ?? now.getFullYear());

  const [
    settings,
    profiles,
    stockAccounts,
    soldAccounts,
    expenses,
    dailyTasks,
    dailyTaskCompletions,
    advanceTransactions,
    currentProfile
  ] = await Promise.all([
    getSettings(),
    getProfiles(),
    getStockAccounts(),
    getSoldAccounts(),
    getExpenses(),
    getDailyTasks(),
    getDailyTaskCompletions(),
    getAdvanceTransactions(),
    getCurrentProfile()
  ]);

  if (currentProfile.role === "employee") redirect("/leaderboard");

  const employees = profiles.filter((profile) => profile.role !== "admin" && profile.status === "active");
  const monthlyTasks = dailyTasks.filter((task) => inSelectedMonth(task.task_date, selectedYear, selectedMonth));
  const rows = employees
    .map((employee) => {
      const assignedAccounts = stockAccounts.filter(
        (account) => account.assigned_employee_id === employee.id && account.status !== "sold"
      );
      const monthlySales = soldAccounts.filter(
        (sale) =>
          isPaidSale(sale) &&
          sale.employee_id === employee.id &&
          inSelectedMonth(saleCashDate(sale), selectedYear, selectedMonth)
      );
      const employeeExpenses = expenses.filter(
        (expense) => expense.paid_by === employee.id && inSelectedMonth(expense.expense_date, selectedYear, selectedMonth)
      );
      const employeeAdvanceTransactions = advanceTransactions.filter(
        (transaction) => transaction.employee_id === employee.id
      );
      const taskCompletedCount = dailyTaskCompletions.filter(
        (completion) =>
          completion.employee_id === employee.id &&
          monthlyTasks.some((task) => task.id === completion.task_id)
      ).length;
      const taskCompletionRate = monthlyTasks.length
        ? Math.round((taskCompletedCount / monthlyTasks.length) * 100)
        : 0;
      const salesAmount = monthlySales.reduce((total, sale) => total + Number(sale.sold_amount), 0);
      const profit = monthlySales.reduce((total, sale) => total + getProfit(sale), 0);
      const expenseAmount = employeeExpenses.reduce((total, expense) => total + Number(expense.amount), 0);
      const lastSale = monthlySales
        .map((sale) => saleCashDate(sale))
        .sort()
        .at(-1) ?? null;

      return {
        ...employee,
        assignedCount: assignedAccounts.length,
        soldCount: monthlySales.length,
        salesAmount,
        profit,
        expenseAmount,
        netContribution: profit - expenseAmount,
        advanceBalance: getAdvanceBalance(employeeAdvanceTransactions),
        averageSale: monthlySales.length ? salesAmount / monthlySales.length : 0,
        taskCompletedCount,
        taskTotalCount: monthlyTasks.length,
        taskCompletionRate,
        lastSale
      };
    })
    .sort((a, b) => b.soldCount - a.soldCount || b.salesAmount - a.salesAmount || b.taskCompletionRate - a.taskCompletionRate || b.profit - a.profit);

  const rankedRows = rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    bonusSignal: bonusSignal(index + 1, row.soldCount, row.profit, row.taskCompletionRate)
  }));
  const topEmployee = rankedRows[0];
  const totalSales = rankedRows.reduce((total, row) => total + row.salesAmount, 0);
  const totalProfit = rankedRows.reduce((total, row) => total + row.profit, 0);
  const totalExpenses = rankedRows.reduce((total, row) => total + row.expenseAmount, 0);
  const totalNet = totalProfit - totalExpenses;
  const averageTaskRate = rankedRows.length
    ? Math.round(rankedRows.reduce((total, row) => total + row.taskCompletionRate, 0) / rankedRows.length)
    : 0;
  type PerformanceRow = (typeof rankedRows)[number];

  return (
    <>
      <PageHeader
        title="Monthly Performance"
        description={`Bonus decision view for ${monthNames[selectedMonth - 1]} ${selectedYear}: sales, profit, expenses, advances, and rank in one place.`}
      />

      <form className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 shadow-soft sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select
          name="month"
          defaultValue={String(selectedMonth)}
          suppressHydrationWarning
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {monthNames.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </select>
        <input
          name="year"
          type="number"
          min="2020"
          max="2100"
          defaultValue={selectedYear}
          suppressHydrationWarning
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:whitespace-nowrap">
          View month
        </button>
      </form>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="Monthly sales" value={money(totalSales, settings.currency)} icon={Banknote} tone="good" />
        <StatCard title="Gross profit" value={money(totalProfit, settings.currency)} icon={CircleDollarSign} tone="good" />
        <StatCard title="Employee expenses" value={money(totalExpenses, settings.currency)} icon={ReceiptText} tone="warn" />
        <StatCard title="Net after expenses" value={money(totalNet, settings.currency)} icon={Trophy} tone={totalNet >= 0 ? "good" : "warn"} />
        <StatCard title="Daily task rate" value={`${averageTaskRate}%`} icon={ClipboardCheck} tone="good" />
        <StatCard title="Top performer" value={topEmployee?.name ?? "No sales"} icon={Medal} tone="good" />
      </section>

      <section className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {rankedRows.slice(0, 3).map((employee) => (
          <div key={employee.id} className="min-w-0 rounded-lg border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-muted-foreground">Rank #{employee.rank}</p>
                <h2 className="mt-1 truncate text-xl font-semibold">{employee.name}</h2>
                <p className="text-sm text-muted-foreground">{employee.bonusSignal}</p>
              </div>
              <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs uppercase text-muted-foreground">Sells</p>
                <p className="mt-1 text-lg font-semibold">{employee.soldCount}</p>
              </div>
              <div className="min-w-0 rounded-md bg-muted p-3">
                <p className="text-xs uppercase text-muted-foreground">Profit</p>
                <p className="mt-1 break-words text-lg font-semibold leading-tight">{money(employee.profit, settings.currency)}</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs uppercase text-muted-foreground">Tasks</p>
                <p className="mt-1 text-lg font-semibold">{employee.taskCompletionRate}%</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <ResponsiveTable
        rows={rankedRows}
        searchQuery={params.q}
        searchPlaceholder="Search monthly performance..."
        emptyTitle="No employees found"
        emptyDescription="Add employees and sales to build monthly performance data."
        columns={[
          { key: "rank", header: "Rank", cell: (row) => `#${row.rank}` },
          {
            key: "employee",
            header: "Employee",
            cell: (row) => (
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </div>
            ),
            searchValue: (row) => `${row.name} ${row.email} ${row.phone ?? ""}`
          },
          { key: "role", header: "Role", cell: (row) => <StatusBadge value={row.role} />, searchValue: (row) => row.role },
          { key: "assigned", header: "Assigned", cell: (row) => row.assignedCount },
          { key: "sold", header: "Sold", cell: (row) => row.soldCount },
          { key: "sales", header: "Sales", cell: (row) => money(row.salesAmount, settings.currency) },
          { key: "profit", header: "Profit", cell: (row) => money(row.profit, settings.currency) },
          { key: "expenses", header: "Expenses", cell: (row) => money(row.expenseAmount, settings.currency) },
          { key: "net", header: "Net", cell: (row) => money(row.netContribution, settings.currency) },
          { key: "advance", header: "Advance", cell: (row) => money(row.advanceBalance, settings.currency) },
          { key: "tasks", header: "Daily tasks", cell: (row) => `${row.taskCompletedCount}/${row.taskTotalCount}` },
          { key: "taskRate", header: "Task rate", cell: (row) => `${row.taskCompletionRate}%` },
          { key: "avg", header: "Avg sale", cell: (row) => money(row.averageSale, settings.currency) },
          { key: "bonus", header: "Bonus signal", cell: (row) => <StatusBadge value={row.bonusSignal} />, searchValue: (row) => row.bonusSignal },
          { key: "last", header: "Last sale", cell: (row: PerformanceRow) => row.lastSale ? formatDate(row.lastSale) : "-" }
        ]}
      />

      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-soft">
        Bonus signal is a decision helper, not an automatic payment rule. It ranks by sold count first, then sales amount, daily task completion, and profit.
      </div>
    </>
  );
}
