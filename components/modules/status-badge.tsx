import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const toneClasses = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  pink: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  orange: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  lime: "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300"
} as const;

const valueTones: Record<string, keyof typeof toneClasses> = {
  active: "emerald",
  available: "emerald",
  fresh: "emerald",
  paid: "emerald",
  completed: "emerald",
  settled: "emerald",
  "highest bonus": "emerald",
  assigned: "sky",
  employee: "cyan",
  account_purchase: "blue",
  "bonus candidate": "violet",
  manager: "indigo",
  employee_payment: "indigo",
  admin: "purple",
  money_returned: "purple",
  ads: "pink",
  partial: "amber",
  pending: "amber",
  hold: "amber",
  open: "amber",
  "review tasks": "amber",
  money_given: "emerald",
  adjustment: "orange",
  problem: "red",
  inactive: "red",
  "review": "red",
  scam_account: "red",
  refund_account: "sky",
  sold: "violet",
  used: "violet",
  gmail_purchase: "cyan",
  website_fee: "blue",
  "small bonus": "lime",
  "no bonus": "slate",
  other: "slate"
};

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

function labelFor(value: string) {
  const normalized = normalize(value);
  if (normalized === "pending") return "Waiting payment";
  return value.replaceAll("_", " ");
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = normalize(value);
  const tone = valueTones[normalized] ?? valueTones[value.toLowerCase().trim()] ?? "slate";

  return (
    <Badge variant="outline" className={cn("capitalize shadow-sm", toneClasses[tone])}>
      {labelFor(value)}
    </Badge>
  );
}
