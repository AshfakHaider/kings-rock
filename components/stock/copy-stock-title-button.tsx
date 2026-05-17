"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyStockTitleButton({
  title,
  className,
  showLabel = false
}: {
  title: string;
  className?: string;
  showLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyTitle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    await navigator.clipboard.writeText(title);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <Button
      type="button"
      size={showLabel ? "sm" : "icon"}
      variant="outline"
      className={cn(showLabel ? "" : "h-8 w-8 shrink-0", className)}
      onClick={copyTitle}
      aria-label="Copy stock account title"
      title="Copy stock account title"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {showLabel ? <span>{copied ? "Copied" : "Copy title"}</span> : <span className="sr-only">Copy title</span>}
    </Button>
  );
}
