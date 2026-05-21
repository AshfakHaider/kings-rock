import { AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react";
import { ExpenseModal } from "@/components/expenses/expense-modal";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatCard } from "@/components/modules/stat-card";
import { StatusBadge } from "@/components/modules/status-badge";
import { getCurrentProfile, getExpenses, getProfiles, getSettings } from "@/lib/data";
import { formatDate, money } from "@/lib/utils";

const lossCategories = ["scam_account", "refund_account"] as const;

function lossTitle(category: string) {
  if (category === "scam_account") return "Scam account";
  if (category === "refund_account") return "Refund account";
  return category.replaceAll("_", " ");
}

export default async function LossesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = (await searchParams) ?? {};
  const [settings, allExpenses, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getExpenses(),
    getProfiles(),
    getCurrentProfile()
  ]);

  const visibleExpenses =
    currentProfile.role === "employee"
      ? allExpenses.filter((expense) => expense.paid_by === currentProfile.id)
      : allExpenses;
  const losses = visibleExpenses.filter((expense) => lossCategories.includes(expense.category as (typeof lossCategories)[number]));
  const scamLosses = losses.filter((expense) => expense.category === "scam_account");
  const refundLosses = losses.filter((expense) => expense.category === "refund_account");
  const employees = profiles.filter((profile) => profile.status === "active");

  const totalLoss = losses.reduce((sum, loss) => sum + Number(loss.amount), 0);
  const scamTotal = scamLosses.reduce((sum, loss) => sum + Number(loss.amount), 0);
  const refundTotal = refundLosses.reduce((sum, loss) => sum + Number(loss.amount), 0);

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

      <section className="grid gap-4 xl:grid-cols-2">
        <ResponsiveTable
          rows={scamLosses}
          searchQuery={params.q}
          searchPlaceholder="Search scam losses..."
          emptyTitle="No scam account losses"
          emptyDescription="Scam account damage will appear here."
          columns={[
            { key: "title", header: "Account / Title", cell: (row) => row.title, searchValue: (row) => row.title },
            { key: "amount", header: "Loss", cell: (row) => money(row.amount, settings.currency) },
            { key: "date", header: "Date", cell: (row) => formatDate(row.expense_date) },
            { key: "paid", header: "Recorded by", cell: (row) => row.payer?.name ?? row.paid_by ?? "-", searchValue: (row) => row.payer?.name ?? row.paid_by ?? "" },
            { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" }
          ]}
        />

        <ResponsiveTable
          rows={refundLosses}
          searchQuery={params.q}
          searchPlaceholder="Search refund losses..."
          emptyTitle="No refund account losses"
          emptyDescription="Refund account damage will appear here."
          columns={[
            { key: "title", header: "Account / Title", cell: (row) => row.title, searchValue: (row) => row.title },
            { key: "amount", header: "Refund loss", cell: (row) => money(row.amount, settings.currency) },
            { key: "date", header: "Date", cell: (row) => formatDate(row.expense_date) },
            { key: "paid", header: "Recorded by", cell: (row) => row.payer?.name ?? row.paid_by ?? "-", searchValue: (row) => row.payer?.name ?? row.paid_by ?? "" },
            { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" }
          ]}
        />
      </section>

      <ResponsiveTable
        rows={losses}
        searchQuery={params.q}
        searchPlaceholder="Search all losses..."
        emptyTitle="No losses recorded"
        emptyDescription="Add scam or refund account damage to track it against profit."
        columns={[
          { key: "title", header: "Account / Title", cell: (row) => row.title, searchValue: (row) => row.title },
          { key: "type", header: "Type", cell: (row) => <StatusBadge value={lossTitle(row.category)} />, searchValue: (row) => row.category },
          { key: "amount", header: "Loss", cell: (row) => money(row.amount, settings.currency) },
          { key: "date", header: "Date", cell: (row) => formatDate(row.expense_date) },
          { key: "paid", header: "Recorded by", cell: (row) => row.payer?.name ?? row.paid_by ?? "-", searchValue: (row) => row.payer?.name ?? row.paid_by ?? "" },
          { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-", searchValue: (row) => row.notes ?? "" }
        ]}
      />
    </>
  );
}
