const SOURCE_ALIASES: Record<string, string> = {
  eldorado: "Eldorado",
  eilderado: "Eldorado",
  funpay: "FunPay",
  g2g: "G2G",
  igetems: "Igitems",
  igeteams: "Igitems",
  igitems: "Igitems",
  igiteams: "Igitems",
  igitemscom: "Igitems",
  igtems: "Igitems",
  igteams: "Igitems",
  playerauction: "PlayerAuctions",
  playerauctions: "PlayerAuctions",
  u7buy: "U7BUY"
};

export type SourceSummaryRow = {
  source: string;
  soldCount: number;
  totalSales: number;
  profit: number;
};

export function saleSourceKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function titleCaseSource(value: string) {
  return value
    .split(/\s+/)
    .map((word) => (word ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}` : ""))
    .join(" ");
}

export function canonicalSaleSource(value: string | null | undefined) {
  const cleaned = (value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "Unknown";

  const key = saleSourceKey(cleaned);
  return SOURCE_ALIASES[key] ?? titleCaseSource(cleaned);
}

export function canonicalSaleSourceKey(value: string | null | undefined) {
  return saleSourceKey(canonicalSaleSource(value));
}

export function uniqueSaleSourceOptions(values: Array<string | null | undefined>) {
  const options = new Map<string, string>();

  for (const value of values) {
    const source = canonicalSaleSource(value);
    if (source === "Unknown") continue;
    options.set(canonicalSaleSourceKey(source), source);
  }

  return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
}

export function mergeSourceSummaryRows(rows: SourceSummaryRow[]) {
  const buckets = new Map<string, SourceSummaryRow>();

  for (const row of rows) {
    const source = canonicalSaleSource(row.source);
    const key = canonicalSaleSourceKey(source);
    const item = buckets.get(key) ?? {
      source,
      soldCount: 0,
      totalSales: 0,
      profit: 0
    };

    item.soldCount += Number(row.soldCount);
    item.totalSales += Number(row.totalSales);
    item.profit += Number(row.profit);
    buckets.set(key, item);
  }

  return Array.from(buckets.values()).sort((a, b) => b.soldCount - a.soldCount || b.totalSales - a.totalSales);
}
