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
import { getDashboardSnapshot } from "@/lib/data";
import { money } from "@/lib/utils";

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();
  const canViewFinancials = snapshot.role !== "employee";
  const metrics = snapshot.metrics;

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
            value={money(metrics.totalStockBuyingValue, snapshot.currency)}
            icon={Wallet}
          />
        ) : null}
        <StatCard title="Sold accounts" value={String(metrics.totalSoldAccounts)} icon={ShoppingCart} />
        <StatCard
          title="Sales amount"
          value={money(metrics.totalSalesAmount, snapshot.currency)}
          icon={Banknote}
          tone="good"
        />
        {canViewFinancials ? (
          <>
            <StatCard
              title="Buying cost"
              value={money(metrics.totalBuyingCost, snapshot.currency)}
              icon={Boxes}
            />
            <StatCard
              title="Gross profit"
              value={money(metrics.totalGrossProfit, snapshot.currency)}
              icon={TrendingUp}
              tone="good"
            />
          </>
        ) : null}
        <StatCard
          title="Expenses"
          value={money(metrics.totalExpenses, snapshot.currency)}
          icon={ReceiptText}
          tone="warn"
        />
        {canViewFinancials ? (
          <>
            <StatCard
              title="Net profit/loss"
              value={money(metrics.netProfit, snapshot.currency)}
              icon={ChartNoAxesCombined}
              tone={metrics.netProfit >= 0 ? "good" : "warn"}
            />
            <StatCard
              title="Monthly profit"
              value={money(metrics.monthlyProfit, snapshot.currency)}
              icon={TrendingUp}
            />
            <StatCard
              title="Yearly profit"
              value={money(metrics.yearlyProfit, snapshot.currency)}
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

      <section className="grid gap-4 xl:grid-cols-2">
        <BarMetricChart
          title={canViewFinancials ? "Monthly sales and profit" : "Monthly sales"}
          data={snapshot.monthlySeries}
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
              data={snapshot.employeeProfitSeries}
              xKey="name"
              bars={[
                { key: "profit", name: "Profit", color: "#22c55e" },
                { key: "sales", name: "Sales", color: "#38bdf8" }
              ]}
            />
            <BarMetricChart
              title="Stock value by game"
              data={snapshot.stockValueByGame}
              xKey="game"
              bars={[{ key: "value", name: "Stock value", color: "#fb7185" }]}
            />
          </>
        ) : null}
      </section>
    </>
  );
}
