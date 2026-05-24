import { deleteExpense } from "@/app/actions";
import { ExpenseModal } from "@/components/expenses/expense-modal";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { DEFAULT_PAGE_SIZE, getCurrentProfile, getExpenseTotals, getExpensesPage, getProfiles, getSettings } from "@/lib/data";
import { formatDate, money } from "@/lib/utils";

const lossCategories = new Set(["scam_account", "refund_account"]);

export default async function ExpensesPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const params = (await searchParams) ?? {};
  const page = Number(params.page ?? 1);
  const [settings, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getProfiles(),
    getCurrentProfile()
  ]);
  const expenseFilter = {
    excludeCategories: Array.from(lossCategories),
    paidBy: currentProfile.role === "employee" ? currentProfile.id : null
  };
  const [expensePage, totals] = await Promise.all([
    getExpensesPage({ ...expenseFilter, page, pageSize: DEFAULT_PAGE_SIZE, q: params.q }),
    getExpenseTotals(expenseFilter)
  ]);
  const expenses = expensePage.rows;
  const total = totals.total;
  const employees = profiles.filter((profile) => profile.status === "active");
  const expenseCategories = settings.expense_categories.filter((category) => !lossCategories.has(category));
  const canManageExpenses = currentProfile.role !== "employee";

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
            categories={expenseCategories}
          />
        }
      />
      <ResponsiveTable
        rows={expenses}
        searchQuery={params.q}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        totalRows={expensePage.total}
        serverSide
        searchPlaceholder="Search expenses..."
        columns={[
          { key: "title", header: "Title", cell: (row) => row.title, searchValue: (row) => row.title },
          { key: "category", header: "Category", cell: (row) => <StatusBadge value={row.category} />, searchValue: (row) => row.category },
          { key: "amount", header: "Amount", cell: (row) => money(row.amount, settings.currency) },
          { key: "date", header: "Date", cell: (row) => formatDate(row.expense_date) },
          { key: "paid", header: "Paid by", cell: (row) => row.payer?.name ?? row.paid_by ?? "-", searchValue: (row) => row.payer?.name ?? row.paid_by ?? "" },
          { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" },
          ...(canManageExpenses
            ? [{
                key: "actions",
                header: "Actions",
                cell: (row: (typeof expenses)[number]) => (
                  <div className="flex flex-wrap gap-2">
                    <ExpenseModal
                      employees={employees}
                      currentProfile={currentProfile}
                      categories={expenseCategories}
                      expense={row}
                      trigger="icon"
                      buttonLabel="Edit expense"
                      modalTitle="Edit expense"
                      modalDescription="Update this business expense."
                      defaultCategory={row.category}
                    />
                    <form action={deleteExpense}>
                      <input type="hidden" name="id" value={row.id} />
                      <DeleteButton label="Delete expense" iconOnly />
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
