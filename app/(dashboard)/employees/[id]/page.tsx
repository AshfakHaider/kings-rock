import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Boxes,
  Calendar,
  CircleDollarSign,
  Mail,
  Phone,
  ShoppingCart,
  TrendingUp
} from "lucide-react";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatCard } from "@/components/modules/stat-card";
import { StatusBadge } from "@/components/modules/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAdvanceTransactions,
  getAdvances,
  getCurrentProfile,
  getProfiles,
  getSettings,
  getSoldAccounts,
  getStockAccounts
} from "@/lib/data";
import { getAdvanceBalance, getProfit, isPaidSale, saleCashDate } from "@/lib/metrics";
import { stockDisplayTitle } from "@/lib/stock-title";
import { formatDate, money } from "@/lib/utils";

export default async function EmployeeDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [
    settings,
    profiles,
    stockAccounts,
    soldAccounts,
    advances,
    advanceTransactions,
    currentProfile
  ] = await Promise.all([
    getSettings(),
    getProfiles(),
    getStockAccounts(),
    getSoldAccounts(),
    getAdvances(),
    getAdvanceTransactions(),
    getCurrentProfile()
  ]);

  if (currentProfile.role === "employee" && currentProfile.id !== id) redirect("/employees");

  const employee = profiles.find((profile) => profile.id === id);
  if (!employee) notFound();
  const canViewFinancials = currentProfile.role !== "employee";

  const assignedAccounts = stockAccounts.filter(
    (account) => account.assigned_employee_id === employee.id && account.status !== "sold"
  );
  const sales = soldAccounts.filter((sale) => sale.employee_id === employee.id);
  const paidSales = sales.filter(isPaidSale);
  const employeeAdvances = advances.filter((advance) => advance.employee_id === employee.id);
  const employeeAdvanceTransactions = advanceTransactions.filter(
    (transaction) => transaction.employee_id === employee.id
  );

  const salesAmount = paidSales.reduce((total, sale) => total + Number(sale.sold_amount), 0);
  const buyingCost = paidSales.reduce(
    (total, sale) => total + Number(sale.stock_account?.buying_price ?? 0),
    0
  );
  const profit = paidSales.reduce((total, sale) => total + getProfit(sale), 0);
  const advanceBalance = getAdvanceBalance(employeeAdvanceTransactions);
  const now = new Date();
  const monthlyProfit = paidSales
    .filter((sale) => {
      const soldDate = new Date(saleCashDate(sale));
      return soldDate.getMonth() === now.getMonth() && soldDate.getFullYear() === now.getFullYear();
    })
    .reduce((total, sale) => total + getProfit(sale), 0);

  return (
    <>
      <PageHeader
        title={employee.name}
        description={
          canViewFinancials
            ? "Employee profile, account workload, sales, profit, and fund history."
            : "Your profile, account workload, sales, and fund history."
        }
        action={
          <Button asChild variant="outline">
            <Link href="/employees">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Assigned accounts" value={String(assignedAccounts.length)} icon={Boxes} />
        <StatCard title="Paid sold accounts" value={String(paidSales.length)} icon={ShoppingCart} />
        <StatCard title="Received sales" value={money(salesAmount, settings.currency)} icon={Banknote} tone="good" />
        {canViewFinancials ? (
          <>
            <StatCard title="Total profit" value={money(profit, settings.currency)} icon={TrendingUp} tone="good" />
            <StatCard title="Buying cost" value={money(buyingCost, settings.currency)} icon={Boxes} />
            <StatCard title="Monthly profit" value={money(monthlyProfit, settings.currency)} icon={TrendingUp} />
          </>
        ) : null}
        <StatCard title="Advance balance" value={money(advanceBalance, settings.currency)} icon={CircleDollarSign} />
        <StatCard title="Open advances" value={String(employeeAdvances.filter((advance) => advance.status !== "settled").length)} icon={Banknote} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Employee Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Role</span>
              <StatusBadge value={employee.role} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge value={employee.status} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                Email
              </span>
              <span className="text-right">{employee.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                Phone
              </span>
              <span>{employee.phone ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Join date
              </span>
              <span>{formatDate(employee.join_date)}</span>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {employee.notes || "No employee notes added."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase text-muted-foreground">Average sale</p>
              <p className="mt-1 text-lg font-semibold">
                {money(paidSales.length ? salesAmount / paidSales.length : 0, settings.currency)}
              </p>
            </div>
            {canViewFinancials ? (
              <>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Average profit</p>
                  <p className="mt-1 text-lg font-semibold">
                    {money(paidSales.length ? profit / paidSales.length : 0, settings.currency)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Current stock value</p>
                  <p className="mt-1 text-lg font-semibold">
                    {money(
                      assignedAccounts.reduce((total, account) => total + Number(account.buying_price), 0),
                      settings.currency
                    )}
                  </p>
                </div>
              </>
            ) : null}
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase text-muted-foreground">Fund transactions</p>
              <p className="mt-1 text-lg font-semibold">{employeeAdvanceTransactions.length}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Current Assigned Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            rows={assignedAccounts}
            searchPlaceholder="Search assigned accounts..."
            emptyTitle="No assigned accounts"
            emptyDescription="This employee has no active assigned accounts."
            columns={[
              {
                key: "account",
                header: "Account",
                cell: (row) => (
                  <Link href={`/stock-accounts/${row.id}`} className="font-medium text-primary hover:underline">
                    {stockDisplayTitle(row.secret_code, row.account_title)}
                  </Link>
                ),
                searchValue: (row) => `${row.secret_code ?? ""} ${row.account_title} ${row.game_name}`
              },
              { key: "game", header: "Game", cell: (row) => row.game_name, searchValue: (row) => row.game_name },
              ...(canViewFinancials
                ? [{ key: "buying", header: "Buying", cell: (row: (typeof assignedAccounts)[number]) => money(row.buying_price, settings.currency) } as const]
                : []),
              { key: "selling", header: "Selling", cell: (row) => money(row.selling_price, settings.currency) },
              { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} />, searchValue: (row) => row.status },
              { key: "date", header: "Purchase date", cell: (row) => formatDate(row.purchase_date) }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sell History</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            rows={sales}
            searchPlaceholder="Search sell history..."
            emptyTitle="No sales yet"
            emptyDescription="This employee has not sold any accounts yet."
            columns={[
              {
                key: "account",
                header: "Account",
                cell: (row) => (
                  <div>
                    <p className="font-medium">
                      {stockDisplayTitle(row.stock_account?.secret_code, row.stock_account?.account_title ?? row.stock_account_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.stock_account?.game_name ?? "-"}</p>
                  </div>
                ),
                searchValue: (row) => `${row.stock_account?.secret_code ?? ""} ${row.stock_account?.account_title ?? ""} ${row.stock_account?.game_name ?? ""}`
              },
              { key: "sold", header: "Sold amount", cell: (row) => money(row.sold_amount, settings.currency) },
              ...(canViewFinancials
                ? [
                    { key: "buying", header: "Buying cost", cell: (row: (typeof sales)[number]) => money(row.stock_account?.buying_price ?? 0, settings.currency) } as const,
                    { key: "profit", header: "Profit", cell: (row: (typeof sales)[number]) => isPaidSale(row) ? money(getProfit(row), settings.currency) : "Waiting payment" } as const
                  ]
                : []),
              { key: "source", header: "Source", cell: (row) => row.sold_source_website ?? "-", searchValue: (row) => row.sold_source_website ?? "" },
              { key: "payment", header: "Payment", cell: (row) => <StatusBadge value={row.payment_status} />, searchValue: (row) => row.payment_status },
              { key: "date", header: "Sold date", cell: (row) => formatDate(row.sold_date) },
              { key: "paidDate", header: "Paid date", cell: (row) => row.payment_received_date ? formatDate(row.payment_received_date) : "-" }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advance History</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            rows={employeeAdvanceTransactions}
            searchPlaceholder="Search fund history..."
            emptyTitle="No fund transactions"
            emptyDescription="No advance or fund activity has been recorded for this employee."
            columns={[
              { key: "type", header: "Type", cell: (row) => <StatusBadge value={row.type} />, searchValue: (row) => row.type },
              { key: "amount", header: "Amount", cell: (row) => money(row.amount, settings.currency) },
              { key: "stock", header: "Stock link", cell: (row) => row.stock_account_id ?? "-" },
              { key: "date", header: "Date", cell: (row) => formatDate(row.transaction_date) },
              { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" }
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}
