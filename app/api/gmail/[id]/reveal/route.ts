import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Secret reveal is not configured." }, { status: 400 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action =
    body.action === "gmail_password_copied"
      ? "gmail_password_copied"
      : "gmail_password_viewed";
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data, error } = await service
    .from("gmail_inventory")
    .select("encrypted_password")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Gmail account not found." }, { status: 404 });
  }

  await supabase.rpc("log_activity", {
    p_action: action,
    p_table_name: "gmail_password",
    p_record_id: id,
    p_old_data: null,
    p_new_data: { gmail_id: id }
  });

  return NextResponse.json({ password: decryptSecret(data.encrypted_password) });
}
