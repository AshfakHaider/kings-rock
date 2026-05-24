import { deleteAdvance, deleteAdvanceTransaction } from "@/app/actions";
import { FormCard, AdvanceForm, AdvanceTransactionForm } from "@/components/modules/forms";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { getAdvanceTransactions, getAdvances, getProfiles, getSettings, getStockAccounts } from "@/lib/data";
import { getAdvanceBalance } from "@/lib/metrics";
import { formatDate, money } from "@/lib/utils";

export default async function AdvancesPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const params = (await searchParams) ?? {};
  const [settings, advances, transactions, profiles, stockAccounts] = await Promise.all([
    getSettings(),
    getAdvances(),
    getAdvanceTransactions(),
    getProfiles(),
    getStockAccounts()
  ]);
  const rows = advances.map((advance) => ({
    ...advance,
    balance: getAdvanceBalance(transactions.filter((transaction) => transaction.advance_id === advance.id))
  }));

  return (
    <>
      <PageHeader title="Employee Advances / Funds" description="Track money given, purchases, returns, adjustments, and remaining balances." />
      <div className="grid gap-4 xl:grid-cols-2">
        <FormCard title="Add advance">
          <AdvanceForm employees={profiles.filter((profile) => profile.role !== "admin")} />
        </FormCard>
        <FormCard title="Add fund transaction">
          <AdvanceTransactionForm advances={advances} stockAccounts={stockAccounts} />
        </FormCard>
      </div>
      <ResponsiveTable
        rows={rows}
        searchQuery={params.q}
        page={Number(params.page ?? 1)}
        searchPlaceholder="Search advances..."
        columns={[
          { key: "employee", header: "Employee", cell: (row) => row.employee?.name ?? row.employee_id, searchValue: (row) => row.employee?.name ?? "" },
          { key: "amount", header: "Given", cell: (row) => money(row.amount_given, settings.currency) },
          { key: "balance", header: "Balance", cell: (row) => money(row.balance, settings.currency) },
          { key: "purpose", header: "Purpose", cell: (row) => row.purpose ?? "-", searchValue: (row) => row.purpose ?? "" },
          { key: "method", header: "Method", cell: (row) => row.payment_method ?? "-" },
          { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} />, searchValue: (row) => row.status },
          { key: "date", header: "Date", cell: (row) => formatDate(row.date_given) },
          {
            key: "actions",
            header: "Actions",
            cell: (row) => (
              <form action={deleteAdvance}>
                <input type="hidden" name="id" value={row.id} />
                <DeleteButton label="Delete fund" iconOnly />
              </form>
            )
          }
        ]}
      />
      <ResponsiveTable
        rows={transactions}
        searchQuery={params.q}
        page={Number(params.page ?? 1)}
        searchPlaceholder="Search fund transactions..."
        columns={[
          { key: "type", header: "Type", cell: (row) => <StatusBadge value={row.type} />, searchValue: (row) => row.type },
          { key: "amount", header: "Amount", cell: (row) => money(row.amount, settings.currency) },
          { key: "stock", header: "Stock link", cell: (row) => row.stock_account_id ?? "-" },
          { key: "date", header: "Date", cell: (row) => formatDate(row.transaction_date) },
          { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" },
          {
            key: "actions",
            header: "Actions",
            cell: (row) => (
              <form action={deleteAdvanceTransaction}>
                <input type="hidden" name="id" value={row.id} />
                <DeleteButton label="Delete transaction" iconOnly />
              </form>
            )
          }
        ]}
      />
    </>
  );
}
