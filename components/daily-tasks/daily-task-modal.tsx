"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus, X } from "lucide-react";
import { saveDailyTask } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function DailyTaskModal() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    startTransition(async () => {
      await saveDailyTask(formData);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <ClipboardPlus className="h-4 w-4" />
        Add daily task
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-hidden rounded-t-lg border bg-card shadow-2xl sm:max-w-xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">Add daily task</h2>
                <p className="text-sm text-muted-foreground">Assign one daily task to every active employee.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="grid gap-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="task_title">Task title</Label>
                <Input id="task_title" name="title" required placeholder="Post 10 accounts on Facebook" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_date">Task date</Label>
                <Input id="task_date" name="task_date" type="date" required defaultValue={today} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_description">Details</Label>
                <Textarea id="task_description" name="description" placeholder="Optional task instructions" />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Saving..." : "Assign task"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
