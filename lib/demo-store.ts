import { readFile, writeFile } from "fs/promises";
import path from "path";
import { demoExpenses, demoGmail, demoProfiles, demoSoldAccounts, demoStockAccounts } from "@/lib/demo-data";
import type { DailyTask, DailyTaskCompletion, Expense, GmailAccount, Profile, SoldAccount, StockAccount, StockAccountCredential } from "@/lib/types";

const stockStorePath = path.join(process.cwd(), ".demo-stock-accounts.json");
const soldStorePath = path.join(process.cwd(), ".demo-sold-accounts.json");
const gmailStorePath = path.join(process.cwd(), ".demo-gmail-accounts.json");
const profileStorePath = path.join(process.cwd(), ".demo-profiles.json");
const expenseStorePath = path.join(process.cwd(), ".demo-expenses.json");
const dailyTaskStorePath = path.join(process.cwd(), ".demo-daily-tasks.json");
const dailyTaskCompletionStorePath = path.join(process.cwd(), ".demo-daily-task-completions.json");
const stockCredentialStorePath = path.join(process.cwd(), ".demo-stock-credentials.json");
const jsonCache = new Map<string, unknown[]>();

async function readJsonStore<T>(filePath: string) {
  const cached = jsonCache.get(filePath);
  if (cached) return cached as T[];

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as T[];
    jsonCache.set(filePath, parsed);
    return parsed;
  } catch {
    jsonCache.set(filePath, []);
    return [];
  }
}

