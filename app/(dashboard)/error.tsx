"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-destructive/10 p-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">This page could not load</h2>
            <p className="text-sm text-muted-foreground">
              Try again. If it repeats, one dashboard section may need attention.
            </p>
          </div>
          <Button type="button" onClick={reset}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
