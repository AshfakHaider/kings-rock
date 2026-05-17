import { Award, Banknote, Medal, ShoppingCart, Trophy } from "lucide-react";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatCard } from "@/components/modules/stat-card";
import { StatusBadge } from "@/components/modules/status-badge";
import { getMonthlyLeaderboard, getSettings } from "@/lib/data";
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

function rankLabel(index: number) {
  if (index === 0) return "Champion";
  if (index === 1) return "Runner up";
  if (index === 2) return "Third place";
  return `Rank ${index + 1}`;
}

export default async function LeaderboardPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; year?: string; q?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const now = new Date();
  const selectedMonth = Number(params.month ?? now.getMonth() + 1);
  const selectedYear = Number(params.year ?? now.getFullYear());
  const [settings, leaderboard] = await Promise.all([
    getSettings(),
    getMonthlyLeaderboard(selectedYear, selectedMonth)
  ]);

  const rankedRows = leaderboard.map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));
  const topThree = rankedRows.slice(0, 3);
  const totalSells = rankedRows.reduce((sum, entry) => sum + entry.sold_count, 0);
  const totalAmount = rankedRows.reduce((sum, entry) => sum + Number(entry.total_sales), 0);
  const avgTaskRate = rankedRows.length
    ? Math.round(rankedRows.reduce((sum, entry) => sum + Number(entry.task_completion_rate), 0) / rankedRows.length)
    : 0;
  type LeaderboardRow = (typeof rankedRows)[number];

  return (
    <>
      <PageHeader
        title="Leaderboard"
        description={`Monthly employee ranking for ${monthNames[selectedMonth - 1]} ${selectedYear}, based on number of sells first and sales amount second.`}
      />

      <form className="grid gap-3 rounded-lg border bg-card p-4 shadow-soft sm:grid-cols-[1fr_1fr_auto]">
        <select
          name="month"
          defaultValue={String(selectedMonth)}
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
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          View month
        </button>
      </form>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total sells" value={String(totalSells)} icon={ShoppingCart} />
        <StatCard title="Total amount" value={money(totalAmount, settings.currency)} icon={Banknote} tone="good" />
        <StatCard title="Task completion" value={`${avgTaskRate}%`} icon={Award} tone="good" />
      </section>

      {topThree.length ? (
        <section className="grid gap-3 lg:grid-cols-3">
          {topThree.map((entry, index) => (
            <div key={entry.employee_id} className="rounded-lg border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">{rankLabel(index)}</p>
                  <h2 className="mt-1 text-xl font-semibold">{entry.name}</h2>
                  <p className="text-sm text-muted-foreground">{entry.email}</p>
                </div>
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  {index === 0 ? <Trophy className="h-5 w-5" /> : <Medal className="h-5 w-5" />}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs uppercase text-muted-foreground">Sells</p>
                  <p className="mt-1 text-lg font-semibold">{entry.sold_count}</p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs uppercase text-muted-foreground">Amount</p>
                  <p className="mt-1 text-lg font-semibold">{money(entry.total_sales, settings.currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <ResponsiveTable
        rows={rankedRows}
        searchQuery={params.q}
        searchPlaceholder="Search leaderboard..."
        emptyTitle="No leaderboard data"
        emptyDescription="No active sellers or sales were found for this month."
        columns={[
          {
            key: "rank",
            header: "Rank",
            cell: (row) => (
              <div className="flex items-center gap-2 font-semibold">
                {row.rank <= 3 ? <Award className="h-4 w-4 text-primary" /> : null}
                #{row.rank}
              </div>
            )
          },
          {
            key: "employee",
            header: "Employee",
            cell: (row) => (
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </div>
            ),
            searchValue: (row) => `${row.name} ${row.email}`
          },
          { key: "role", header: "Role", cell: (row) => <StatusBadge value={row.role} />, searchValue: (row) => row.role },
          { key: "sells", header: "Sells", cell: (row) => row.sold_count },
          {
            key: "amount",
            header: "Amount",
            cell: (row) => money(row.total_sales, settings.currency)
          },
          {
            key: "tasks",
            header: "Daily tasks",
            cell: (row) => `${row.task_completed_count}/${row.task_total_count}`
          },
          {
            key: "taskRate",
            header: "Task rate",
            cell: (row) => `${row.task_completion_rate}%`
          },
          {
            key: "average",
            header: "Avg sale",
            cell: (row) => money(row.sold_count ? row.total_sales / row.sold_count : 0, settings.currency)
          },
          {
            key: "last",
            header: "Last sale",
            cell: (row: LeaderboardRow) => (row.last_sale ? formatDate(row.last_sale) : "-")
          }
        ]}
      />
    </>
  );
}
