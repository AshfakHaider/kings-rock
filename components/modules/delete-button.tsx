"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmPopover } from "@/components/ui/confirm-popover";

export function DeleteButton({
  label = "Delete",
  iconOnly = false
}: {
  label?: string;
  iconOnly?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<HTMLFormElement | null>(null);

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? "icon" : "sm"}
        variant="destructive"
        aria-label={label}
        title={label}
        onClick={(event) => {
          setForm(event.currentTarget.form);
          setConfirmOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
        {iconOnly ? null : label}
      </Button>
      <ConfirmPopover
        open={confirmOpen}
        title="Delete record?"
        description={`Are you sure you want to ${label.toLowerCase()}? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          form?.requestSubmit();
        }}
      />
    </>
  );
}