async function writeJsonStore<T>(filePath: string, data: T[]) {
  jsonCache.set(filePath, data as unknown[]);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

async function readStoredStockAccounts() {
  return readJsonStore<StockAccount>(stockStorePath);
}

async function readStoredSoldAccounts() {
  return readJsonStore<SoldAccount>(soldStorePath);
}

async function readStoredGmailAccounts() {
  return readJsonStore<GmailAccount>(gmailStorePath);
}

async function readStoredProfiles() {
  return readJsonStore<Profile>(profileStorePath);
}

async function readStoredExpenses() {
  return readJsonStore<Expense>(expenseStorePath);
}

async function readStoredDailyTasks() {
  return readJsonStore<DailyTask>(dailyTaskStorePath);
}

async function readStoredDailyTaskCompletions() {
  return readJsonStore<DailyTaskCompletion>(dailyTaskCompletionStorePath);
}

async function readStoredStockCredentials() {
  return readJsonStore<StockAccountCredential>(stockCredentialStorePath);
}

export async function getDemoProfiles() {
  const stored = await readStoredProfiles();
  const storedIds = new Set(stored.map((profile) => profile.id));
  return [
    ...stored,
    ...demoProfiles.filter((profile) => !storedIds.has(profile.id))
  ];
}

export async function upsertDemoProfile(profile: Profile) {
  const stored = await readStoredProfiles();
  const index = stored.findIndex((item) => item.id === profile.id);

  if (index >= 0) {
    stored[index] = profile;
  } else {
    stored.unshift(profile);
  }

  await writeJsonStore(profileStorePath, stored);
  return profile;
}

export async function deleteDemoProfile(id: string) {
  const stored = await readStoredProfiles();
  await writeJsonStore(
    profileStorePath,
    stored.filter((profile) => profile.id !== id)
  );
}

export async function getDemoStockAccounts() {
  const stored = await readStoredStockAccounts();
  const storedIds = new Set(stored.map((account) => account.id));
  return [
    ...stored,
    ...demoStockAccounts.filter((account) => !storedIds.has(account.id))
  ];
}

export async function upsertDemoStockAccount(account: StockAccount) {
  const stored = await readStoredStockAccounts();
  const index = stored.findIndex((item) => item.id === account.id);

  const normalized = {
    ...account,
    assigned_employee:
      (await getDemoProfiles()).find((profile) => profile.id === account.assigned_employee_id) ?? null
  };

  if (index >= 0) {
    stored[index] = normalized;
  } else {
    stored.unshift(normalized);
  }

  await writeJsonStore(stockStorePath, stored);
  return normalized;
}

export async function getDemoStockAccountCredential(stockAccountId: string) {
  const stored = await readStoredStockCredentials();
  return stored.find((credential) => credential.stock_account_id === stockAccountId) ?? null;
}

export async function upsertDemoStockAccountCredential(credential: StockAccountCredential) {
  const stored = await readStoredStockCredentials();
  const index = stored.findIndex((item) => item.stock_account_id === credential.stock_account_id);
  const normalized = {
    ...credential,
    updated_at: new Date().toISOString()
  };

  if (index >= 0) {
    stored[index] = {
      ...stored[index],
      ...normalized
    };
  } else {
    stored.unshift({
      ...normalized,
      created_at: normalized.created_at ?? new Date().toISOString()
    });
  }

  await writeJsonStore(stockCredentialStorePath, stored);
  return normalized;
}

export async function getDemoSoldAccounts() {
  const stored = await readStoredSoldAccounts();
  const storedIds = new Set(stored.map((sale) => sale.id));
  return [
    ...stored,
    ...demoSoldAccounts.filter((sale) => !storedIds.has(sale.id))
  ];
}

export async function addDemoSale(sale: SoldAccount) {
  const stored = await readStoredSoldAccounts();
  stored.unshift(sale);
  await writeJsonStore(soldStorePath, stored);
  return sale;
}

export async function getDemoGmailAccounts() {
  const stored = await readStoredGmailAccounts();
  const storedIds = new Set(stored.map((gmail) => gmail.id));
  return [
    ...stored,
    ...demoGmail.filter((gmail) => !storedIds.has(gmail.id))
  ];
}

export async function upsertDemoGmailAccount(account: GmailAccount) {
  const stored = await readStoredGmailAccounts();
  const index = stored.findIndex((item) => item.id === account.id);

  if (index >= 0) {
    stored[index] = account;
  } else {
    stored.unshift(account);
  }

  await writeJsonStore(gmailStorePath, stored);
  return account;
}

export async function getDemoExpenses() {
  const stored = await readStoredExpenses();
  const storedIds = new Set(stored.map((expense) => expense.id));
  const profiles = await getDemoProfiles();

  return [
    ...stored,
    ...demoExpensesWithPayers(profiles).filter((expense) => !storedIds.has(expense.id))
  ];
}

export async function upsertDemoExpense(expense: Expense) {
  const stored = await readStoredExpenses();
  const profiles = await getDemoProfiles();
  const index = stored.findIndex((item) => item.id === expense.id);
  const normalized = {
    ...expense,
    payer: profiles.find((profile) => profile.id === expense.paid_by) ?? null
  };

  if (index >= 0) {
    stored[index] = normalized;
  } else {
    stored.unshift(normalized);
  }

  await writeJsonStore(expenseStorePath, stored);
  return normalized;
}

function demoExpensesWithPayers(profiles: Profile[]) {
  return demoExpenses.map((expense) => ({
    ...expense,
    payer: profiles.find((profile) => profile.id === expense.paid_by) ?? null
  }));
}

export async function getDemoDailyTasks() {
  const stored = await readStoredDailyTasks();
  const profiles = await getDemoProfiles();
  return stored.map((task) => ({
    ...task,
    creator: profiles.find((profile) => profile.id === task.created_by) ?? null
  }));
}

export async function upsertDemoDailyTask(task: DailyTask) {
  const stored = await readStoredDailyTasks();
  const profiles = await getDemoProfiles();
  const index = stored.findIndex((item) => item.id === task.id);
  const normalized = {
    ...task,
    creator: profiles.find((profile) => profile.id === task.created_by) ?? null
  };

  if (index >= 0) {
    stored[index] = normalized;
  } else {
    stored.unshift(normalized);
  }

  await writeJsonStore(dailyTaskStorePath, stored);
  return normalized;
}

export async function getDemoDailyTaskCompletions() {
  const stored = await readStoredDailyTaskCompletions();
  const [profiles, tasks] = await Promise.all([getDemoProfiles(), getDemoDailyTasks()]);

  return stored.map((completion) => ({
    ...completion,
    employee: profiles.find((profile) => profile.id === completion.employee_id) ?? null,
    task: tasks.find((task) => task.id === completion.task_id) ?? null
  }));
}

export async function addDemoDailyTaskCompletion(completion: DailyTaskCompletion) {
  const stored = await readStoredDailyTaskCompletions();
  const exists = stored.some(
    (item) => item.task_id === completion.task_id && item.employee_id === completion.employee_id
  );

  if (!exists) {
    stored.unshift(completion);
    await writeJsonStore(dailyTaskCompletionStorePath, stored);
  }

  return completion;
}
