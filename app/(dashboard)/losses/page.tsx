import { deleteExpense } from "@/app/actions";
import { AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react";
import { ExpenseModal } from "@/components/expenses/expense-modal";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatCard } from "@/components/modules/stat-card";
import { StatusBadge } from "@/components/modules/status-badge";
import { DEFAULT_PAGE_SIZE, getCurrentProfile, getExpenseTotals, getExpensesPage, getProfiles, getSettings } from "@/lib/data";
import type { Expense } from "@/lib/types";
import { formatDate, money } from "@/lib/utils";

const lossCategories = ["scam_account", "refund_account"] as const;

function normalizeLossCategory(category: string) {
  const normalized = category.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (normalized === "scam" || normalized === "scam_accounts") return "scam_account";
  if (normalized === "refund" || normalized === "refund_accounts") return "refund_account";
  return normalized;
}

function LossActions({
  loss,
  employees,
  currentProfile
}: {
  loss: Expense;
  employees: Awaited<ReturnType<typeof getProfiles>>;
  currentProfile: Awaited<ReturnType<typeof getCurrentProfile>>;
}) {
  if (currentProfile.role === "employee") return <span className="text-xs text-muted-foreground">View only</span>;

  return (
    <div className="flex flex-wrap gap-2">
      <ExpenseModal
        employees={employees}
        currentProfile={currentProfile}
        categories={[...lossCategories]}
        expense={loss}
        trigger="icon"
        buttonLabel="Edit loss"
        modalTitle="Edit loss"
        modalDescription="Update scam or refund damage. This changes net profit."
        defaultCategory={loss.category}
        categoryLabel="Loss type"
      />
      <form action={deleteExpense}>
        <input type="hidden" name="id" value={loss.id} />
        <DeleteButton label="Delete loss" iconOnly />
      </form>
    </div>
  );
}

export default async function LossesPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const params = (await searchParams) ?? {};
  const page = Number(params.page ?? 1);
  const [settings, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getProfiles(),
    getCurrentProfile()
  ]);

  const lossFilter = {
    categories: [...lossCategories],
    paidBy: currentProfile.role === "employee" ? currentProfile.id : null
  };
  const [lossPage, totals] = await Promise.all([
    getExpensesPage({ ...lossFilter, page, pageSize: DEFAULT_PAGE_SIZE, q: params.q }),
    getExpenseTotals(lossFilter)
  ]);
  const losses = lossPage.rows;
  const employees = profiles.filter((profile) => profile.status === "active");

  const totalLoss = totals.total;
  const scamTotal = Number(totals.byCategory.scam_account ?? 0);
  const refundTotal = Number(totals.byCategory.refund_account ?? 0);

  return (
    <>
      <PageHeader
        title="Losses"
        description={`Scam and refund damage tracked separately. Total loss: ${money(totalLoss, settings.currency)}.`}
        action={
          <ExpenseModal
            employees={employees}
            currentProfile={currentProfile}
            categories={[...lossCategories]}
            buttonLabel="Add loss"
            modalTitle="Add loss"
            modalDescription="Record scam or refund damage. This subtracts from net profit."
            defaultCategory="scam_account"
            categoryLabel="Loss type"
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total losses" value={money(totalLoss, settings.currency)} icon={ShieldAlert} tone="warn" />
        <StatCard title="Scam accounts" value={money(scamTotal, settings.currency)} icon={AlertTriangle} tone="warn" />
        <StatCard title="Refund accounts" value={money(refundTotal, settings.currency)} icon={RotateCcw} tone="warn" />
      </section>

      <ResponsiveTable
        rows={losses}
        searchQuery={params.q}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        totalRows={lossPage.total}
        serverSide
        searchPlaceholder="Search all losses..."
        emptyTitle="No losses recorded"
        emptyDescription="Add scam or refund account damage to track it against profit."
        columns={[
          { key: "title", header: "Account / Title", cell: (row) => row.title, searchValue: (row) => row.title },
          { key: "type", header: "Type", cell: (row) => <StatusBadge value={normalizeLossCategory(row.category)} />, searchValue: (row) => row.category },
          { key: "amount", header: "Loss", cell: (row) => money(row.amount, settings.currency) },
          { key: "date", header: "Date", cell: (row) => formatDate(row.expense_date) },
          { key: "paid", header: "Recorded by", cell: (row) => row.payer?.name ?? row.paid_by ?? "-", searchValue: (row) => row.payer?.name ?? row.paid_by ?? "" },
          { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" },
          { key: "actions", header: "Actions", cell: (row) => <LossActions loss={row} employees={employees} currentProfile={currentProfile} /> }
        ]}
      />
    </>
  );
}
