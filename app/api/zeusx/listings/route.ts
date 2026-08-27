import { NextResponse } from "next/server";
import { buildZeusxWorkerListing, verifyZeusxWorkerRequest } from "@/lib/zeusx";
import { stockImagePathsFromAccount } from "@/lib/stock-images";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";
import type { StockAccount } from "@/lib/types";

export const runtime = "nodejs";

const ZEUSX_STOCK_SELECT = [
  "id",
  "game_name",
  "account_title",
  "selling_price",
  "image_url",
  "image_urls",
  "image_path",
  "image_paths",
  "secret_code",
  "status",
  "zeusx_category",
  "zeusx_game",
  "zeusx_server",
  "zeusx_delivery_method",
  "zeusx_delivery_days",
  "zeusx_delivery_hours",
  "zeusx_description",
  "zeusx_tags",
  "updated_at"
].join(",");

function safeLimit(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("limit") ?? 5);
  if (!Number.isFinite(value)) return 5;
  return Math.min(Math.max(Math.trunc(value), 1), 20);
}

async function signedImageUrls(account: Pick<StockAccount, "image_url" | "image_urls" | "image_path" | "image_paths">) {
  const paths = stockImagePathsFromAccount(account).slice(0, 15);
  const fallbackUrls = account.image_urls?.length ? account.image_urls : account.image_url ? [account.image_url] : [];

  if (!paths.length) return fallbackUrls;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("stock-images")
    .createSignedUrls(paths, 60 * 60);

  if (error) throw new Error(error.message);

  const signedUrls = (data ?? [])
    .map((item) => item.signedUrl)
    .filter((url): url is string => Boolean(url));

  return signedUrls.length ? signedUrls : fallbackUrls;
}

export async function GET(request: Request) {
  const auth = verifyZeusxWorkerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: "Supabase admin environment is not configured." }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_accounts")
    .select(ZEUSX_STOCK_SELECT)
    .eq("zeusx_enabled", true)
    .in("zeusx_status", ["pending", "failed"])
    .neq("status", "sold")
    .order("updated_at", { ascending: true })
    .limit(safeLimit(request));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const listings = await Promise.all(
    ((data as unknown as StockAccount[]) ?? []).map(async (account) =>
      buildZeusxWorkerListing(account, await signedImageUrls(account))
    )
  );

  return NextResponse.json(
    { listings },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
