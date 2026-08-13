"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient, hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { getCurrentProfile } from "@/lib/data";
import { canonicalSaleSource, canonicalSaleSourceKey, uniqueSaleSourceOptions } from "@/lib/sale-sources";
import { cleanSecretCode, cleanStockText, stripSecretCodeFromTitle } from "@/lib/stock-title";
import {
  addDemoSale,
  addDemoDailyTaskCompletion,
  deleteDemoDailyTask,
  deleteDemoExpense,
  deleteDemoProfile,
  getDemoDailyTasks,
  getDemoGmailAccounts,
  getDemoExpenses,
  getDemoProfiles,
  getDemoSoldAccounts,
  getDemoStockAccounts,
  upsertDemoDailyTask,
  upsertDemoExpense,
  upsertDemoProfile,
  upsertDemoGmailAccount,
  upsertDemoSale,
  upsertDemoStockAccount
} from "@/lib/demo-store";
import type { DailyTask, DailyTaskCompletion, Expense, GmailAccount, Profile, SoldAccount, StockAccount } from "@/lib/types";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length ? value : null;
}

function number(formData: FormData, key: string) {
  return Number(formData.get(key) ?? 0);
}

function optionalNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  return value ? Number(value) : null;
}

const STOCK_ACCOUNT_SELECT =
  "id,game_name,account_title,account_details,purchase_source,buying_price,selling_price,image_url,image_urls,secret_code,purchase_date,status,assigned_employee_id,gmail_id,notes,created_by,created_at,updated_at";
const DAILY_TASK_SELECT = "id,title,description,task_date,created_by,created_at";
const SOLD_ACCOUNT_SELECT =
  "id,stock_account_id,employee_id,sold_amount,sold_source_website,buyer_contact,payment_status,payment_method,payment_received_date,sold_date,notes,created_at";
const GMAIL_SELECT = "id,email,recovery_info,status,used_for_stock_account_id,date_added,date_used,notes,created_at";
const PROFILE_SELECT = "id,auth_user_id,name,phone,email,role,status,join_date,notes,created_at";
const ADVANCE_SELECT = "id,employee_id,amount_given,date_given,purpose,payment_method,status,notes,created_by,created_at";
const ADVANCE_TRANSACTION_SELECT = "id,advance_id,employee_id,type,amount,stock_account_id,transaction_date,notes,created_by,created_at";
const EXPENSE_SELECT = "id,title,category,amount,expense_date,paid_by,notes,created_at";
const DEFAULT_SETTINGS_PAYLOAD = {
  business_name: "Kings Rock",
  currency: "USD",
  game_categories: ["Mobile Legends", "Clash of Clans"],
  sale_source_websites: ["Facebook", "PlayerAuctions", "G2G", "Discord", "FunPay", "Eldorado", "Igitems", "U7BUY"],
  expense_categories: ["gmail_purchase", "ads", "website_fee", "employee_payment", "scam_account", "refund_account", "other"],
  employee_permissions: {
    can_view_profit: false,
    can_view_buying_price: false
  }
};

type AssignmentActionResult = {
  ok: boolean;
  message?: string;
};

function saleSourceFromFormData(formData: FormData) {
  const selectedSource = text(formData, "sold_source_website");
  const customSource = text(formData, "sold_source_website_custom");
  return canonicalSaleSource(selectedSource === "__new" ? customSource : selectedSource);
}

async function rememberSaleSourceWebsite(source: string) {
  if (!hasSupabaseEnv() || source === "Unknown") return;

  const supabase = hasSupabaseAdminEnv() ? createAdminClient() : await createClient();
  const { data: settings, error: fetchError } = await supabase
    .from("settings")
    .select("id,sale_source_websites")
    .limit(1)
    .maybeSingle();

  if (fetchError) return;

  if (!settings) {
    await supabase
      .from("settings")
      .insert({
        ...DEFAULT_SETTINGS_PAYLOAD,
        sale_source_websites: uniqueSaleSourceOptions([...DEFAULT_SETTINGS_PAYLOAD.sale_source_websites, source])
      });
    return;
  }

  const existingSources = Array.isArray(settings.sale_source_websites)
    ? (settings.sale_source_websites as string[])
    : [];
  const nextSources = uniqueSaleSourceOptions([...existingSources, source]);
  const existingKeySet = new Set(existingSources.map(canonicalSaleSourceKey));
  if (existingKeySet.has(canonicalSaleSourceKey(source)) && nextSources.length === existingSources.length) return;

  await supabase
    .from("settings")
    .update({ sale_source_websites: nextSources })
    .eq("id", settings.id);
}

