"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { saveExpense } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Profile, Settings } from "@/lib/types";

export function ExpenseModal({
  employees,
  currentProfile,
  categories
}: {
  employees: Profile[];
  currentProfile: Profile;
  categories: Settings["expense_categories"];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const canSelectPayer = currentProfile.role !== "employee";

  function submit(formData: FormData) {
    startTransition(async () => {
      await saveExpense(formData);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add expense
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-hidden rounded-t-lg border bg-card shadow-2xl sm:max-w-2xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">Add expense</h2>
                <p className="text-sm text-muted-foreground">Record a business expense with payer and date.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="grid max-h-[calc(92vh-65px)] gap-4 overflow-y-auto p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense_title">Title</Label>
                <Input id="expense_title" name="title" required placeholder="Website fee" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_amount">Amount</Label>
                <Input id="expense_amount" name="amount" type="number" min="0" required placeholder="1200" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_date">Expense date</Label>
                <Input id="expense_date" name="expense_date" type="date" defaultValue={today} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_category">Category</Label>
                <Select id="expense_category" name="category" defaultValue="other">
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </div>

              {canSelectPayer ? (
                <div className="space-y-2">
                  <Label htmlFor="expense_paid_by">Paid by</Label>
                  <Select id="expense_paid_by" name="paid_by" defaultValue={currentProfile.id}>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <input type="hidden" name="paid_by" value={currentProfile.id} />
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="expense_notes">Notes</Label>
                <Textarea id="expense_notes" name="notes" placeholder="Optional notes" />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Saving..." : "Save expense"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
