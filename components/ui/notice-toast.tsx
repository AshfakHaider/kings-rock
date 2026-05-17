"use client";

import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoticeToast({
  message,
  onClose
}: {
  message: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(timeout);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed right-4 top-4 z-[110] flex max-w-sm items-start gap-3 rounded-lg border bg-card p-3 shadow-2xl">
      <div className="mt-0.5 text-amber-600">
        <AlertCircle className="h-5 w-5" />
      </div>
      <p className="min-w-0 flex-1 text-sm leading-5">{message}</p>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
