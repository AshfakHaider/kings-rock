"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { addStockAccountAssignment, removeStockAccountAssignment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NoticeToast } from "@/components/ui/notice-toast";
import { Select } from "@/components/ui/select";
import type { Profile, StockAccount } from "@/lib/types";

function assignedProfiles(account: StockAccount) {
  const assigned: Array<Pick<Profile, "id" | "name" | "email">> = [];
  const seen = new Set<string>();

  if (account.assigned_employee_id && account.assigned_employee) {
    assigned.push(account.assigned_employee);
    seen.add(account.assigned_employee_id);
  }

  for (const assignment of account.assignments ?? []) {
    if (!assignment.employee || seen.has(assignment.employee_id)) continue;
    assigned.push(assignment.employee);
    seen.add(assignment.employee_id);
  }

  return assigned;
}

export function AssignmentSelect({
  account,
  employees,
  currentProfile
}: {
  account: StockAccount;
  employees: Profile[];
  currentProfile: Profile;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const canManageAll = currentProfile.role === "admin" || currentProfile.role === "manager";
  const assigned = useMemo(() => assignedProfiles(account), [account]);
  const assignedIds = new Set(assigned.map((employee) => employee.id));
  const isCurrentAssigned = assignedIds.has(currentProfile.id);
  const availableEmployees = employees.filter((employee) => !assignedIds.has(employee.id));
  const shouldShowEmployeeSelect = !assigned.length || showAddEmployee;
  const disabled = pending || account.status === "sold";

  function runAssignment(employeeId: string, mode: "add" | "remove") {
    if (!employeeId || disabled) return;

    const formData = new FormData();
    formData.set("stock_account_id", account.id);
    formData.set("employee_id", employeeId);

    startTransition(async () => {
      try {
        const result =
          mode === "add"
            ? await addStockAccountAssignment(formData)
            : await removeStockAccountAssignment(formData);

        if (!result.ok) {
          setNotice(result.message ?? "Assignment could not be updated.");
          return;
        }

        if (mode === "add") {
          setSelectedEmployeeId("");
          setShowAddEmployee(false);
        }
        if (result.message) setNotice(result.message);
        router.refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Assignment could not be updated.");
      }
    });
  }

  return (
    <div className="min-w-52 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {assigned.length ? (
          assigned.map((employee) => {
            const canRemove = canManageAll || employee.id === currentProfile.id;
            return (
              <span
                key={employee.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-200"
                title={employee.email}
              >
                <span className="truncate">{employee.name}</span>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => runAssignment(employee.id, "remove")}
                    disabled={disabled}
                    className="rounded-full p-0.5 text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
                    aria-label={`Remove ${employee.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            );
          })
        ) : (
          <span className="rounded-full border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            Available
          </span>
        )}
      </div>

      {canManageAll ? (
        <div className="flex min-w-0 gap-2">
          {shouldShowEmployeeSelect ? (
            <Select
              aria-label="Add assigned employee"
              value={selectedEmployeeId}
              onChange={(event) => {
                const employeeId = event.currentTarget.value;
                setSelectedEmployeeId(employeeId);
                if (employeeId) runAssignment(employeeId, "add");
              }}
              disabled={disabled || availableEmployees.length === 0}
              className="h-9 min-w-0 text-xs"
            >
              <option value="">{availableEmployees.length ? "Add employee" : "All assigned"}</option>
              {availableEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          ) : null}
          {assigned.length ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={disabled || availableEmployees.length === 0}
              onClick={() => setShowAddEmployee((value) => !value)}
              aria-label={showAddEmployee ? "Hide employee assignment" : "Add another employee"}
            >
              <Plus className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant={isCurrentAssigned ? "outline" : "secondary"}
          disabled={disabled}
          onClick={() => runAssignment(currentProfile.id, isCurrentAssigned ? "remove" : "add")}
          className="w-full"
        >
          {isCurrentAssigned ? "Remove me" : "Assign to me"}
        </Button>
      )}

      <NoticeToast message={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
