import { createAdminClient, hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Profile, StockAccount } from "@/lib/types";

export const STOCK_IMAGE_SIGNED_URL_EXPIRES_IN = 10 * 60;

function pathFromSupabaseStorageUrl(value: string, marker: string) {
  if (!value.includes(marker)) return null;
  const [, pathWithQuery] = value.split(marker);
  const pathname = pathWithQuery?.split("?")[0] ?? "";
  return pathname ? decodeURIComponent(pathname) : null;
}

export function stockImagePathFromReference(value: string | null | undefined) {
  const reference = value?.trim();
  if (!reference) return null;

  const publicPath = pathFromSupabaseStorageUrl(reference, "/storage/v1/object/public/stock-images/");
  if (publicPath) return publicPath;

  const signedPath = pathFromSupabaseStorageUrl(reference, "/storage/v1/object/sign/stock-images/");
  if (signedPath) return signedPath;

  if (!/^https?:\/\//i.test(reference)) {
    return reference.replace(/^\/+/, "");
  }

  return null;
}

export function stockImagePathsFromAccount(account: Pick<StockAccount, "image_path" | "image_paths" | "image_url" | "image_urls">) {
  const references = account.image_paths?.length
    ? account.image_paths
    : account.image_path
      ? [account.image_path]
      : account.image_urls?.length
        ? account.image_urls
        : account.image_url
          ? [account.image_url]
          : [];

  return references
    .map((reference) => stockImagePathFromReference(reference))
    .filter((path): path is string => Boolean(path));
}

export function canViewStockImages(_account: Pick<StockAccount, "id">, profile: Pick<Profile, "role" | "status">) {
  return profile.status === "active" && ["admin", "manager", "employee"].includes(profile.role);
}

export async function createSignedStockImageUrls(
  account: Pick<StockAccount, "id" | "image_path" | "image_paths" | "image_url" | "image_urls">,
  profile: Pick<Profile, "role" | "status">
) {
  if (!canViewStockImages(account, profile)) return [];

  if (!hasSupabaseEnv()) {
    return account.image_urls?.length ? account.image_urls : account.image_url ? [account.image_url] : [];
  }

  if (!hasSupabaseAdminEnv()) return [];

  const paths = stockImagePathsFromAccount(account).slice(0, 15);
  if (!paths.length) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("stock-images")
    .createSignedUrls(paths, STOCK_IMAGE_SIGNED_URL_EXPIRES_IN);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((item) => item.signedUrl)
    .filter((url): url is string => Boolean(url));
}
