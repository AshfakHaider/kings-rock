"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { getCurrentProfile } from "@/lib/data";
import { cleanSecretCode, cleanStockText, stripSecretCodeFromTitle } from "@/lib/stock-title";
import {
  addDemoSale,
  addDemoDailyTaskCompletion,
  getDemoDailyTasks,
  getDemoGmailAccounts,
  getDemoExpenses,
  getDemoProfiles,
  getDemoStockAccounts,
  upsertDemoDailyTask,
  upsertDemoExpense,
  upsertDemoProfile,
  upsertDemoGmailAccount,
  upsertDemoStockAccountCredential,
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

function passwordText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length ? value : null;
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

export async function saveStockAccount(formData: FormData) {
  const id = text(formData, "id");
  const hasEnv = hasSupabaseEnv();
  const secretCode = cleanSecretCode(text(formData, "secret_code"));
  const accountTitle = stripSecretCodeFromTitle(text(formData, "account_title"), secretCode);
  const gameName = cleanStockText(text(formData, "game_name")) || "Unknown";
  const notes = cleanStockText(text(formData, "notes")) || null;
  const stockGmailEmail = cleanStockText(text(formData, "stock_gmail_email")) || null;
  const stockGmailPassword = passwordText(formData, "stock_gmail_password");

  if (!hasEnv) {
    const currentProfile = await getCurrentProfile();
    const imageUrls = await getDemoImageUrls(formData);
    const assignedEmployeeId = text(formData, "assigned_employee_id");
    const demoProfiles = await getDemoProfiles();
    const existing = id
      ? (await getDemoStockAccounts()).find((account) => account.id === id)
      : null;
    const finalImageUrls = imageUrls.length ? imageUrls : (existing?.image_urls ?? []);
    const now = new Date().toISOString();
    const demoAccount: StockAccount = {
      id: id ?? `stock-${randomUUID()}`,
      game_name: gameName,
      account_title: accountTitle || "Untitled account",
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
      notes,
      created_by: "admin-demo",
      created_at: now,
      updated_at: now,
      assigned_employee: demoProfiles.find((profile) => profile.id === assignedEmployeeId) ?? null
    };

    await upsertDemoStockAccount(demoAccount);
    if (stockGmailEmail && stockGmailPassword) {
      await upsertDemoStockAccountCredential({
        stock_account_id: demoAccount.id,
        gmail_email: stockGmailEmail,
        password: stockGmailPassword
      });
    }

    revalidatePath("/stock-accounts");
    revalidatePath(`/stock-accounts/${demoAccount.id}`);
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const imageUrls = await uploadStockImages(formData);
  const existing = id
    ? (await supabase.from("stock_accounts").select("buying_price").eq("id", id).single()).data
    : null;
  const payload = {
    game_name: gameName,
    account_title: accountTitle || "Untitled account",
    buying_price:
      profile.role === "employee"
        ? Number(existing?.buying_price ?? 0)
        : number(formData, "buying_price"),
    selling_price: optionalNumber(formData, "selling_price"),
    ...(imageUrls.length ? { image_url: imageUrls[0], image_urls: imageUrls } : {}),
    secret_code: secretCode,
    purchase_date: text(formData, "purchase_date"),
    status: text(formData, "status") ?? "available",
    assigned_employee_id: text(formData, "assigned_employee_id"),
    notes,
    created_by: profile.id
  };

  const result = id
    ? await supabase.from("stock_accounts").update(payload).eq("id", id).select().single()
    : await supabase.from("stock_accounts").insert(payload).select().single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (stockGmailEmail && stockGmailPassword) {
    const credentialResult = await supabase
      .from("stock_account_credentials")
      .upsert(
        {
          stock_account_id: result.data.id,
          gmail_email: stockGmailEmail,
          encrypted_password: encryptSecret(stockGmailPassword)
        },
        { onConflict: "stock_account_id" }
      );

    if (credentialResult.error) {
      throw new Error(credentialResult.error.message);
    }
  } else if (stockGmailEmail && id) {
    const credentialResult = await supabase
      .from("stock_account_credentials")
      .update({ gmail_email: stockGmailEmail })
      .eq("stock_account_id", result.data.id);

    if (credentialResult.error) {
      throw new Error(credentialResult.error.message);
    }
  }

  await logActivity(id ? "account_edited" : "account_added", "stock_accounts", id, null, result.data);
  revalidatePath("/stock-accounts");
  revalidatePath("/");
}

export async function deleteStockAccount(formData: FormData) {
  if (!hasSupabaseEnv()) return;
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: oldData } = await supabase.from("stock_accounts").select("*").eq("id", id).single();
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
    const demoProfiles = await getDemoProfiles();
    const employee = demoProfiles.find((item) => item.id === employeeId) ?? profile;
    const sale: SoldAccount = {
      id: id ?? `sold-${randomUUID()}`,
      stock_account_id: stockAccount.id,
      employee_id: employeeId,
      sold_amount: number(formData, "sold_amount"),
      sold_source_website: text(formData, "sold_source_website"),
      buyer_contact: null,
      payment_status: "paid",
      payment_method: null,
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
    revalidatePath("/");
    return;
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const employeeId = profile.role === "employee" ? profile.id : text(formData, "employee_id") ?? profile.id;
  const payload = {
    stock_account_id: text(formData, "stock_account_id"),
    employee_id: employeeId,
    sold_amount: number(formData, "sold_amount"),
    sold_source_website: text(formData, "sold_source_website"),
    buyer_contact: text(formData, "buyer_contact"),
    payment_status: text(formData, "payment_status") ?? "paid",
    payment_method: text(formData, "payment_method"),
    sold_date: text(formData, "sold_date"),
    notes: text(formData, "notes")
  };

  const oldData = id
    ? (await supabase.from("sold_accounts").select("*").eq("id", id).single()).data
    : null;
  const result = id
    ? await supabase.from("sold_accounts").update(payload).eq("id", id).select().single()
    : await supabase.from("sold_accounts").insert(payload).select().single();

  await logActivity(id ? "sale_edited" : "account_sold", "sold_accounts", id, oldData, result.data);
  revalidatePath("/sold-accounts");
  revalidatePath("/stock-accounts");
  revalidatePath("/");
}

export async function deleteSale(formData: FormData) {
  if (!hasSupabaseEnv()) return;
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: oldData } = await supabase.from("sold_accounts").select("*").eq("id", id).single();
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
    .select("*")
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
  const { data: oldData } = await supabase.from("profiles").select("*").eq("id", id).single();
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
  await logActivity(id ? "expense_edited" : "expense_added", "expenses", id, null, result.data);
  revalidatePath("/expenses");
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
    sale_source_websites: String(formData.get("sale_source_websites") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    expense_categories: String(formData.get("expense_categories") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  };
  await supabase.from("settings").update(payload).eq("id", id);
  await logActivity("settings_edited", "settings", id, null, payload);
  revalidatePath("/settings");
}
