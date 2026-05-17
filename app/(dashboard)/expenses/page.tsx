import { ExpenseModal } from "@/components/expenses/expense-modal";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { getCurrentProfile, getExpenses, getProfiles, getSettings } from "@/lib/data";
import { formatDate, money } from "@/lib/utils";

export default async function ExpensesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = (await searchParams) ?? {};
  const [settings, allExpenses, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getExpenses(),
    getProfiles(),
    getCurrentProfile()
  ]);
  const expenses =
    currentProfile.role === "employee"
      ? allExpenses.filter((expense) => expense.paid_by === currentProfile.id)
      : allExpenses;
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const employees = profiles.filter((profile) => profile.status === "active");

  return (
    <>
      <PageHeader
        title="Expenses"
        description={
          currentProfile.role === "employee"
            ? `Your tracked expenses: ${money(total, settings.currency)}.`
            : `Total tracked expenses: ${money(total, settings.currency)}.`
        }
        action={
          <ExpenseModal
            employees={employees}
            currentProfile={currentProfile}
            categories={settings.expense_categories}
          />
        }
      />
      <ResponsiveTable
        rows={expenses}
        searchQuery={params.q}
        searchPlaceholder="Search expenses..."
        columns={[
          { key: "title", header: "Title", cell: (row) => row.title, searchValue: (row) => row.title },
          { key: "category", header: "Category", cell: (row) => <StatusBadge value={row.category} />, searchValue: (row) => row.category },
          { key: "amount", header: "Amount", cell: (row) => money(row.amount, settings.currency) },
          { key: "date", header: "Date", cell: (row) => formatDate(row.expense_date) },
          { key: "paid", header: "Paid by", cell: (row) => row.payer?.name ?? row.paid_by ?? "-", searchValue: (row) => row.payer?.name ?? row.paid_by ?? "" },
          { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" }
        ]}
      />
    </>
  );
}
