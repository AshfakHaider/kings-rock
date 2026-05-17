"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignStockAccount } from "@/app/actions";
import { ConfirmPopover } from "@/components/ui/confirm-popover";
import { Select } from "@/components/ui/select";
import type { Profile, StockAccount } from "@/lib/types";

export function AssignmentSelect({
  account,
  employees
}: {
  account: StockAccount;
  employees: Profile[];
}) {
  const [pending, startTransition] = useTransition();
  const [pendingEmployeeId, setPendingEmployeeId] = useState<string | null>(null);
  const router = useRouter();
  const assignableEmployees = employees;

  function submitAssignment(nextEmployeeId: string) {
    const formData = new FormData();
    formData.set("stock_account_id", account.id);
    formData.set("assigned_employee_id", nextEmployeeId);

    startTransition(async () => {
      await assignStockAccount(formData);
      setPendingEmployeeId(null);
      router.refresh();
    });
  }

  function changeAssignment(nextEmployeeId: string) {
    const currentEmployeeId = account.assigned_employee_id ?? "";
    if (nextEmployeeId === currentEmployeeId) return;

    const currentName = account.assigned_employee?.name;

    if (currentName && currentEmployeeId !== nextEmployeeId) {
      setPendingEmployeeId(nextEmployeeId);
      return;
    }

    submitAssignment(nextEmployeeId);
  }

  const pendingEmployeeName =
    assignableEmployees.find((employee) => employee.id === pendingEmployeeId)?.name ?? "Available";

  return (
    <>
      <Select
        aria-label="Assign account"
        value={account.assigned_employee_id ?? ""}
        onChange={(event) => changeAssignment(event.target.value)}
        disabled={pending || account.status === "sold"}
        className="min-w-40"
      >
        <option value="">Available</option>
        {assignableEmployees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
          </option>
        ))}
      </Select>
      <ConfirmPopover
        open={pendingEmployeeId !== null}
        title="Change assignment?"
        description={`${account.assigned_employee?.name} is working on this account. Are you sure you want to change it to ${pendingEmployeeName}?`}
        confirmLabel="Change"
        onCancel={() => setPendingEmployeeId(null)}
        onConfirm={() => {
          if (pendingEmployeeId !== null) submitAssignment(pendingEmployeeId);
        }}
      />
    </>
  );
}
