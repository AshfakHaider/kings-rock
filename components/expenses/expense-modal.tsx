"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { saveExpense } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeToast } from "@/components/ui/notice-toast";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Expense, Profile, Settings } from "@/lib/types";

export function ExpenseModal({
  employees,
  currentProfile,
  categories,
  expense,
  trigger = "default",
  buttonLabel = "Add expense",
  modalTitle = "Add expense",
  modalDescription = "Record a business expense with payer and date.",
  defaultCategory = "other",
  categoryLabel = "Category"
}: {
  employees: Profile[];
  currentProfile: Profile;
  categories: Settings["expense_categories"];
  expense?: Expense;
  trigger?: "default" | "icon";
  buttonLabel?: string;
  modalTitle?: string;
  modalDescription?: string;
  defaultCategory?: string;
  categoryLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const canSelectPayer = currentProfile.role !== "employee";
  const isEdit = Boolean(expense);

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        await saveExpense(formData);
        setOpen(false);
        router.refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Record could not be saved.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size={trigger === "icon" ? "icon" : "default"}
        variant={trigger === "icon" ? "outline" : "default"}
        aria-label={isEdit ? "Edit record" : buttonLabel}
        title={isEdit ? "Edit record" : buttonLabel}
      >
        {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {trigger === "default" ? buttonLabel : null}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-hidden rounded-t-lg border bg-card shadow-2xl sm:max-w-2xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">{modalTitle}</h2>
                <p className="text-sm text-muted-foreground">{modalDescription}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="grid max-h-[calc(92vh-65px)] gap-4 overflow-y-auto p-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={expense?.id ?? ""} />

              <div className="space-y-2">
                <Label htmlFor="expense_title">Title</Label>
                <Input id="expense_title" name="title" required placeholder="Website fee" defaultValue={expense?.title ?? ""} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_amount">Amount</Label>
                <Input id="expense_amount" name="amount" type="number" min="0" required placeholder="1200" defaultValue={expense?.amount ?? ""} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_date">Expense date</Label>
                <Input id="expense_date" name="expense_date" type="date" defaultValue={expense?.expense_date ?? today} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_category">{categoryLabel}</Label>
                <Select id="expense_category" name="category" defaultValue={expense?.category ?? defaultCategory}>
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
                  <Select id="expense_paid_by" name="paid_by" defaultValue={expense?.paid_by ?? currentProfile.id}>
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
                <Textarea id="expense_notes" name="notes" placeholder="Optional notes" defaultValue={expense?.notes ?? ""} />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Saving..." : isEdit ? "Update" : "Save"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <NoticeToast message={notice} onClose={() => setNotice(null)} />
    </>
  );
}
