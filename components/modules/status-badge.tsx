import { Badge } from "@/components/ui/badge";

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const label = normalized === "pending" ? "Waiting payment" : value.replaceAll("_", " ");
  const variant =
    normalized.includes("sold") ||
    normalized.includes("paid") ||
    normalized.includes("active") ||
    normalized.includes("fresh")
      ? "success"
      : normalized.includes("pending") ||
          normalized.includes("partial") ||
          normalized.includes("assigned") ||
          normalized.includes("hold")
        ? "warning"
        : normalized.includes("problem") || normalized.includes("inactive")
          ? "destructive"
          : "secondary";

  return (
    <Badge variant={variant} className="capitalize">
      {label}
    </Badge>
  );
}
