import { ClipboardCheck, ListChecks, Trophy, Users } from "lucide-react";
import { CompleteTaskButton } from "@/components/daily-tasks/complete-task-button";
import { DailyTaskModal } from "@/components/daily-tasks/daily-task-modal";
import { TaskProofGallery } from "@/components/daily-tasks/task-proof-gallery";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatCard } from "@/components/modules/stat-card";
import { StatusBadge } from "@/components/modules/status-badge";
import {
  getCurrentProfile,
  getDailyTaskCompletions,
  getDailyTasks,
  getProfiles
} from "@/lib/data";
import { formatDate } from "@/lib/utils";

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

export default async function DailyTasksPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; year?: string; q?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const now = new Date();
  const selectedMonth = Number(params.month ?? now.getMonth() + 1);
  const selectedYear = Number(params.year ?? now.getFullYear());
  const [currentProfile, tasks, completions, profiles] = await Promise.all([
    getCurrentProfile(),
    getDailyTasks(),
    getDailyTaskCompletions(),
    getProfiles()
  ]);

  const canManage = currentProfile.role !== "employee";
  const employees = profiles.filter((profile) => profile.role !== "admin" && profile.status === "active");
  const monthlyTasks = tasks.filter((task) => inSelectedMonth(task.task_date, selectedYear, selectedMonth));
  const monthlyTaskIds = new Set(monthlyTasks.map((task) => task.id));
  const monthlyCompletions = completions.filter((completion) => monthlyTaskIds.has(completion.task_id));
  const visibleCompletions = canManage
    ? monthlyCompletions
    : monthlyCompletions.filter((completion) => completion.employee_id === currentProfile.id);
  const completedTaskIds = new Set(visibleCompletions.map((completion) => completion.task_id));
  const totalPossibleCompletions = monthlyTasks.length * employees.length;
  const completionRate = totalPossibleCompletions
    ? Math.round((monthlyCompletions.length / totalPossibleCompletions) * 100)
    : 0;

  const taskRows = monthlyTasks.map((task) => {
    const taskCompletions = monthlyCompletions.filter((completion) => completion.task_id === task.id);
    const completedNames = taskCompletions
      .map((completion) => completion.employee?.name)
      .filter(Boolean)
      .join(", ");

    return {
      ...task,
      completedCount: taskCompletions.length,
      totalEmployees: employees.length,
      completedNames,
      completedByCurrentUser: completedTaskIds.has(task.id)
    };
  });
  const completionRows = monthlyCompletions;

  const employeeRows = employees.map((employee) => {
    const employeeCompletions = monthlyCompletions.filter((completion) => completion.employee_id === employee.id);
    const completedCount = employeeCompletions.length;

    return {
      ...employee,
      completedCount,
      totalTasks: monthlyTasks.length,
      completionRate: monthlyTasks.length ? Math.round((completedCount / monthlyTasks.length) * 100) : 0,
      lastCompleted:
        employeeCompletions
          .map((completion) => completion.completed_at)
          .sort()
          .at(-1) ?? null
    };
  }).sort((a, b) => b.completedCount - a.completedCount || b.completionRate - a.completionRate || a.name.localeCompare(b.name));
  const topCompleter = employeeRows[0];

  return (
    <>
      <PageHeader
        title="Daily Tasks"
        description={`Monthly daily-task tracking for ${monthNames[selectedMonth - 1]} ${selectedYear}.`}
        action={canManage ? <DailyTaskModal /> : null}
      />

      <form className="grid gap-3 rounded-lg border bg-card p-4 shadow-soft sm:grid-cols-[1fr_1fr_auto]">
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
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          View month
        </button>
      </form>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Daily tasks" value={String(monthlyTasks.length)} icon={ListChecks} />
        <StatCard title="Completions" value={String(canManage ? monthlyCompletions.length : visibleCompletions.length)} icon={ClipboardCheck} tone="good" />
        <StatCard title="Completion rate" value={`${canManage ? completionRate : (monthlyTasks.length ? Math.round((visibleCompletions.length / monthlyTasks.length) * 100) : 0)}%`} icon={Trophy} tone="good" />
        <StatCard title="Top completer" value={canManage ? topCompleter?.name ?? "No data" : currentProfile.name} icon={Users} />
      </section>

      <ResponsiveTable
        rows={taskRows}
        searchQuery={params.q}
        searchPlaceholder="Search daily tasks..."
        emptyTitle="No daily tasks"
        emptyDescription={canManage ? "Create the first daily task for this month." : "No daily tasks have been assigned this month."}
        columns={[
          {
            key: "task",
            header: "Task",
            cell: (row) => (
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.description ?? "No details"}</p>
              </div>
            ),
            searchValue: (row) => `${row.title} ${row.description ?? ""}`
          },
          { key: "date", header: "Date", cell: (row) => formatDate(row.task_date) },
          ...(canManage
            ? [
                {
                  key: "completed",
                  header: "Completed",
                  cell: (row: (typeof taskRows)[number]) => `${row.completedCount}/${row.totalEmployees}`
                } as const,
                {
                  key: "completedBy",
                  header: "Completed by",
                  cell: (row: (typeof taskRows)[number]) => row.completedNames || "-",
                  searchValue: (row: (typeof taskRows)[number]) => row.completedNames
                } as const
              ]
            : [
                {
                  key: "status",
                  header: "Status",
                  cell: (row: (typeof taskRows)[number]) => <StatusBadge value={row.completedByCurrentUser ? "completed" : "pending"} />,
                  searchValue: (row: (typeof taskRows)[number]) => row.completedByCurrentUser ? "completed" : "pending"
                } as const,
                {
                  key: "action",
                  header: "Action",
                  cell: (row: (typeof taskRows)[number]) => (
                    <CompleteTaskButton taskId={row.id} completed={row.completedByCurrentUser} />
                  )
                } as const
              ])
        ]}
      />

      {canManage ? (
        <>
          <ResponsiveTable
            rows={completionRows}
            searchPlaceholder="Search completion proofs..."
            emptyTitle="No completion proofs"
            emptyDescription="Screenshots will appear after employees complete tasks."
            columns={[
              {
                key: "task",
                header: "Task",
                cell: (row) => row.task?.title ?? row.task_id,
                searchValue: (row) => row.task?.title ?? row.task_id
              },
              {
                key: "employee",
                header: "Employee",
                cell: (row) => (
                  <div>
                    <p className="font-medium">{row.employee?.name ?? row.employee_id}</p>
                    <p className="text-xs text-muted-foreground">{row.employee?.email ?? ""}</p>
                  </div>
                ),
                searchValue: (row) => `${row.employee?.name ?? ""} ${row.employee?.email ?? ""}`
              },
              {
                key: "screenshot",
                header: "Screenshot",
                cell: (row) => (
                  <TaskProofGallery images={row.screenshot_urls?.length ? row.screenshot_urls : row.screenshot_url ? [row.screenshot_url] : []} />
                )
              },
              { key: "completedAt", header: "Completed", cell: (row) => formatDate(row.completed_at) }
            ]}
          />

          <ResponsiveTable
            rows={employeeRows}
            searchPlaceholder="Search employee completion..."
            emptyTitle="No employee task data"
            emptyDescription="Task completion will appear after employees mark work done."
            columns={[
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
              { key: "completed", header: "Completed", cell: (row) => `${row.completedCount}/${row.totalTasks}` },
              { key: "rate", header: "Rate", cell: (row) => `${row.completionRate}%` },
              { key: "last", header: "Last completed", cell: (row) => row.lastCompleted ? formatDate(row.lastCompleted) : "-" }
            ]}
          />
        </>
      ) : null}
    </>
  );
}
