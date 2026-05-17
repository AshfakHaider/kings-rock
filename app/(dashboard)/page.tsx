import {
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  Mail,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Wallet
} from "lucide-react";
import { BarMetricChart } from "@/components/modules/charts";
import { PageHeader } from "@/components/modules/page-header";
import { StatCard } from "@/components/modules/stat-card";
import {
  getAdvanceTransactions,
  getCurrentProfile,
  getExpenses,
  getGmailAccounts,
  getSettings,
  getSoldAccounts,
  getStockAccounts
} from "@/lib/data";
import {
  employeeProfitSeries,
  getDashboardMetrics,
  monthlySeries,
  stockValueByGame
} from "@/lib/metrics";
import { money } from "@/lib/utils";

export default async function DashboardPage() {
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
  const canViewFinancials = currentProfile.role !== "employee";
  const visibleSoldAccounts =
    currentProfile.role === "employee"
      ? soldAccounts.filter((sale) => sale.employee_id === currentProfile.id)
      : soldAccounts;
  const visibleExpenses =
    currentProfile.role === "employee"
      ? expenses.filter((expense) => expense.paid_by === currentProfile.id)
      : expenses;

  const metrics = getDashboardMetrics({
    stockAccounts,
    soldAccounts: visibleSoldAccounts,
    gmailAccounts,
    expenses: visibleExpenses,
    advanceTransactions
  });

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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total stock accounts" value={String(metrics.totalStockAccounts)} icon={Boxes} />
        {canViewFinancials ? (
          <StatCard
            title="Stock buying value"
            value={money(metrics.totalStockBuyingValue, settings.currency)}
            icon={Wallet}
          />
        ) : null}
        <StatCard title="Sold accounts" value={String(metrics.totalSoldAccounts)} icon={ShoppingCart} />
        <StatCard
          title="Sales amount"
          value={money(metrics.totalSalesAmount, settings.currency)}
          icon={Banknote}
          tone="good"
        />
        {canViewFinancials ? (
          <>
            <StatCard
              title="Buying cost"
              value={money(metrics.totalBuyingCost, settings.currency)}
              icon={Boxes}
            />
            <StatCard
              title="Gross profit"
              value={money(metrics.totalGrossProfit, settings.currency)}
              icon={TrendingUp}
              tone="good"
            />
          </>
        ) : null}
        <StatCard
          title="Expenses"
          value={money(metrics.totalExpenses, settings.currency)}
          icon={ReceiptText}
          tone="warn"
        />
        {canViewFinancials ? (
          <>
            <StatCard
              title="Net profit/loss"
              value={money(metrics.netProfit, settings.currency)}
              icon={ChartNoAxesCombined}
              tone={metrics.netProfit >= 0 ? "good" : "warn"}
            />
            <StatCard
              title="Monthly profit"
              value={money(metrics.monthlyProfit, settings.currency)}
              icon={TrendingUp}
            />
            <StatCard
              title="Yearly profit"
              value={money(metrics.yearlyProfit, settings.currency)}
              icon={TrendingUp}
            />
          </>
        ) : null}
        <StatCard title="Available Gmail" value={String(metrics.availableGmailCount)} icon={Mail} />
        <StatCard
          title="Employee advance balance"
          value={money(metrics.employeeAdvanceBalance, settings.currency)}
          icon={Banknote}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <BarMetricChart
          title={canViewFinancials ? "Monthly sales and profit" : "Monthly sales"}
          data={monthlySeries(visibleSoldAccounts)}
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
              data={employeeProfitSeries(soldAccounts)}
              xKey="name"
              bars={[
                { key: "profit", name: "Profit", color: "#22c55e" },
                { key: "sales", name: "Sales", color: "#38bdf8" }
              ]}
            />
            <BarMetricChart
              title="Stock value by game"
              data={stockValueByGame(stockAccounts)}
              xKey="game"
              bars={[{ key: "value", name: "Stock value", color: "#fb7185" }]}
            />
          </>
        ) : null}
      </section>
    </>
  );
}
