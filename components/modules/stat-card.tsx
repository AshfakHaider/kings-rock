import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  icon: Icon,
  tone = "default"
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-teal-50 text-teal-700";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="relative flex min-w-0 items-center justify-between gap-3 p-4">
        <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-primary/5" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 break-words text-xl font-semibold leading-tight sm:text-2xl">{value}</p>
        </div>
        <div className={`shrink-0 rounded-md p-2 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
