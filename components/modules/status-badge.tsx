import { Badge } from "@/components/ui/badge";

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
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
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
