import { timingSafeEqual } from "crypto";
import { stockDisplayTitle } from "@/lib/stock-title";
import type { StockAccount, ZeusxStatus } from "@/lib/types";

export const ZEUSX_STATUS_VALUES: ZeusxStatus[] = ["pending", "posting", "posted", "failed"];
export const DEFAULT_ZEUSX_CATEGORY = "Accounts";
export const DEFAULT_ZEUSX_DELIVERY_METHOD = "Coordinated";
export const DEFAULT_ZEUSX_DELIVERY_DAYS = 0;
export const DEFAULT_ZEUSX_DELIVERY_HOURS = 1;

export type ZeusxWorkerListing = {
  id: string;
  stockAccountId: string;
  enabled: boolean;
  category: string;
  game: string;
  title: string;
  price: number;
  server: string;
  deliveryMethod: string;
  deliveryDays: number;
  deliveryHours: number;
  description: string;
  tags: string[];
  imageUrls: string[];
};

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}

function positiveInteger(value: number | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

export function defaultZeusxServer(gameName: string | null | undefined) {
  return /mobile\s*legends/i.test(gameName ?? "") ? "Global (MOONTON)" : "Global";
}

export function defaultZeusxDescription(account: Pick<StockAccount, "game_name" | "secret_code" | "account_title">) {
  const title = stockDisplayTitle(account.secret_code, account.account_title);
  return [
    title,
    "",
    "Premium gaming account from Kings Rock.",
    "Delivery is coordinated after payment confirmation.",
    "Extra screenshots are available on request."
  ].join("\n");
}

export function parseZeusxTags(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

export function formatZeusxTags(tags: string[] | null | undefined) {
  return (tags ?? []).filter(Boolean).join(", ");
}

export function buildZeusxWorkerListing(
  account: Pick<
    StockAccount,
    | "id"
    | "game_name"
    | "account_title"
    | "secret_code"
    | "selling_price"
    | "zeusx_category"
    | "zeusx_game"
    | "zeusx_server"
    | "zeusx_delivery_method"
    | "zeusx_delivery_days"
    | "zeusx_delivery_hours"
    | "zeusx_description"
    | "zeusx_tags"
  >,
  imageUrls: string[]
): ZeusxWorkerListing {
  return {
    id: account.id,
    stockAccountId: account.id,
    enabled: true,
    category: cleanText(account.zeusx_category) ?? DEFAULT_ZEUSX_CATEGORY,
    game: cleanText(account.zeusx_game) ?? account.game_name,
    title: stockDisplayTitle(account.secret_code, account.account_title),
    price: Number(account.selling_price ?? 0),
    server: cleanText(account.zeusx_server) ?? defaultZeusxServer(account.game_name),
    deliveryMethod: cleanText(account.zeusx_delivery_method) ?? DEFAULT_ZEUSX_DELIVERY_METHOD,
    deliveryDays: positiveInteger(account.zeusx_delivery_days, DEFAULT_ZEUSX_DELIVERY_DAYS),
    deliveryHours: positiveInteger(account.zeusx_delivery_hours, DEFAULT_ZEUSX_DELIVERY_HOURS),
    description: cleanText(account.zeusx_description) ?? defaultZeusxDescription(account),
    tags: (account.zeusx_tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    imageUrls
  };
}

export function verifyZeusxWorkerRequest(request: Request) {
  const configuredToken = process.env.ZEUSX_WORKER_TOKEN?.trim();
  if (!configuredToken) {
    return { ok: false as const, status: 503, message: "ZEUSX_WORKER_TOKEN is not configured." };
  }

  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerToken = request.headers.get("x-zeusx-worker-token")?.trim();
  const suppliedToken = bearerToken || headerToken || "";

  const configuredBuffer = Buffer.from(configuredToken);
  const suppliedBuffer = Buffer.from(suppliedToken);
  const matches =
    configuredBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(configuredBuffer, suppliedBuffer);

  if (!matches) {
    return { ok: false as const, status: 401, message: "Invalid ZeusX worker token." };
  }

  return { ok: true as const };
}
