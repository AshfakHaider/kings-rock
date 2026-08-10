"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, X } from "lucide-react";
import { saveSale } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeToast } from "@/components/ui/notice-toast";
import { Select } from "@/components/ui/select";
import { stockDisplayTitle } from "@/lib/stock-title";
import type { Profile, StockAccount } from "@/lib/types";

export function MarkSoldModal({
  account,
  employees
}: {
  account: StockAccount;
  employees: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const eligibleEmployees = useMemo(() => {
    const assignedIds = new Set<string>();
    if (account.assigned_employee_id) assignedIds.add(account.assigned_employee_id);
    for (const assignment of account.assignments ?? []) {
      assignedIds.add(assignment.employee_id);
    }
    const assignedEmployees = employees.filter((employee) => assignedIds.has(employee.id));
    return assignedEmployees.length ? assignedEmployees : employees;
  }, [account, employees]);

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        await saveSale(formData);
        setOpen(false);
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sale could not be saved.";
        const staleAction = message.includes("was not found on the server") || message.includes("UnrecognizedActionError");
        setNotice(staleAction ? "The app was updated. Refreshing, then please try again." : message);
        if (staleAction) {
          window.setTimeout(() => window.location.reload(), 900);
        }
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <CircleDollarSign className="h-4 w-4" />
        Mark sold
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-lg border bg-card shadow-2xl sm:max-w-md sm:rounded-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">Mark as sold</h2>
                <p className="text-sm text-muted-foreground">{stockDisplayTitle(account.secret_code, account.account_title)}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="space-y-4 p-4">
              <input type="hidden" name="stock_account_id" value={account.id} />
              <input type="hidden" name="payment_status" value="pending" />

              <div className="space-y-2">
                <Label htmlFor={`sold_amount_${account.id}`}>Selling amount</Label>
                <Input
                  id={`sold_amount_${account.id}`}
                  name="sold_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  required
                  defaultValue={account.selling_price ?? ""}
                  placeholder="16800"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`sold_source_${account.id}`}>Source</Label>
                <Input
                  id={`sold_source_${account.id}`}
                  name="sold_source_website"
                  required
                  placeholder="Facebook, G2G, Discord..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`employee_${account.id}`}>Sold by employee</Label>
                <Select
                  id={`employee_${account.id}`}
                  name="employee_id"
                  required
                  defaultValue={eligibleEmployees[0]?.id ?? ""}
                >
                  {eligibleEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`sold_date_${account.id}`}>Sold date</Label>
                <Input
                  id={`sold_date_${account.id}`}
                  name="sold_date"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Saving..." : "Move to waiting payment"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <NoticeToast message={notice} onClose={() => setNotice(null)} />
    </>
  );
}
