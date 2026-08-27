export function cleanSecretCode(code: string | null | undefined) {
  const cleaned = cleanStockText(code);
  return cleaned?.length ? cleaned : null;
}

export function cleanStockText(value: string | null | undefined) {
  const cleaned = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!cleaned) return "";

  const midpoint = cleaned.length / 2;
  if (Number.isInteger(midpoint)) {
    const first = cleaned.slice(0, midpoint).trim();
    const second = cleaned.slice(midpoint).trim();
    if (first && first.toLowerCase() === second.toLowerCase()) return first;
  }

  const words = cleaned.split(" ");
  if (words.length > 1 && words.length % 2 === 0) {
    const firstHalf = words.slice(0, words.length / 2).join(" ");
    const secondHalf = words.slice(words.length / 2).join(" ");
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) return firstHalf;
  }

  return cleaned;
}

export function stripSecretCodeFromTitle(title: string | null | undefined, code: string | null | undefined) {
  const cleanedTitle = cleanStockText(title);
  const cleanedCode = cleanSecretCode(code);

  if (!cleanedTitle || !cleanedCode) return cleanedTitle;

  const escapedCode = cleanedCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titleSeparatorPattern = ["\\-", ":", "\\|", "\\/"].join("");
  return cleanedTitle.replace(new RegExp(`^${escapedCode}\\s*[${titleSeparatorPattern}]*\\s*`, "i"), "").trim() || cleanedTitle;
}

export function stockDisplayTitle(code: string | null | undefined, title: string | null | undefined) {
  const cleanedCode = cleanSecretCode(code);
  const cleanedTitle = title?.trim().replace(/\s+/g, " ") ?? "";

  if (!cleanedCode) return cleanedTitle;
  return `${cleanedCode} ${stripSecretCodeFromTitle(cleanedTitle, cleanedCode)}`.trim();
}
