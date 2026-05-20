import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DEFAULT_CURRENCY = "USD";

export function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized || normalized === "BDT") return DEFAULT_CURRENCY;
  return normalized;
}

export function money(value: number | null | undefined, currency = DEFAULT_CURRENCY) {
  const amount = Number(value ?? 0);
  const normalizedCurrency = normalizeCurrency(currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

export function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
