"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, MailCheck } from "lucide-react";
import { markGmailUsed } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmPopover } from "@/components/ui/confirm-popover";

export function GmailActions({ id, email }: { id: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function copyEmail() {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function markUsed() {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      await markGmailUsed(formData);
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={copyEmail}>
        {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={pending}>
        <MailCheck className="h-4 w-4" />
        {pending ? "Saving..." : "Mark used"}
      </Button>
      <ConfirmPopover
        open={confirmOpen}
        title="Mark Gmail used?"
        description={`Mark ${email} as used? It will be removed from this list.`}
        confirmLabel="Mark used"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={markUsed}
      />
    </div>
  );
}
