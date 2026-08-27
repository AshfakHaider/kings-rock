import { NextResponse } from "next/server";
import { createSignedStockImageUrls } from "@/lib/stock-images";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

const PROFILE_SELECT = "id,auth_user_id,name,phone,email,role,status,join_date,notes,created_at";
const STOCK_IMAGE_SELECT = "id,image_url,image_urls,image_path,image_paths";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("auth_user_id", user.id)
    .single();
  const profile = profileData as Profile | null;

  if (!profile || profile.status !== "active") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: account, error } = await supabase
    .from("stock_accounts")
    .select(STOCK_IMAGE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!account) {
    return NextResponse.json({ error: "Stock account not found." }, { status: 404 });
  }

  const images = await createSignedStockImageUrls(account, profile);

  return NextResponse.json(
    { images },
    {
      headers: {
        "Cache-Control": "private, no-store"
      }
    }
  );
}
