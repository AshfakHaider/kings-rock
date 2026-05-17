"use client";

import { useState } from "react";
import { Copy, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GmailSecretActions({ id }: { id: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal(action: "gmail_password_viewed" | "gmail_password_copied") {
    setLoading(true);
    const response = await fetch(`/api/gmail/${id}/reveal`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
    const payload = (await response.json()) as { password?: string };
    setLoading(false);
    if (!payload.password) return;
    setPassword(payload.password);
    if (action === "gmail_password_copied") {
      await navigator.clipboard.writeText(payload.password);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {password ? <code className="rounded bg-muted px-2 py-1 text-xs">{password}</code> : null}
      <Button type="button" size="sm" variant="outline" onClick={() => reveal("gmail_password_viewed")} disabled={loading}>
        <Eye className="h-4 w-4" />
        View
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => reveal("gmail_password_copied")} disabled={loading}>
        <Copy className="h-4 w-4" />
        Copy
      </Button>
    </div>
  );
}
