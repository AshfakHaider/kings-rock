import { approveEmployee, deleteEmployee } from "@/app/actions";
import { EmployeeModal } from "@/components/employees/employee-modal";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { getAdvanceTransactions, getCurrentProfile, getProfiles, getSettings, getSoldAccounts, getStockAccounts } from "@/lib/data";
import { getAdvanceBalance, getProfit, isPaidSale } from "@/lib/metrics";
import { money } from "@/lib/utils";
import Link from "next/link";

export default async function EmployeesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const params = (await searchParams) ?? {};
  const [settings, profiles, stockAccounts, soldAccounts, advanceTransactions, currentProfile] = await Promise.all([
    getSettings(),
    getProfiles(),
    getStockAccounts(),
    getSoldAccounts(),
    getAdvanceTransactions(),
    getCurrentProfile()
  ]);
  const canViewFinancials = currentProfile.role !== "employee";
  const canManageEmployees = currentProfile.role !== "employee";
  const canApproveEmployees = currentProfile.role === "admin";
  const visibleProfiles =
    currentProfile.role === "employee"
      ? profiles.filter((profile) => profile.id === currentProfile.id)
      : profiles;

  const rows = visibleProfiles.map((profile) => {
    const assigned = stockAccounts.filter((account) => account.assigned_employee_id === profile.id);
    const sales = soldAccounts.filter((sale) => sale.employee_id === profile.id && isPaidSale(sale));
    const transactions = advanceTransactions.filter((transaction) => transaction.employee_id === profile.id);
    return {
      ...profile,
      assignedCount: assigned.length,
      soldCount: sales.length,
      salesAmount: sales.reduce((total, sale) => total + Number(sale.sold_amount), 0),
      buyingCost: sales.reduce((total, sale) => total + Number(sale.stock_account?.buying_price ?? 0), 0),
      profit: sales.reduce((total, sale) => total + getProfit(sale), 0),
      advanceBalance: getAdvanceBalance(transactions)
    };
  });
  type EmployeeRow = (typeof rows)[number];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage staff, permissions, performance, advances, and sale history."
        action={canManageEmployees ? <EmployeeModal /> : null}
      />
      <ResponsiveTable
        rows={rows}
        searchQuery={params.q}
        searchPlaceholder="Search employees..."
        columns={[
          {
            key: "name",
            header: "Employee",
            cell: (row) => (
              <Link href={`/employees/${row.id}`} className="block rounded-md p-1 -m-1 hover:bg-muted">
                <p className="font-medium text-primary">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </Link>
            ),
            searchValue: (row) => `${row.name} ${row.email} ${row.phone ?? ""}`
          },
          { key: "role", header: "Role", cell: (row) => <StatusBadge value={row.role} />, searchValue: (row) => row.role },
          { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} />, searchValue: (row) => row.status },
          { key: "assigned", header: "Assigned", cell: (row) => row.assignedCount },
          { key: "sold", header: "Sold", cell: (row) => row.soldCount },
          { key: "sales", header: "Sales", cell: (row) => money(row.salesAmount, settings.currency) },
          ...(canViewFinancials
            ? [
                { key: "profit", header: "Profit", cell: (row: EmployeeRow) => money(row.profit, settings.currency) } as const
              ]
            : []),
          { key: "advance", header: "Advance", cell: (row) => money(row.advanceBalance, settings.currency) },
          ...(canApproveEmployees
            ? [
                {
                  key: "approval",
                  header: "Approval",
                  cell: (row: EmployeeRow) =>
                    row.status === "inactive" ? (
                      <form action={approveEmployee}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                          Approve
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">Approved</span>
                    )
                } as const
              ]
            : []),
          ...(canApproveEmployees
            ? [
                {
                  key: "actions",
                  header: "Actions",
                  cell: (row: EmployeeRow) =>
                    row.id === currentProfile.id ? (
                      <span className="text-xs text-muted-foreground">Current user</span>
                    ) : (
                      <form action={deleteEmployee}>
                        <input type="hidden" name="id" value={row.id} />
                        <DeleteButton label="Delete employee" iconOnly />
                      </form>
                    )
                } as const
              ]
            : [])
        ]}
      />
    </>
  );
}