async function uploadStockImages(formData: FormData) {
  const files = getStockImageFiles(formData);

  if (files.length === 0) return [];

  const supabase = await createClient();
  const urls: string[] = [];

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${new Date().getFullYear()}/${randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from("stock-images")
      .upload(path, file, { upsert: false, contentType: file.type });

    if (error) {
      throw new Error(`Image upload failed: ${error.message}`);
    }

    const { data } = supabase.storage.from("stock-images").getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

async function uploadDailyTaskScreenshots(formData: FormData) {
  const files = getDailyTaskScreenshotFiles(formData);
  const supabase = await createClient();
  const urls: string[] = [];

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${new Date().getFullYear()}/${randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from("task-screenshots")
      .upload(path, file, { upsert: false, contentType: file.type });

    if (error) {
      throw new Error(`Screenshot upload failed: ${error.message}`);
    }

    const { data } = supabase.storage.from("task-screenshots").getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

function getStockImageFiles(formData: FormData) {
  const files = formData
    .getAll("images")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length > 15) {
    throw new Error("You can upload a maximum of 15 images per account.");
  }

  if (files.some((file) => file.size > 2 * 1024 * 1024)) {
    throw new Error("Each image must be 2 MB or smaller after optimization.");
  }

  return files;
}

function getDailyTaskScreenshotFiles(formData: FormData) {
  const files = formData
    .getAll("screenshots")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length === 0) {
    const legacyFile = formData.get("screenshot");
    if (legacyFile instanceof File && legacyFile.size > 0) files.push(legacyFile);
  }

  if (files.length === 0) {
    throw new Error("At least one screenshot is required to complete the task.");
  }

  if (files.length > 15) {
    throw new Error("You can upload maximum 15 screenshots per task.");
  }

  if (files.some((file) => !file.type.startsWith("image/"))) {
    throw new Error("Screenshots must be image files.");
  }

  if (files.some((file) => file.size > 2 * 1024 * 1024)) {
    throw new Error("Each screenshot must be 2 MB or smaller after optimization.");
  }

  return files;
}

async function getDemoImageUrls(formData: FormData) {
  const files = getStockImageFiles(formData);
  return saveDemoFiles(files, "stock");
}

async function getDemoScreenshotUrls(formData: FormData) {
  const files = getDailyTaskScreenshotFiles(formData);
  return saveDemoFiles(files, "tasks");
}

async function saveDemoFiles(files: File[], folder: "stock" | "tasks") {
  const urls: string[] = [];
  const year = new Date().getFullYear();
  const uploadDir = path.join(process.cwd(), "public", "demo-uploads", folder, String(year));
  await mkdir(uploadDir, { recursive: true });

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const filename = `${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);
    urls.push(`/demo-uploads/${folder}/${year}/${filename}`);
  }

  return urls;
}

async function logActivity(
  action: string,
  tableName: string,
  recordId: string | null,
  oldData: unknown,
  newData: unknown
) {
  if (!hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("log_activity", {
    p_action: action,
    p_table_name: tableName,
    p_record_id: recordId,
    p_old_data: oldData,
    p_new_data: newData
  });
}

function normalizedStockIdentity(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function revalidateStockAssignmentPaths(stockAccountId: string) {
  revalidatePath("/stock-accounts");
  revalidatePath("/sales");
  revalidatePath(`/stock-accounts/${stockAccountId}`);
  revalidatePath("/employees");
  revalidatePath("/monthly-performance");
  revalidatePath("/");
}

function stockAssignmentSchemaMessage(message: string) {
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes("stock_account_assignments") ||
    (lowerMessage.includes("function") && lowerMessage.includes("stock_account_assignment")) ||
    lowerMessage.includes("schema cache")
  ) {
    return "Multiple assignment migration is not applied correctly on the live database. Please run supabase/migrations/20260810102909_multiple_stock_assignments.sql again.";
  }

  return message;
}

function isStockAssignmentSchemaError(message: string) {
  return stockAssignmentSchemaMessage(message) !== message;
}

async function insertActivityLogWithAdmin(
  userId: string,
  action: string,
  tableName: string,
  recordId: string | null,
  oldData: unknown,
  newData: unknown
) {
  if (!hasSupabaseAdminEnv()) return;

  try {
    const adminSupabase = createAdminClient();
    await adminSupabase.from("activity_logs").insert({
      user_id: userId,
      action,
      table_name: tableName,
      record_id: recordId,
      old_data: oldData,
      new_data: newData
    });
  } catch {
    // Activity logging should never break the business action.
  }
}

async function addStockAccountAssignmentWithAdmin(
  profile: Profile,
  stockAccountId: string,
  employeeId: string
) {
  if (!hasSupabaseAdminEnv()) return false;

  const adminSupabase = createAdminClient();

  if (profile.role === "employee" && employeeId !== profile.id) {
    throw new Error("Employees can only assign accounts to themselves.");
  }

  const { data: employee, error: employeeError } = await adminSupabase
    .from("profiles")
    .select("id,role,status")
    .eq("id", employeeId)
    .single();

  if (employeeError) throw new Error(employeeError.message);
  if (!employee || employee.role === "admin" || employee.status !== "active") {
    throw new Error("Employee is not available for assignment.");
  }

  const { data: account, error: accountError } = await adminSupabase
    .from("stock_accounts")
    .select("id,status,assigned_employee_id")
    .eq("id", stockAccountId)
    .single();

  if (accountError) throw new Error(accountError.message);
  if (!account || account.status === "sold") {
    throw new Error("Stock account not found or already sold.");
  }

  const { data: savedAssignment, error: assignmentError } = await adminSupabase
    .from("stock_account_assignments")
    .upsert(
      {
        stock_account_id: stockAccountId,
        employee_id: employeeId,
        assigned_by: profile.id
      },
      { onConflict: "stock_account_id,employee_id" }
    )
    .select("id,stock_account_id,employee_id,assigned_by,created_at")
    .single();

  if (assignmentError) throw new Error(stockAssignmentSchemaMessage(assignmentError.message));

  if (!account.assigned_employee_id) {
    const { error: legacyStatusError } = await adminSupabase
      .from("stock_accounts")
      .update({
        assigned_employee_id: employeeId,
        status: "assigned"
      })
      .eq("id", stockAccountId)
      .is("assigned_employee_id", null)
      .neq("status", "sold");

    if (legacyStatusError) throw new Error(legacyStatusError.message);
  } else if (account.status === "available") {
    const { error: statusError } = await adminSupabase
      .from("stock_accounts")
      .update({ status: "assigned" })
      .eq("id", stockAccountId)
      .eq("status", "available");

    if (statusError) throw new Error(statusError.message);
  }

  await insertActivityLogWithAdmin(
    profile.id,
    "stock_assignment_added",
    "stock_account_assignments",
    savedAssignment?.id ?? null,
    null,
    savedAssignment
  );

  return true;
}

async function addLegacyStockAssignmentWithAdmin(
  profile: Profile,
  stockAccountId: string,
  employeeId: string
) {
  if (!hasSupabaseAdminEnv()) return false;

  const adminSupabase = createAdminClient();

  if (profile.role === "employee" && employeeId !== profile.id) {
    throw new Error("Employees can only assign accounts to themselves.");
  }

  const { data: employee, error: employeeError } = await adminSupabase
    .from("profiles")
    .select("id,role,status")
    .eq("id", employeeId)
    .single();

  if (employeeError) throw new Error(employeeError.message);
  if (!employee || employee.role === "admin" || employee.status !== "active") {
    throw new Error("Employee is not available for assignment.");
  }

  const { data: account, error: accountError } = await adminSupabase
    .from("stock_accounts")
    .select("id,status,assigned_employee_id")
    .eq("id", stockAccountId)
    .single();

  if (accountError) throw new Error(accountError.message);
  if (!account || account.status === "sold") {
    throw new Error("Stock account not found or already sold.");
  }

  if (account.assigned_employee_id && account.assigned_employee_id !== employeeId) {
    throw new Error("Live database is still using single assignment. Run the multiple assignment migration before adding a second employee.");
  }

  const { error: updateError } = await adminSupabase
    .from("stock_accounts")
    .update({
      assigned_employee_id: employeeId,
      status: "assigned"
    })
    .eq("id", stockAccountId)
    .neq("status", "sold");

  if (updateError) throw new Error(updateError.message);

  await insertActivityLogWithAdmin(
    profile.id,
    "stock_assignment_added",
    "stock_accounts",
    stockAccountId,
    null,
    { assigned_employee_id: employeeId, legacy_assignment: true }
  );

  return true;
}

async function removeLegacyStockAssignmentWithAdmin(
  profile: Profile,
  stockAccountId: string,
  employeeId: string
) {
  if (!hasSupabaseAdminEnv()) return false;

  const adminSupabase = createAdminClient();

  if (profile.role === "employee" && employeeId !== profile.id) {
    throw new Error("Employees can only remove themselves.");
  }

  const { error: updateError } = await adminSupabase
    .from("stock_accounts")
    .update({
      assigned_employee_id: null,
      status: "available"
    })
    .eq("id", stockAccountId)
    .eq("assigned_employee_id", employeeId)
    .neq("status", "sold");

  if (updateError) throw new Error(updateError.message);

  await insertActivityLogWithAdmin(
    profile.id,
    "stock_assignment_removed",
    "stock_accounts",
    stockAccountId,
    { assigned_employee_id: employeeId, legacy_assignment: true },
    null
  );

  return true;
}

async function removeStockAccountAssignmentWithAdmin(
  profile: Profile,
  stockAccountId: string,
  employeeId: string
) {
  if (!hasSupabaseAdminEnv()) return false;

  const adminSupabase = createAdminClient();

  if (profile.role === "employee" && employeeId !== profile.id) {
    throw new Error("Employees can only remove themselves.");
  }

  const { data: employee, error: employeeError } = await adminSupabase
    .from("profiles")
    .select("id,role")
    .eq("id", employeeId)
    .single();

  if (employeeError) throw new Error(employeeError.message);
  if (!employee || employee.role === "admin") {
    throw new Error("Employee not found.");
  }

  const { data: oldAssignment, error: deleteError } = await adminSupabase
    .from("stock_account_assignments")
    .delete()
    .eq("stock_account_id", stockAccountId)
    .eq("employee_id", employeeId)
    .select("id,stock_account_id,employee_id,assigned_by,created_at")
    .maybeSingle();

  if (deleteError) throw new Error(stockAssignmentSchemaMessage(deleteError.message));

  const { error: legacyUpdateError } = await adminSupabase
    .from("stock_accounts")
    .update({ assigned_employee_id: null })
    .eq("id", stockAccountId)
    .eq("assigned_employee_id", employeeId)
    .neq("status", "sold");

  if (legacyUpdateError) throw new Error(legacyUpdateError.message);

  const { data: account, error: accountError } = await adminSupabase
    .from("stock_accounts")
    .select("id,status,assigned_employee_id")
    .eq("id", stockAccountId)
    .single();

  if (accountError) throw new Error(accountError.message);

  const { count, error: countError } = await adminSupabase
    .from("stock_account_assignments")
    .select("id", { count: "exact", head: true })
    .eq("stock_account_id", stockAccountId);

  if (countError) throw new Error(stockAssignmentSchemaMessage(countError.message));

  if (account?.status === "assigned" && !account.assigned_employee_id && (count ?? 0) === 0) {
    const { error: statusError } = await adminSupabase
      .from("stock_accounts")
      .update({ status: "available" })
      .eq("id", stockAccountId)
      .eq("status", "assigned");

    if (statusError) throw new Error(statusError.message);
  }

  await insertActivityLogWithAdmin(
    profile.id,
    "stock_assignment_removed",
    "stock_account_assignments",
    oldAssignment?.id ?? stockAccountId,
    oldAssignment,
    null
  );

  return true;
}

function isDuplicateStockAccount(
  account: Pick<StockAccount, "id" | "status" | "secret_code" | "account_title">,
  currentId: string | null,
  secretCode: string | null,
  accountTitle: string
) {
  if (account.id === currentId || account.status === "sold") return false;

  const requestedCode = normalizedStockIdentity(secretCode);
  if (requestedCode && normalizedStockIdentity(account.secret_code) === requestedCode) return true;

  return normalizedStockIdentity(account.account_title) === normalizedStockIdentity(accountTitle);
}

export async function saveStockAccount(formData: FormData) {
  const id = text(formData, "id");
  const hasEnv = hasSupabaseEnv();
  const secretCode = cleanSecretCode(text(formData, "secret_code"));
  const accountTitle = stripSecretCodeFromTitle(text(formData, "account_title"), secretCode);
  const finalAccountTitle = accountTitle || "Untitled account";
  const gameName = cleanStockText(text(formData, "game_name")) || "Unknown";
  const submittedNotes = cleanStockText(text(formData, "notes")) || null;
  const submittedAssignedEmployeeId = text(formData, "assigned_employee_id");

  if (!hasEnv) {
    const currentProfile = await getCurrentProfile();
    const assignedEmployeeId =
      currentProfile.role === "employee" && submittedAssignedEmployeeId && submittedAssignedEmployeeId !== currentProfile.id
        ? currentProfile.id
        : submittedAssignedEmployeeId;
    const imageUrls = await getDemoImageUrls(formData);
    const demoProfiles = await getDemoProfiles();
    const demoStockAccounts = await getDemoStockAccounts();
    const existing = id ? demoStockAccounts.find((account) => account.id === id) : null;

    if (demoStockAccounts.some((account) => isDuplicateStockAccount(account, id, secretCode, finalAccountTitle))) {
      throw new Error("Duplicate stock account already exists.");
    }

    const canSavePrivateNotes =
      currentProfile.role === "admin" ||
      assignedEmployeeId === currentProfile.id ||
      existing?.assigned_employee_id === currentProfile.id;
    const finalImageUrls = imageUrls.length ? imageUrls : (existing?.image_urls ?? []);
    const now = new Date().toISOString();
    const demoAccount: StockAccount = {
      id: id ?? `stock-${randomUUID()}`,
      game_name: gameName,
      account_title: finalAccountTitle,
      buying_price:
        currentProfile.role === "employee"
          ? existing?.buying_price ?? 0
          : number(formData, "buying_price"),
      selling_price: optionalNumber(formData, "selling_price"),
      image_url: finalImageUrls[0] ?? existing?.image_url ?? null,
      image_urls: finalImageUrls,
      secret_code: secretCode,
      purchase_date: text(formData, "purchase_date") ?? new Date().toISOString().slice(0, 10),
      status: (text(formData, "status") ?? "available") as StockAccount["status"],
      assigned_employee_id: assignedEmployeeId,
      notes: canSavePrivateNotes ? submittedNotes : (existing?.notes ?? null),
      created_by: "admin-demo",
      created_at: now,
      updated_at: now,
      assigned_employee: demoProfiles.find((profile) => profile.id === assignedEmployeeId) ?? null
    };

    await upsertDemoStockAccount(demoAccount);

    revalidatePath("/stock-accounts");
    revalidatePath(`/stock-accounts/${demoAccount.id}`);
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const assignedEmployeeId =
    profile.role === "employee" && submittedAssignedEmployeeId && submittedAssignedEmployeeId !== profile.id
      ? profile.id
      : submittedAssignedEmployeeId;
  const imageUrls = await uploadStockImages(formData);
  const existing = id
    ? (await supabase.from("stock_accounts").select("buying_price,assigned_employee_id,notes").eq("id", id).single()).data
    : null;

  let duplicateQuery = supabase
    .from("stock_accounts")
    .select("id,status,secret_code,account_title")
    .neq("status", "sold");

  if (id) duplicateQuery = duplicateQuery.neq("id", id);

  const { data: duplicateAccounts, error: duplicateError } = await duplicateQuery;

  if (duplicateError) throw new Error(duplicateError.message);

  const duplicateAccount = (duplicateAccounts as Array<Pick<StockAccount, "id" | "status" | "secret_code" | "account_title">> | null)
    ?.find((account) => isDuplicateStockAccount(account, id, secretCode, finalAccountTitle));

  if (duplicateAccount) {
    const duplicateCode =
      secretCode &&
      normalizedStockIdentity(duplicateAccount.secret_code) === normalizedStockIdentity(secretCode);

    throw new Error(
      duplicateCode
        ? "Duplicate stock account already exists with this secret code."
        : "Duplicate stock account already exists with this title."
    );
  }

  const canSavePrivateNotes =
    profile.role === "admin" ||
    assignedEmployeeId === profile.id ||
    existing?.assigned_employee_id === profile.id;
  const payload = {
    game_name: gameName,
    account_title: finalAccountTitle,
    buying_price:
      profile.role === "employee"
        ? Number(existing?.buying_price ?? 0)
        : number(formData, "buying_price"),
    selling_price: optionalNumber(formData, "selling_price"),
    ...(imageUrls.length ? { image_url: imageUrls[0], image_urls: imageUrls } : {}),
    secret_code: secretCode,
    purchase_date: text(formData, "purchase_date"),
    status: text(formData, "status") ?? "available",
    assigned_employee_id: assignedEmployeeId,
    notes: canSavePrivateNotes ? submittedNotes : (existing?.notes ?? null),
    created_by: profile.id
  };

  const result = id
    ? await supabase.from("stock_accounts").update(payload).eq("id", id).select().single()
    : await supabase.from("stock_accounts").insert(payload).select().single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  await logActivity(id ? "account_edited" : "account_added", "stock_accounts", id, null, result.data);
  revalidatePath("/stock-accounts");
  revalidatePath("/");
}

export async function deleteStockAccount(formData: FormData) {
  if (!hasSupabaseEnv()) return;
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: oldData } = await supabase.from("stock_accounts").select(STOCK_ACCOUNT_SELECT).eq("id", id).single();
  await supabase.from("stock_accounts").delete().eq("id", id);
  await logActivity("account_deleted", "stock_accounts", id, oldData, null);
  revalidatePath("/stock-accounts");
  revalidatePath("/");
}

export async function assignStockAccount(formData: FormData) {
  const stockAccountId = String(formData.get("stock_account_id") ?? "");
  const employeeId = text(formData, "assigned_employee_id");
  const nextStatus = employeeId ? "assigned" : "available";

  if (!hasSupabaseEnv()) {
    const account = (await getDemoStockAccounts()).find((item) => item.id === stockAccountId);
    const demoProfiles = await getDemoProfiles();
    if (!account || account.status === "sold") return;

    await upsertDemoStockAccount({
      ...account,
      assigned_employee_id: employeeId,
      assigned_employee: demoProfiles.find((profile) => profile.id === employeeId) ?? null,
      status: nextStatus,
      updated_at: new Date().toISOString()
    });

    revalidatePath("/stock-accounts");
    revalidatePath("/sales");
    revalidatePath(`/stock-accounts/${stockAccountId}`);
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_stock_account", {
    p_stock_account_id: stockAccountId,
    p_employee_id: employeeId
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/stock-accounts");
  revalidatePath("/sales");
  revalidatePath(`/stock-accounts/${stockAccountId}`);
  revalidatePath("/");
}

export async function addStockAccountAssignment(formData: FormData): Promise<AssignmentActionResult> {
  try {
    const stockAccountId = String(formData.get("stock_account_id") ?? "");
    const profile = await getCurrentProfile();
    const requestedEmployeeId = text(formData, "employee_id") ?? profile.id;
    const employeeId = profile.role === "employee" ? profile.id : requestedEmployeeId;

    if (!stockAccountId) return { ok: false, message: "Stock account is required." };

    if (!hasSupabaseEnv()) {
      const account = (await getDemoStockAccounts()).find((item) => item.id === stockAccountId);
      const demoProfiles = await getDemoProfiles();
      const employee = demoProfiles.find((item) => item.id === employeeId);
      if (!account || account.status === "sold") return { ok: false, message: "Stock account not found or already sold." };
      if (!employee || employee.role === "admin" || employee.status !== "active") {
        return { ok: false, message: "Employee is not available for assignment." };
      }

      await upsertDemoStockAccount({
        ...account,
        assigned_employee_id: account.assigned_employee_id ?? employeeId,
        assigned_employee: account.assigned_employee ?? employee,
        status: "assigned",
        updated_at: new Date().toISOString()
      });

      revalidateStockAssignmentPaths(stockAccountId);
      return { ok: true };
    }

    let adminErrorMessage: string | null = null;
    try {
      const handledByAdminClient = await addStockAccountAssignmentWithAdmin(profile, stockAccountId, employeeId);
      if (handledByAdminClient) {
        revalidateStockAssignmentPaths(stockAccountId);
        return { ok: true };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assignment could not be updated.";
      adminErrorMessage = message;
      if (isStockAssignmentSchemaError(message)) {
        const handledByLegacyFallback = await addLegacyStockAssignmentWithAdmin(profile, stockAccountId, employeeId);
        if (handledByLegacyFallback) {
          revalidateStockAssignmentPaths(stockAccountId);
          return {
            ok: true,
            message: "Assigned using old single-assignment mode. Run the multiple assignment migration on live database to allow more than one employee."
          };
        }
      }
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("add_stock_account_assignment", {
      p_stock_account_id: stockAccountId,
      p_employee_id: employeeId
    });

    if (error) {
      const message = stockAssignmentSchemaMessage(error.message);
      if (isStockAssignmentSchemaError(error.message)) {
        const handledByLegacyFallback = await addLegacyStockAssignmentWithAdmin(profile, stockAccountId, employeeId);
        if (handledByLegacyFallback) {
          revalidateStockAssignmentPaths(stockAccountId);
          return {
            ok: true,
            message: "Assigned using old single-assignment mode. Run the multiple assignment migration on live database to allow more than one employee."
          };
        }
      }
      return { ok: false, message: adminErrorMessage ?? message };
    }

    revalidateStockAssignmentPaths(stockAccountId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Assignment could not be updated."
    };
  }
}

export async function removeStockAccountAssignment(formData: FormData): Promise<AssignmentActionResult> {
  try {
    const stockAccountId = String(formData.get("stock_account_id") ?? "");
    const profile = await getCurrentProfile();
    const requestedEmployeeId = text(formData, "employee_id") ?? profile.id;
    const employeeId = profile.role === "employee" ? profile.id : requestedEmployeeId;

    if (!stockAccountId) return { ok: false, message: "Stock account is required." };

    if (!hasSupabaseEnv()) {
      const account = (await getDemoStockAccounts()).find((item) => item.id === stockAccountId);
      if (!account || account.status === "sold") return { ok: false, message: "Stock account not found or already sold." };
      if (account.assigned_employee_id === employeeId) {
        await upsertDemoStockAccount({
          ...account,
          assigned_employee_id: null,
          assigned_employee: null,
          status: "available",
          updated_at: new Date().toISOString()
        });
      }

      revalidateStockAssignmentPaths(stockAccountId);
      return { ok: true };
    }

    let adminErrorMessage: string | null = null;
    try {
      const handledByAdminClient = await removeStockAccountAssignmentWithAdmin(profile, stockAccountId, employeeId);
      if (handledByAdminClient) {
        revalidateStockAssignmentPaths(stockAccountId);
        return { ok: true };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assignment could not be updated.";
      adminErrorMessage = message;
      if (isStockAssignmentSchemaError(message)) {
        const handledByLegacyFallback = await removeLegacyStockAssignmentWithAdmin(profile, stockAccountId, employeeId);
        if (handledByLegacyFallback) {
          revalidateStockAssignmentPaths(stockAccountId);
          return {
            ok: true,
            message: "Removed using old single-assignment mode. Run the multiple assignment migration on live database to allow more than one employee."
          };
        }
      }
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_stock_account_assignment", {
      p_stock_account_id: stockAccountId,
      p_employee_id: employeeId
    });

    if (error) {
      const message = stockAssignmentSchemaMessage(error.message);
      if (isStockAssignmentSchemaError(error.message)) {
        const handledByLegacyFallback = await removeLegacyStockAssignmentWithAdmin(profile, stockAccountId, employeeId);
        if (handledByLegacyFallback) {
          revalidateStockAssignmentPaths(stockAccountId);
          return {
            ok: true,
            message: "Removed using old single-assignment mode. Run the multiple assignment migration on live database to allow more than one employee."
          };
        }
      }
      return { ok: false, message: adminErrorMessage ?? message };
    }

    revalidateStockAssignmentPaths(stockAccountId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Assignment could not be updated."
    };
  }
}

export async function saveDailyTask(formData: FormData) {
  const profile = await getCurrentProfile();

  if (profile.role === "employee") {
    throw new Error("Employees cannot create daily tasks.");
  }

  const id = text(formData, "id");
  const now = new Date().toISOString();
  const payload = {
    title: text(formData, "title"),
    description: text(formData, "description"),
    task_date: text(formData, "task_date") ?? now.slice(0, 10),
    created_by: profile.id
  };

  if (!hasSupabaseEnv()) {
    const task: DailyTask = {
      id: id ?? `task-${randomUUID()}`,
      title: payload.title ?? "Untitled task",
      description: payload.description,
      task_date: payload.task_date,
      created_by: profile.id,
      created_at: now,
      creator: profile
    };

    await upsertDemoDailyTask(task);
    revalidatePath("/daily-tasks");
    revalidatePath("/leaderboard");
    revalidatePath("/monthly-performance");
    return;
  }

  const supabase = await createClient();
  const result = id
    ? await supabase.from("daily_tasks").update(payload).eq("id", id).select().single()
    : await supabase.from("daily_tasks").insert(payload).select().single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  await logActivity(id ? "daily_task_edited" : "daily_task_added", "daily_tasks", id, null, result.data);
  revalidatePath("/daily-tasks");
  revalidatePath("/leaderboard");
  revalidatePath("/monthly-performance");
}

export async function deleteDailyTask(formData: FormData) {
  const profile = await getCurrentProfile();
  const id = String(formData.get("id") ?? "");

  if (profile.role === "employee") {
    throw new Error("Employees cannot delete daily tasks.");
  }

  if (!hasSupabaseEnv()) {
    await deleteDemoDailyTask(id);
    revalidatePath("/daily-tasks");
    revalidatePath("/leaderboard");
    revalidatePath("/monthly-performance");
    return;
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase.from("daily_tasks").select(DAILY_TASK_SELECT).eq("id", id).single();
  const { error } = await supabase.from("daily_tasks").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity("daily_task_deleted", "daily_tasks", id, oldData, null);
  revalidatePath("/daily-tasks");
  revalidatePath("/leaderboard");
  revalidatePath("/monthly-performance");
}

export async function completeDailyTask(formData: FormData) {
  const profile = await getCurrentProfile();
  const taskId = String(formData.get("task_id") ?? "");
  const now = new Date().toISOString();

  if (!hasSupabaseEnv()) {
    const screenshotUrls = await getDemoScreenshotUrls(formData);
    const task = (await getDemoDailyTasks()).find((item) => item.id === taskId);
    if (!task) return;

    const completion: DailyTaskCompletion = {
      id: `task-completion-${randomUUID()}`,
      task_id: task.id,
      employee_id: profile.id,
      screenshot_url: screenshotUrls[0],
      screenshot_urls: screenshotUrls,
      completed_at: now,
      task,
      employee: profile
    };

    await addDemoDailyTaskCompletion(completion);
    revalidatePath("/daily-tasks");
    revalidatePath("/leaderboard");
    revalidatePath("/monthly-performance");
    return;
  }

  const supabase = await createClient();
  const screenshotUrls = await uploadDailyTaskScreenshots(formData);
  const { data, error } = await supabase
    .from("daily_task_completions")
    .insert({
      task_id: taskId,
      employee_id: profile.id,
      screenshot_url: screenshotUrls[0],
      screenshot_urls: screenshotUrls
    })
    .select()
    .single();

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  await logActivity("daily_task_completed", "daily_task_completions", data?.id ?? null, null, data);
  revalidatePath("/daily-tasks");
  revalidatePath("/leaderboard");
  revalidatePath("/monthly-performance");
}

export async function saveSale(formData: FormData) {
  const id = text(formData, "id");
  const hasEnv = hasSupabaseEnv();

  if (!hasEnv) {
    const profile = await getCurrentProfile();
    const stockAccountId = text(formData, "stock_account_id");
    const stockAccount = (await getDemoStockAccounts()).find((account) => account.id === stockAccountId);
    if (!stockAccount) {
      throw new Error("Stock account not found.");
    }

    const soldDate = text(formData, "sold_date") ?? new Date().toISOString().slice(0, 10);
    const employeeId = profile.role === "employee" ? profile.id : text(formData, "employee_id") ?? profile.id;
    const saleSource = saleSourceFromFormData(formData);
    const demoProfiles = await getDemoProfiles();
    const employee = demoProfiles.find((item) => item.id === employeeId) ?? profile;
    const sale: SoldAccount = {
      id: id ?? `sold-${randomUUID()}`,
      stock_account_id: stockAccount.id,
      employee_id: employeeId,
      sold_amount: number(formData, "sold_amount"),
      sold_source_website: saleSource,
      buyer_contact: null,
      payment_status: (text(formData, "payment_status") ?? "pending") as SoldAccount["payment_status"],
      payment_method: null,
      payment_received_date: null,
      sold_date: soldDate,
      notes: text(formData, "notes"),
      created_at: new Date().toISOString(),
      stock_account: stockAccount,
      employee
    };

    await addDemoSale(sale);
    await upsertDemoStockAccount({
      ...stockAccount,
      status: "sold",
      updated_at: new Date().toISOString()
    });

    revalidatePath("/sales");
    revalidatePath("/sold-accounts");
    revalidatePath("/stock-accounts");
    revalidatePath(`/stock-accounts/${stockAccount.id}`);
    revalidatePath("/employees");
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const employeeId = profile.role === "employee" ? profile.id : text(formData, "employee_id") ?? profile.id;
  const paymentStatus = text(formData, "payment_status") ?? "pending";
  const saleSource = saleSourceFromFormData(formData);
  const payload = {
    stock_account_id: text(formData, "stock_account_id"),
    employee_id: employeeId,
    sold_amount: number(formData, "sold_amount"),
    sold_source_website: saleSource,
    buyer_contact: text(formData, "buyer_contact"),
    payment_status: paymentStatus,
    payment_method: text(formData, "payment_method"),
    ...(paymentStatus === "paid"
      ? { payment_received_date: text(formData, "payment_received_date") ?? new Date().toISOString().slice(0, 10) }
      : {}),
    sold_date: text(formData, "sold_date"),
    notes: text(formData, "notes")
  };

  const oldData = id
    ? (await supabase.from("sold_accounts").select(SOLD_ACCOUNT_SELECT).eq("id", id).single()).data
    : null;
  const result = id
    ? await supabase.from("sold_accounts").update(payload).eq("id", id).select().single()
    : await supabase.from("sold_accounts").insert(payload).select().single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  await rememberSaleSourceWebsite(saleSource);
  await logActivity(id ? "sale_edited" : "account_sold", "sold_accounts", id, oldData, result.data);
  revalidatePath("/sales");
  revalidatePath("/sold-accounts");
  revalidatePath("/stock-accounts");
  revalidatePath("/employees");
  revalidatePath("/");
}

export async function markSalePaid(formData: FormData) {
  const profile = await getCurrentProfile();
  const id = String(formData.get("id") ?? "");
  const paymentMethod = text(formData, "payment_method");
  const paidNote = text(formData, "notes");

  if (profile.role === "employee") {
    throw new Error("Employees cannot mark payments as paid.");
  }

  if (!hasSupabaseEnv()) {
    const sale = (await getDemoSoldAccounts()).find((item) => item.id === id);
    if (sale) {
      await upsertDemoSale({
        ...sale,
        payment_status: "paid",
        payment_method: paymentMethod ?? sale.payment_method ?? null,
        payment_received_date: new Date().toISOString().slice(0, 10),
        notes: paidNote ?? sale.notes ?? null
      });
    }

    revalidatePath("/sold-accounts");
    revalidatePath("/");
    revalidatePath("/reports");
    revalidatePath("/monthly-performance");
    revalidatePath("/leaderboard");
    revalidatePath("/employees");
    return;
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase.from("sold_accounts").select(SOLD_ACCOUNT_SELECT).eq("id", id).single();
  let result = await supabase
    .from("sold_accounts")
    .update({
      payment_status: "paid",
      payment_method: paymentMethod ?? oldData?.payment_method ?? null,
      payment_received_date: new Date().toISOString().slice(0, 10),
      notes: paidNote ?? oldData?.notes ?? null
    })
    .eq("id", id)
    .select()
    .single();

  if (
    result.error &&
    (result.error.message.includes("payment_received_date") || result.error.message.includes("schema cache"))
  ) {
    result = await supabase
      .from("sold_accounts")
      .update({
        payment_status: "paid",
        payment_method: paymentMethod ?? oldData?.payment_method ?? null,
        notes: paidNote ?? oldData?.notes ?? null
      })
      .eq("id", id)
      .select()
      .single();
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  await logActivity("sale_payment_marked_paid", "sold_accounts", id, oldData, result.data);
  revalidatePath("/sold-accounts");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/monthly-performance");
  revalidatePath("/leaderboard");
  revalidatePath("/employees");
}

export async function deleteSale(formData: FormData) {
  if (!hasSupabaseEnv()) return;
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: oldData } = await supabase.from("sold_accounts").select(SOLD_ACCOUNT_SELECT).eq("id", id).single();
  await supabase.from("sold_accounts").delete().eq("id", id);
  await logActivity("sale_deleted", "sold_accounts", id, oldData, null);
  revalidatePath("/sold-accounts");
  revalidatePath("/");
}

export async function saveGmail(formData: FormData) {
  const id = text(formData, "id");
  const hasEnv = hasSupabaseEnv();

  if (!hasEnv) {
    const now = new Date().toISOString();
    const existing = id
      ? (await getDemoGmailAccounts()).find((gmail) => gmail.id === id)
      : null;
    const account: GmailAccount = {
      id: id ?? `gmail-${randomUUID()}`,
      email: text(formData, "email") ?? "",
      recovery_info: text(formData, "recovery_info"),
      status: (text(formData, "status") ?? existing?.status ?? "fresh") as GmailAccount["status"],
      used_for_stock_account_id: existing?.used_for_stock_account_id ?? null,
      date_added: text(formData, "date_added") ?? existing?.date_added ?? now.slice(0, 10),
      date_used: text(formData, "date_used") ?? existing?.date_used ?? null,
      notes: text(formData, "notes") ?? existing?.notes ?? null,
      created_at: existing?.created_at ?? now
    };

    await upsertDemoGmailAccount(account);
    revalidatePath("/gmail-inventory");
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const password = text(formData, "password") ?? "not-stored-in-ui";
  const payload: Record<string, unknown> = {
    email: text(formData, "email"),
    recovery_info: text(formData, "recovery_info"),
    status: text(formData, "status") ?? "fresh",
    used_for_stock_account_id: text(formData, "used_for_stock_account_id"),
    date_added: text(formData, "date_added") ?? new Date().toISOString().slice(0, 10),
    date_used: text(formData, "date_used"),
    notes: text(formData, "notes")
  };
  payload.encrypted_password = encryptSecret(password);

  const result = id
    ? await supabase.from("gmail_inventory").update(payload).eq("id", id).select().single()
    : await supabase.from("gmail_inventory").insert(payload).select().single();

  await logActivity(id ? "gmail_edited" : "gmail_added", "gmail_inventory", id, null, result.data);
  revalidatePath("/gmail-inventory");
  revalidatePath("/");
}

export async function markGmailUsed(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const today = new Date().toISOString().slice(0, 10);

  if (!hasSupabaseEnv()) {
    const account = (await getDemoGmailAccounts()).find((gmail) => gmail.id === id);
    if (!account) return;
    await upsertDemoGmailAccount({
      ...account,
      status: "used",
      date_used: today
    });
    revalidatePath("/gmail-inventory");
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase
    .from("gmail_inventory")
    .select(GMAIL_SELECT)
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("gmail_inventory")
    .update({ status: "used", date_used: today })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logActivity("gmail_marked_used", "gmail_inventory", id, oldData, data);
  revalidatePath("/gmail-inventory");
  revalidatePath("/");
}

export async function saveEmployee(formData: FormData) {
  const id = text(formData, "id");
  const email = text(formData, "email");
  const phone = text(formData, "phone");
  const password = text(formData, "password");
  const role = text(formData, "role") ?? "employee";
  const currentProfile = await getCurrentProfile();

  if (currentProfile.role === "employee") {
    throw new Error("Employees cannot create employee accounts.");
  }

  if (!hasSupabaseEnv()) {
    const now = new Date().toISOString();
    await upsertDemoProfile({
      id: id ?? `employee-${randomUUID()}`,
      auth_user_id: id ?? null,
      name: text(formData, "name") ?? "New Employee",
      phone,
      email: email ?? "",
      role: role as Profile["role"],
      status: (text(formData, "status") ?? "active") as Profile["status"],
      join_date: text(formData, "join_date") ?? now.slice(0, 10),
      notes: text(formData, "notes"),
      created_at: now
    });
    revalidatePath("/employees");
    return;
  }

  const supabase = await createClient();
  let authUserId = text(formData, "auth_user_id");

  if (!id) {
    if (!email) throw new Error("Employee email is required.");
    if (!password || password.length < 6) {
      throw new Error("Login password must be at least 6 characters.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: text(formData, "name"),
        phone,
        role
      }
    });

    if (error) {
      throw new Error(error.message);
    }

    authUserId = data.user.id;
  }

  const payload = {
    auth_user_id: authUserId,
    name: text(formData, "name"),
    phone,
    email,
    role,
    status: text(formData, "status") ?? "active",
    join_date: text(formData, "join_date"),
    notes: text(formData, "notes")
  };

  const result = id
    ? await supabase.from("profiles").update(payload).eq("id", id).select().single()
    : await supabase.from("profiles").insert(payload).select().single();

  await logActivity(id ? "employee_edited" : "employee_added", "profiles", id, null, result.data);
  revalidatePath("/employees");
}

export async function approveEmployee(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const currentProfile = await getCurrentProfile();
  if (currentProfile.role !== "admin") {
    throw new Error("Only admins can approve accounts.");
  }

  if (!hasSupabaseEnv()) {
    const profile = (await getDemoProfiles()).find((item) => item.id === id);
    if (!profile) return;
    await upsertDemoProfile({
      ...profile,
      status: "active"
    });
    revalidatePath("/employees");
    return;
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", id).single();
  const { data, error } = await supabase
    .from("profiles")
    .update({ status: "active" })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logActivity("employee_approved", "profiles", id, oldData, data);
  revalidatePath("/employees");
}

export async function deleteEmployee(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const currentProfile = await getCurrentProfile();
  if (currentProfile.role !== "admin") {
    throw new Error("Only admins can delete employee accounts.");
  }
  if (currentProfile.id === id) {
    throw new Error("You cannot delete your own account.");
  }

  if (!hasSupabaseEnv()) {
    await deleteDemoProfile(id);
    revalidatePath("/employees");
    revalidatePath(`/employees/${id}`);
    return;
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", id).single();
  const { error } = await supabase.from("profiles").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  if (oldData?.auth_user_id && hasSupabaseAdminEnv()) {
    await createAdminClient().auth.admin.deleteUser(oldData.auth_user_id);
  }

  await logActivity("employee_deleted", "profiles", id, oldData, null);
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
}

export async function saveAdvance(formData: FormData) {
  if (!hasSupabaseEnv()) return;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const id = text(formData, "id");
  const payload = {
    employee_id: text(formData, "employee_id"),
    amount_given: number(formData, "amount_given"),
    date_given: text(formData, "date_given"),
    purpose: text(formData, "purpose"),
    payment_method: text(formData, "payment_method"),
    status: text(formData, "status") ?? "open",
    notes: text(formData, "notes"),
    created_by: profile.id
  };

  const result = id
    ? await supabase.from("employee_advances").update(payload).eq("id", id).select().single()
    : await supabase.from("employee_advances").insert(payload).select().single();

  if (!id && result.data) {
    await supabase.from("advance_transactions").insert({
      advance_id: result.data.id,
      employee_id: payload.employee_id,
      type: "money_given",
      amount: payload.amount_given,
      transaction_date: payload.date_given,
      notes: "Opening advance",
      created_by: profile.id
    });
  }

  await logActivity(id ? "advance_edited" : "advance_added", "employee_advances", id, null, result.data);
  revalidatePath("/advances");
  revalidatePath("/");
}

export async function deleteAdvance(formData: FormData) {
  const profile = await getCurrentProfile();
  const id = String(formData.get("id") ?? "");

  if (profile.role === "employee") {
    throw new Error("Employees cannot delete funds.");
  }

  if (!hasSupabaseEnv()) {
    revalidatePath("/advances");
    revalidatePath("/");
    redirect("/advances");
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase.from("employee_advances").select(ADVANCE_SELECT).eq("id", id).maybeSingle();
  const { data: oldTransactions } = await supabase.from("advance_transactions").select(ADVANCE_TRANSACTION_SELECT).eq("advance_id", id);
  const { error: transactionDeleteError } = await supabase.from("advance_transactions").delete().eq("advance_id", id);

  if (transactionDeleteError) {
    throw new Error(transactionDeleteError.message);
  }

  const { error } = await supabase.from("employee_advances").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity("advance_deleted", "employee_advances", id, oldData, null);
  if (oldTransactions?.length) {
    await logActivity("advance_transactions_deleted", "advance_transactions", id, oldTransactions, null);
  }
  revalidatePath("/advances");
  revalidatePath("/employees");
  revalidatePath("/monthly-performance");
  revalidatePath("/");
  redirect("/advances");
}

export async function saveAdvanceTransaction(formData: FormData) {
  if (!hasSupabaseEnv()) return;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const payload = {
    advance_id: text(formData, "advance_id"),
    employee_id: text(formData, "employee_id"),
    type: text(formData, "type") ?? "adjustment",
    amount: number(formData, "amount"),
    stock_account_id: text(formData, "stock_account_id"),
    transaction_date: text(formData, "transaction_date"),
    notes: text(formData, "notes"),
    created_by: profile.id
  };
  const { data } = await supabase.from("advance_transactions").insert(payload).select().single();
  await logActivity("advance_transaction_added", "advance_transactions", data?.id ?? null, null, data);
  revalidatePath("/advances");
  revalidatePath("/");
}

export async function deleteAdvanceTransaction(formData: FormData) {
  const profile = await getCurrentProfile();
  const id = String(formData.get("id") ?? "");

  if (profile.role === "employee") {
    throw new Error("Employees cannot delete fund transactions.");
  }

  if (!hasSupabaseEnv()) {
    revalidatePath("/advances");
    revalidatePath("/");
    redirect("/advances");
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase.from("advance_transactions").select(ADVANCE_TRANSACTION_SELECT).eq("id", id).maybeSingle();
  const { error } = await supabase.from("advance_transactions").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity("advance_transaction_deleted", "advance_transactions", id, oldData, null);
  revalidatePath("/advances");
  revalidatePath("/employees");
  revalidatePath("/monthly-performance");
  revalidatePath("/");
  redirect("/advances");
}

export async function saveExpense(formData: FormData) {
  const profile = await getCurrentProfile();
  const id = text(formData, "id");
  const paidBy = profile.role === "employee" ? profile.id : text(formData, "paid_by") ?? profile.id;

  if (!hasSupabaseEnv()) {
    const existing = id
      ? (await getDemoExpenses()).find((expense) => expense.id === id)
      : null;
    const now = new Date().toISOString();

    await upsertDemoExpense({
      id: id ?? `expense-${randomUUID()}`,
      title: text(formData, "title") ?? "Untitled expense",
      category: (text(formData, "category") ?? "other") as Expense["category"],
      amount: number(formData, "amount"),
      expense_date: text(formData, "expense_date") ?? now.slice(0, 10),
      paid_by: paidBy,
      notes: text(formData, "notes"),
      created_at: existing?.created_at ?? now
    });

    revalidatePath("/expenses");
    revalidatePath("/losses");
    revalidatePath("/reports");
    revalidatePath("/monthly-performance");
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const payload = {
    title: text(formData, "title"),
    category: text(formData, "category") ?? "other",
    amount: number(formData, "amount"),
    expense_date: text(formData, "expense_date"),
    paid_by: paidBy,
    notes: text(formData, "notes")
  };
  const result = id
    ? await supabase.from("expenses").update(payload).eq("id", id).select().single()
    : await supabase.from("expenses").insert(payload).select().single();
  if (result.error) {
    throw new Error(result.error.message);
  }
  await logActivity(id ? "expense_edited" : "expense_added", "expenses", id, null, result.data);
  revalidatePath("/expenses");
  revalidatePath("/losses");
  revalidatePath("/reports");
  revalidatePath("/monthly-performance");
  revalidatePath("/");
}

export async function deleteExpense(formData: FormData) {
  const profile = await getCurrentProfile();
  const id = String(formData.get("id") ?? "");

  if (profile.role === "employee") {
    throw new Error("Employees cannot delete expenses or losses.");
  }

  if (!hasSupabaseEnv()) {
    await deleteDemoExpense(id);
    revalidatePath("/expenses");
    revalidatePath("/losses");
    revalidatePath("/reports");
    revalidatePath("/monthly-performance");
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const { data: oldData } = await supabase.from("expenses").select(EXPENSE_SELECT).eq("id", id).single();
  const { error } = await supabase.from("expenses").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity("expense_deleted", "expenses", id, oldData, null);
  revalidatePath("/expenses");
  revalidatePath("/losses");
  revalidatePath("/reports");
  revalidatePath("/monthly-performance");
  revalidatePath("/");
}

export async function saveSettings(formData: FormData) {
  if (!hasSupabaseEnv()) return;
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const payload = {
    business_name: text(formData, "business_name"),
    currency: text(formData, "currency"),
    game_categories: String(formData.get("game_categories") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    sale_source_websites: uniqueSaleSourceOptions(
      String(formData.get("sale_source_websites") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
    expense_categories: String(formData.get("expense_categories") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  };
  await supabase.from("settings").update(payload).eq("id", id);
  await logActivity("settings_edited", "settings", id, null, payload);
  revalidatePath("/settings");
}

export async function addGameCategory(formData: FormData) {
  try {
    const profile = await getCurrentProfile();
    if (profile.role !== "admin") {
      return { ok: false, message: "Only admins can add new games.", gameCategories: [] };
    }

    const gameName = cleanStockText(text(formData, "game_name"));
    if (!gameName) {
      return { ok: false, message: "Game name is required.", gameCategories: [] };
    }

    if (!hasSupabaseEnv()) {
      return { ok: true, message: `${gameName} added.`, gameCategories: [gameName] };
    }

    const supabase = hasSupabaseAdminEnv() ? createAdminClient() : await createClient();
    const { data: settings, error: fetchError } = await supabase
      .from("settings")
      .select("id,game_categories")
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return { ok: false, message: fetchError.message, gameCategories: [] };
    }

    if (!settings) {
      const seededCategories = [
        ...DEFAULT_SETTINGS_PAYLOAD.game_categories,
        gameName
      ].filter(
        (category, index, categories) =>
          categories.findIndex((item) => item.trim().toLowerCase() === category.trim().toLowerCase()) === index
      );
      const { data: createdSettings, error: createError } = await supabase
        .from("settings")
        .insert({
          ...DEFAULT_SETTINGS_PAYLOAD,
          game_categories: seededCategories
        })
        .select("id,game_categories")
        .single();

      if (createError) {
        return { ok: false, message: createError.message, gameCategories: [] };
      }

      try {
        await logActivity("settings_created", "settings", createdSettings.id, null, createdSettings);
      } catch {
        // Settings creation should not fail just because activity logging is unavailable.
      }

      revalidatePath("/stock-accounts");
      revalidatePath("/settings");

      return {
        ok: true,
        message: `${gameName} added for everyone.`,
        gameCategories: (createdSettings.game_categories as string[]) ?? seededCategories
      };
    }

    const existingCategories = Array.isArray(settings.game_categories)
      ? (settings.game_categories as string[])
      : [];
    const normalizedGame = gameName.toLowerCase();

    if (existingCategories.some((category) => category.trim().toLowerCase() === normalizedGame)) {
      return {
        ok: true,
        message: `${gameName} already exists.`,
        gameCategories: existingCategories
      };
    }

    const nextCategories = [...existingCategories, gameName];

    const { data, error } = await supabase
      .from("settings")
      .update({ game_categories: nextCategories })
      .eq("id", settings.id)
      .select("game_categories")
      .single();

    if (error) {
      return { ok: false, message: error.message, gameCategories: existingCategories };
    }

    try {
      await logActivity("game_category_added", "settings", settings.id, settings, data);
    } catch {
      // Adding a game should not fail just because activity logging is unavailable.
    }

    revalidatePath("/stock-accounts");
    revalidatePath("/settings");

    return {
      ok: true,
      message: `${gameName} added for everyone.`,
      gameCategories: (data.game_categories as string[]) ?? nextCategories
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Game could not be added.",
      gameCategories: []
    };
  }
}
