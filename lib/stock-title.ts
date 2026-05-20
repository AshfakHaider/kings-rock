export function cleanSecretCode(code: string | null | undefined) {
  const cleaned = code?.trim().replace(/\s+/g, " ");
  return cleaned?.length ? cleaned : null;
}

export function stripSecretCodeFromTitle(title: string | null | undefined, code: string | null | undefined) {
  const cleanedTitle = title?.trim().replace(/\s+/g, " ") ?? "";
  const cleanedCode = cleanSecretCode(code);

  if (!cleanedTitle || !cleanedCode) return cleanedTitle;

  const escapedCode = cleanedCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanedTitle.replace(new RegExp(`^${escapedCode}\\s*[-:|/]*\\s*`, "i"), "").trim() || cleanedTitle;
}

export function stockDisplayTitle(code: string | null | undefined, title: string | null | undefined) {
  const cleanedCode = cleanSecretCode(code);
  const cleanedTitle = title?.trim().replace(/\s+/g, " ") ?? "";

  if (!cleanedCode) return cleanedTitle;
  return `${cleanedCode} ${stripSecretCodeFromTitle(cleanedTitle, cleanedCode)}`.trim();
}
