"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { saveEmployee } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function EmployeeModal() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    startTransition(async () => {
      await saveEmployee(formData);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Add employee
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-hidden rounded-t-lg border bg-card shadow-2xl sm:max-w-2xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">Add employee</h2>
                <p className="text-sm text-muted-foreground">
                  Create the employee profile and login access in one step.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="grid max-h-[calc(92vh-65px)] gap-4 overflow-y-auto p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee_name">Name</Label>
                <Input id="employee_name" name="name" required placeholder="Rafi Seller" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_email">Email</Label>
                <Input id="employee_email" name="email" type="email" required placeholder="employee@example.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_phone">Phone number</Label>
                <Input id="employee_phone" name="phone" inputMode="tel" placeholder="+88017..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_password">Login password</Label>
                <Input
                  id="employee_password"
                  name="password"
                  type="password"
                  minLength={6}
                  required
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_join_date">Join date</Label>
                <Input id="employee_join_date" name="join_date" type="date" defaultValue={today} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_role">Role</Label>
                <Select id="employee_role" name="role" defaultValue="employee">
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_status">Status</Label>
                <Select id="employee_status" name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="employee_notes">Notes</Label>
                <Textarea id="employee_notes" name="notes" placeholder="Optional notes" />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Creating..." : "Create employee"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
