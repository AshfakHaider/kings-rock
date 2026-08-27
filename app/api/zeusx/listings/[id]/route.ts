import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";
import { verifyZeusxWorkerRequest, ZEUSX_STATUS_VALUES } from "@/lib/zeusx";
import type { ZeusxStatus } from "@/lib/types";

export const runtime = "nodejs";

type StatusUpdateBody = {
  status?: string;
  listingUrl?: string | null;
  error?: string | null;
};

async function parseBody(request: Request): Promise<StatusUpdateBody> {
  try {
    return (await request.json()) as StatusUpdateBody;
  } catch {
    return {};
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = verifyZeusxWorkerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: "Supabase admin environment is not configured." }, { status: 503 });
  }

  const { id } = await params;
  const body = await parseBody(request);
  const status = body.status as ZeusxStatus | undefined;

  if (!status || !ZEUSX_STATUS_VALUES.includes(status)) {
    return NextResponse.json({ error: "Invalid ZeusX status." }, { status: 400 });
  }

  const payload = {
    zeusx_status: status,
    zeusx_listing_url: status === "posted" ? body.listingUrl ?? null : undefined,
    zeusx_posted_at: status === "posted" ? new Date().toISOString() : undefined,
    zeusx_error: status === "failed" ? (body.error ?? "ZeusX posting failed.") : null
  };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_accounts")
    .update(payload)
    .eq("id", id)
    .select("id,zeusx_status,zeusx_listing_url,zeusx_posted_at,zeusx_error")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ listing: data });
}
