import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient, createClient, hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import {
  demoActivityLogs,
  demoAdvanceTransactions,
  demoAdvances,
  demoSettings,
} from "@/lib/demo-data";
import {
  getDemoDailyTaskCompletions,
  getDemoDailyTasks,
  getDemoExpenses,
  getDemoGmailAccounts,
  getDemoProfiles,
  getDemoSoldAccounts,
  getDemoStockAccountCredential,
  getDemoStockAccounts
} from "@/lib/demo-store";
import type {
  ActivityLog,
  AdvanceTransaction,
  DailyTask,
  DailyTaskCompletion,
  DashboardSnapshot,
  EmployeeAdvance,
  Expense,
  GmailAccount,
  LeaderboardEntry,
  Profile,
  Settings,
  SoldAccount,
  StockAccount,
  StockAccountAssignment,
  StockAccountCredential
} from "@/lib/types";
import {
  employeeProfitSeries,
  getProfit,
  getDashboardMetrics,
  soldQuantityByGame,
  soldValueByGame,
  isPaidSale,
  monthlySeries,
  saleCashDate,
  salesBySource,
  stockQuantityByGame,
  stockValueByGame
} from "@/lib/metrics";
import { normalizeCurrency } from "@/lib/utils";

export const DEFAULT_PAGE_SIZE = 30;
const PROFILE_SELECT = "id,auth_user_id,name,phone,email,role,status,join_date,notes,created_at";
const SETTINGS_SELECT = "id,business_name,currency,game_categories,sale_source_websites,expense_categories,employee_permissions";
const SOLD_ACCOUNT_SELECT =
  "id,stock_account_id,employee_id,sold_amount,sold_source_website,buyer_contact,payment_status,payment_method,payment_received_date,sold_date,notes,created_at,stock_account:stock_accounts(id,game_name,account_title,buying_price,selling_price,secret_code), employee:profiles(id,name,email)";
const ADVANCE_SELECT = "id,employee_id,amount_given,date_given,purpose,payment_method,status,notes,created_by,created_at,employee:profiles(id,name,email)";
const ADVANCE_TRANSACTION_SELECT = "id,advance_id,employee_id,type,amount,stock_account_id,transaction_date,notes,created_by,created_at";
const EXPENSE_SELECT = "id,title,category,amount,expense_date,paid_by,notes,created_at,payer:profiles!expenses_paid_by_fkey(id,name,email)";
const STOCK_ACCOUNT_DETAIL_SELECT =
  "id,game_name,account_title,account_details,purchase_source,buying_price,selling_price,image_url,image_urls,secret_code,purchase_date,status,assigned_employee_id,gmail_id,notes,created_by,created_at,updated_at,assigned_employee:profiles!stock_accounts_assigned_employee_id_fkey(id,name,email)";
const DAILY_TASK_SELECT = "id,title,description,task_date,created_by,created_at,creator:profiles!daily_tasks_created_by_fkey(id,name,email)";
const DAILY_TASK_COMPLETION_SELECT = "id,task_id,employee_id,screenshot_url,screenshot_urls,completed_at,employee:profiles(id,name,email),task:daily_tasks(id,title,task_date)";
const ACTIVITY_LOG_SELECT = "id,user_id,action,table_name,record_id,old_data,new_data,created_at,user:profiles(id,name,email)";
const STOCK_ACCOUNT_LIST_SELECT =
  "id,game_name,account_title,account_details,purchase_source,buying_price,selling_price,secret_code,purchase_date,status,assigned_employee_id,gmail_id,notes,created_by,created_at,updated_at,assigned_employee:profiles!stock_accounts_assigned_employee_id_fkey(id,name,email)";
const STOCK_ASSIGNMENT_SELECT = "id,stock_account_id,employee_id,assigned_by,created_at";

type PagedResult<T> = {
  rows: T[];
  total: number;
};

type PageOptions = {
  page?: number;
  pageSize?: number;
  q?: string | null;
};

type StockPageOptions = PageOptions & {
  excludeSold?: boolean;
  assignedOnly?: boolean;
  assignedEmployeeId?: string | null;
  gameName?: string | null;
  sort?: "recent" | "oldest";
};

type ExpensePageOptions = PageOptions & {
  categories?: string[];
  excludeCategories?: string[];
  paidBy?: string | null;
};

type SoldPageOptions = PageOptions & {
  employeeId?: string | null;
  gameName?: string | null;
  paymentStatus?: "paid" | "pending" | "partial" | "not_paid";
  sort?: "recent" | "oldest";
};

type DashboardPeriodOptions = {
  year: number;
  month: number | "all";
  employeeId?: string | null;
};

function pageRange(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.trunc(pageSize) : DEFAULT_PAGE_SIZE;
  const from = (safePage - 1) * safePageSize;
  return { from, to: from + safePageSize - 1 };
}

function searchTerm(q?: string | null) {
  const value = (q ?? "")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.length ? value.replaceAll("%", "\\%").replaceAll("_", "\\_") : null;
}

function compactSearchTerm(term: string) {
  return term.replace(/\s+/g, "");
}

function normalizedSearchText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function searchPieces(term: string) {
  return Array.from(
    new Set(
      term
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .flatMap((piece) => piece.split(/(?<=\D)(?=\d)|(?<=\d)(?=\D)/))
        .map((piece) => piece.trim())
        .filter((piece) => piece.length >= 2)
    )
  );
}

function stockMatchesSearch(account: StockAccount, term: string) {
  const plainNeedle = term.toLowerCase();
  const normalizedNeedle = normalizedSearchText(term);
  const pieces = searchPieces(term);
  const assignmentText = getAssignedProfiles(account)
    .map((employee) => `${employee.name} ${employee.email}`)
    .join(" ");
  const haystack = [
    account.game_name,
    account.account_title,
    account.account_details,
    account.purchase_source,
    account.secret_code,
    account.status,
    account.notes,
    account.assigned_employee?.name,
    account.assigned_employee?.email,
    assignmentText
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const normalizedHaystack = normalizedSearchText(haystack);

  if (haystack.includes(plainNeedle)) return true;
  if (normalizedNeedle && normalizedHaystack.includes(normalizedNeedle)) return true;
  return pieces.length > 0 && pieces.every((piece) => haystack.includes(piece) || normalizedHaystack.includes(piece));
}

function getAssignedProfiles(account: Pick<StockAccount, "assigned_employee_id" | "assigned_employee" | "assignments">) {
  const employees: Array<Pick<Profile, "id" | "name" | "email">> = [];
  const seen = new Set<string>();

  if (account.assigned_employee_id && account.assigned_employee) {
    employees.push(account.assigned_employee);
    seen.add(account.assigned_employee_id);
  }

  for (const assignment of account.assignments ?? []) {
    if (!assignment.employee || seen.has(assignment.employee_id)) continue;
    employees.push(assignment.employee);
    seen.add(assignment.employee_id);
  }

  return employees;
}

export function assignedEmployeeNames(account: Pick<StockAccount, "assigned_employee_id" | "assigned_employee" | "assignments">) {
  return getAssignedProfiles(account).map((employee) => employee.name);
}

export function isAccountAssignedTo(account: Pick<StockAccount, "assigned_employee_id" | "assignments">, employeeId: string | null | undefined) {
  if (!employeeId) return false;
  return account.assigned_employee_id === employeeId || Boolean(account.assignments?.some((assignment) => assignment.employee_id === employeeId));
}

function hasAnyAssignment(account: Pick<StockAccount, "assigned_employee_id" | "assignments">) {
  return Boolean(account.assigned_employee_id || account.assignments?.length);
}

function withLegacyAssignment(account: StockAccount): StockAccount {
  if (!account.assigned_employee_id || !account.assigned_employee) return { ...account, assignments: account.assignments ?? [] };
  const assignments = account.assignments ?? [];
  if (assignments.some((assignment) => assignment.employee_id === account.assigned_employee_id)) {
    return { ...account, assignments };
  }

  return {
    ...account,
    assignments: [
      {
        id: `legacy-${account.id}-${account.assigned_employee_id}`,
        stock_account_id: account.id,
        employee_id: account.assigned_employee_id,
        assigned_by: account.created_by ?? null,
        created_at: account.updated_at ?? account.created_at,
        employee: account.assigned_employee
      },
      ...assignments
    ]
  };
}

async function hydrateStockAssignments(accounts: StockAccount[]) {
  if (!accounts.length) return accounts;
  const baseAccounts = accounts.map((account) => withLegacyAssignment(account));
  if (!hasSupabaseEnv()) return baseAccounts;

  const accountIds = baseAccounts.map((account) => account.id);
  const assignmentClients = hasSupabaseAdminEnv()
    ? [createAdminClient(), await createClient()]
    : [await createClient()];
  const rawAssignments: StockAccountAssignment[] = [];
  let assignmentClient = assignmentClients[0];
  let loadedAssignments = false;

  for (const client of assignmentClients) {
    rawAssignments.length = 0;
    try {
      for (let index = 0; index < accountIds.length; index += 100) {
        const batchIds = accountIds.slice(index, index + 100);
        const { data, error } = await client
          .from("stock_account_assignments")
          .select(STOCK_ASSIGNMENT_SELECT)
          .in("stock_account_id", batchIds);

        if (error) throw error;
        rawAssignments.push(...(((data as unknown as StockAccountAssignment[]) ?? [])));
      }
      assignmentClient = client;
      loadedAssignments = true;
      break;
    } catch {
      // Try the next available server client before falling back to legacy assignment data.
    }
  }

  if (!loadedAssignments) {
    return baseAccounts;
  }

  const employeeIds = Array.from(new Set(rawAssignments.map((assignment) => assignment.employee_id)));
  let profileData: Array<Pick<Profile, "id" | "name" | "email">> = [];
  try {
    if (employeeIds.length) {
      const { data } = await assignmentClient.from("profiles").select("id,name,email").in("id", employeeIds);
      profileData = (data as Array<Pick<Profile, "id" | "name" | "email">>) ?? [];
    }
  } catch {
    profileData = [];
  }
  const profilesById = new Map(
    profileData.map((profile) => [profile.id, profile])
  );

  const assignmentsByAccount = new Map<string, StockAccountAssignment[]>();
  for (const assignment of rawAssignments) {
    const existing = assignmentsByAccount.get(assignment.stock_account_id) ?? [];
    existing.push({
      ...assignment,
      employee: profilesById.get(assignment.employee_id) ?? null
    });
    assignmentsByAccount.set(assignment.stock_account_id, existing);
  }

  return baseAccounts.map((account) =>
    withLegacyAssignment({
      ...account,
      assignments: assignmentsByAccount.get(account.id) ?? account.assignments ?? []
    })
  );
}

function soldMatchesSearch(sale: SoldAccount, term: string) {
  const plainNeedle = term.toLowerCase();
  const normalizedNeedle = normalizedSearchText(term);
  const pieces = searchPieces(term);
  const haystack = [
    sale.stock_account?.secret_code,
    sale.stock_account?.account_title,
    sale.stock_account?.game_name,
    sale.employee?.name,
    sale.employee?.email,
    sale.sold_source_website,
    sale.buyer_contact,
    sale.payment_status,
    sale.payment_method,
    sale.notes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const normalizedHaystack = normalizedSearchText(haystack);

  if (haystack.includes(plainNeedle)) return true;
  if (normalizedNeedle && normalizedHaystack.includes(normalizedNeedle)) return true;
  return pieces.length > 0 && pieces.every((piece) => haystack.includes(piece) || normalizedHaystack.includes(piece));
}

function inFilter(column: string, ids: string[]) {
  return ids.length ? `${column}.in.(${ids.join(",")})` : null;
}

async function getProfileIdsMatchingTerm(supabase: Awaited<ReturnType<typeof createClient>>, term: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
    .limit(100);

  return ((data as Pick<Profile, "id">[]) ?? []).map((profile) => profile.id);
}

async function getStockAccountIdsMatchingTerm(supabase: Awaited<ReturnType<typeof createClient>>, term: string) {
  const compactTerm = compactSearchTerm(term);
  const pieces = searchPieces(term);
  const conditions = [
    `game_name.ilike.%${term}%`,
    `account_title.ilike.%${term}%`,
    `secret_code.ilike.%${term}%`
  ];

  if (compactTerm && compactTerm !== term) conditions.push(`secret_code.ilike.%${compactTerm}%`);
  for (const piece of pieces) {
    conditions.push(`game_name.ilike.%${piece}%`);
    conditions.push(`account_title.ilike.%${piece}%`);
    conditions.push(`secret_code.ilike.%${piece}%`);
  }

  const { data } = await supabase
    .from("stock_accounts")
    .select("id,game_name,account_title,secret_code,status")
    .or(conditions.join(","))
    .limit(500);

  return ((data as StockAccount[]) ?? [])
    .filter((account) => stockMatchesSearch(account, term))
    .map((account) => account.id);
}

function paginateMemory<T>(rows: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): PagedResult<T> {
  const { from, to } = pageRange(page, pageSize);
  return { rows: rows.slice(from, to + 1), total: rows.length };
}

function saleCashDateValue(sale: Pick<SoldAccount, "payment_received_date" | "sold_date">) {
  return sale.payment_received_date ?? sale.sold_date;
}

function inDashboardPeriod(dateValue: string | null | undefined, year: number, month: number | "all") {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getFullYear() !== year) return false;
  return month === "all" || date.getMonth() + 1 === month;
}

function dashboardDateRange(year: number, month: number | "all") {
  const startMonth = month === "all" ? 0 : month - 1;
  const endYear = month === "all" ? year + 1 : month === 12 ? year + 1 : year;
  const endMonth = month === "all" ? 0 : month === 12 ? 0 : month;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(endYear, endMonth, 1));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    currency: normalizeCurrency(settings.currency)
  };
}

export async function getCurrentProfile(): Promise<Profile> {
  if (!hasSupabaseEnv()) {
    const cookieStore = await cookies();
    const profileId = cookieStore.get("demo_profile_id")?.value;
    const profiles = await getDemoProfiles();
    const selectedProfile = profiles.find((profile) => profile.id === profileId);

    if (selectedProfile) return selectedProfile;

    const role = cookieStore.get("demo_role")?.value;
    if (role === "employee") {
      return profiles.find((profile) => profile.role === "employee") ?? profiles[0];
    }
    if (role === "manager") {
      return profiles.find((profile) => profile.role === "manager") ?? profiles[0];
    }
    return profiles.find((profile) => profile.role === "admin") ?? profiles[0];
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("auth_user_id", user.id)
    .single();

  if (error || !data) redirect("/login");
  if ((data as Profile).status !== "active") {
    await supabase.auth.signOut();
    redirect("/login?error=Your%20account%20is%20waiting%20for%20admin%20approval");
  }
  return data as Profile;
}

export async function getSettings(): Promise<Settings> {
  if (!hasSupabaseEnv()) return normalizeSettings(demoSettings);
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select(SETTINGS_SELECT).limit(1).single();
  return normalizeSettings((data as Settings) ?? demoSettings);
}

function normalizeDashboardSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  return {
    ...snapshot,
    currency: normalizeCurrency(snapshot.currency),
    metrics: {
      totalStockAccounts: Number(snapshot.metrics.totalStockAccounts ?? 0),
      totalStockBuyingValue: Number(snapshot.metrics.totalStockBuyingValue ?? 0),
      totalStockSellingValue: Number(snapshot.metrics.totalStockSellingValue ?? 0),
      totalSoldAccounts: Number(snapshot.metrics.totalSoldAccounts ?? 0),
      totalSalesAmount: Number(snapshot.metrics.totalSalesAmount ?? 0),
      waitingPaymentCount: Number(snapshot.metrics.waitingPaymentCount ?? 0),
      waitingPaymentAmount: Number(snapshot.metrics.waitingPaymentAmount ?? 0),
      totalBuyingCost: Number(snapshot.metrics.totalBuyingCost ?? 0),
      totalGrossProfit: Number(snapshot.metrics.totalGrossProfit ?? 0),
      totalExpenses: Number(snapshot.metrics.totalExpenses ?? 0),
      netProfit: Number(snapshot.metrics.netProfit ?? 0),
      monthlyProfit: Number(snapshot.metrics.monthlyProfit ?? 0),
      yearlyProfit: Number(snapshot.metrics.yearlyProfit ?? 0),
      availableGmailCount: Number(snapshot.metrics.availableGmailCount ?? 0),
      usedGmailCount: Number(snapshot.metrics.usedGmailCount ?? 0),
      employeeAdvanceBalance: Number(snapshot.metrics.employeeAdvanceBalance ?? 0)
    },
    monthlySeries: (snapshot.monthlySeries ?? []).map((item) => ({
      month: item.month,
      sales: Number(item.sales),
      profit: Number(item.profit)
    })),
    employeeProfitSeries: (snapshot.employeeProfitSeries ?? []).map((item) => ({
      name: item.name,
      profit: Number(item.profit),
      sales: Number(item.sales)
    })),
    salesBySource: (snapshot.salesBySource ?? []).map((item) => ({
      source: item.source,
      soldCount: Number(item.soldCount),
      totalSales: Number(item.totalSales),
      profit: Number(item.profit)
    })),
    stockValueByGame: (snapshot.stockValueByGame ?? []).map((item) => ({
      game: item.game,
      value: Number(item.value)
    })),
    stockQuantityByGame: (snapshot.stockQuantityByGame ?? []).map((item) => ({
      game: item.game,
      count: Number(item.count)
    })),
    soldValueByGame: (snapshot.soldValueByGame ?? []).map((item) => ({
      game: item.game,
      value: Number(item.value)
    })),
    soldQuantityByGame: (snapshot.soldQuantityByGame ?? []).map((item) => ({
      game: item.game,
      count: Number(item.count)
    }))
  };
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!hasSupabaseEnv()) {
    const [settings, stockAccounts, soldAccounts, gmailAccounts, expenses, advanceTransactions, currentProfile] =
      await Promise.all([
        getSettings(),
        getStockAccounts(),
        getSoldAccounts(),
        getGmailAccounts(),
        getExpenses(),
        getAdvanceTransactions(),
        getCurrentProfile()
      ]);
    const visibleSoldAccounts =
      currentProfile.role === "employee"
        ? soldAccounts.filter((sale) => sale.employee_id === currentProfile.id)
        : soldAccounts;
    const visibleExpenses =
      currentProfile.role === "employee"
        ? expenses.filter((expense) => expense.paid_by === currentProfile.id)
        : expenses;

    return {
      currency: normalizeCurrency(settings.currency),
      role: currentProfile.role,
      metrics: getDashboardMetrics({
        stockAccounts,
        soldAccounts: visibleSoldAccounts,
        gmailAccounts,
        expenses: visibleExpenses,
        advanceTransactions
      }),
      monthlySeries: monthlySeries(visibleSoldAccounts),
      employeeProfitSeries: employeeProfitSeries(soldAccounts),
      salesBySource: salesBySource(visibleSoldAccounts),
      stockValueByGame: stockValueByGame(stockAccounts),
      stockQuantityByGame: stockQuantityByGame(stockAccounts),
      soldValueByGame: soldValueByGame(visibleSoldAccounts).sort((a, b) => b.value - a.value).slice(0, 12),
      soldQuantityByGame: soldQuantityByGame(visibleSoldAccounts).sort((a, b) => b.count - a.count).slice(0, 12)
    };
  }

  const supabase = await createClient();
  const [{ data, error }, stockQuantitySummary] = await Promise.all([
    supabase.rpc("dashboard_snapshot"),
    getStockQuantityByGameSummary()
  ]);

  if (!error && data) {
    return normalizeDashboardSnapshot({
      ...(data as DashboardSnapshot),
      stockQuantityByGame: stockQuantitySummary
    });
  }

  const [settings, stockAccounts, soldAccounts, gmailAccounts, expenses, advanceTransactions, currentProfile] =
    await Promise.all([
      getSettings(),
      getStockAccounts(),
      getSoldAccounts(),
      getGmailAccounts(),
      getExpenses(),
      getAdvanceTransactions(),
      getCurrentProfile()
    ]);
  const visibleSoldAccounts =
    currentProfile.role === "employee"
      ? soldAccounts.filter((sale) => sale.employee_id === currentProfile.id)
      : soldAccounts;
  const visibleExpenses =
    currentProfile.role === "employee"
      ? expenses.filter((expense) => expense.paid_by === currentProfile.id)
      : expenses;

  return {
    currency: normalizeCurrency(settings.currency),
    role: currentProfile.role,
    metrics: getDashboardMetrics({
      stockAccounts,
      soldAccounts: visibleSoldAccounts,
      gmailAccounts,
      expenses: visibleExpenses,
      advanceTransactions
    }),
    monthlySeries: monthlySeries(visibleSoldAccounts),
    employeeProfitSeries: employeeProfitSeries(soldAccounts),
    salesBySource: salesBySource(visibleSoldAccounts),
    stockValueByGame: stockValueByGame(stockAccounts),
    stockQuantityByGame: stockQuantityByGame(stockAccounts),
    soldValueByGame: soldValueByGame(visibleSoldAccounts).sort((a, b) => b.value - a.value).slice(0, 12),
    soldQuantityByGame: soldQuantityByGame(visibleSoldAccounts).sort((a, b) => b.count - a.count).slice(0, 12)
  };
}

function dashboardSalesBySource(sales: SoldAccount[]) {
  const buckets = new Map<string, { source: string; soldCount: number; totalSales: number; profit: number }>();

  for (const sale of sales) {
    const source = sale.sold_source_website?.trim() || "Unknown";
    const key = source.toLowerCase();
    const item = buckets.get(key) ?? {
      source,
      soldCount: 0,
      totalSales: 0,
      profit: 0
    };

    item.soldCount += 1;
    if (isPaidSale(sale)) {
      item.totalSales += Number(sale.sold_amount);
      if (sale.stock_account?.buying_price != null) {
        item.profit += getProfit(sale);
      }
    }
    buckets.set(key, item);
  }

  return Array.from(buckets.values()).sort((a, b) => b.soldCount - a.soldCount || b.totalSales - a.totalSales);
}

async function getDashboardSummaryFallback(options: DashboardPeriodOptions): Promise<DashboardSnapshot> {
  const { year, month } = options;
  const [settings, stockAccounts, soldAccounts, expenses, advanceTransactions, currentProfile] =
    await Promise.all([
      getSettings(),
      getStockAccounts(),
      getSoldAccounts(),
      getExpenses(),
      getAdvanceTransactions(),
      getCurrentProfile()
    ]);
  const visibleSoldAccounts =
    currentProfile.role === "employee"
      ? soldAccounts.filter((sale) => sale.employee_id === currentProfile.id)
      : soldAccounts;
  const visibleExpenses =
    currentProfile.role === "employee"
      ? expenses.filter((expense) => expense.paid_by === currentProfile.id)
      : expenses;
  const visibleAdvanceTransactions =
    currentProfile.role === "employee"
      ? advanceTransactions.filter((transaction) => transaction.employee_id === currentProfile.id)
      : advanceTransactions;
  const visibleStockAccounts =
    currentProfile.role === "employee"
      ? stockAccounts.filter((account) => isAccountAssignedTo(account, currentProfile.id))
      : stockAccounts;
  const activeStockAccounts = visibleStockAccounts.filter((account) => account.status !== "sold");
  const periodPaidSales = visibleSoldAccounts.filter(
    (sale) => isPaidSale(sale) && inDashboardPeriod(saleCashDate(sale), year, month)
  );
  const yearPaidSales = visibleSoldAccounts.filter(
    (sale) => isPaidSale(sale) && inDashboardPeriod(saleCashDate(sale), year, "all")
  );
  const periodWaitingSales = visibleSoldAccounts.filter(
    (sale) => !isPaidSale(sale) && inDashboardPeriod(sale.sold_date, year, month)
  );
  const periodExpenses = visibleExpenses.filter((expense) =>
    inDashboardPeriod(expense.expense_date, year, month)
  );
  const totalSalesAmount = periodPaidSales.reduce((total, sale) => total + Number(sale.sold_amount), 0);
  const totalBuyingCost = periodPaidSales.reduce(
    (total, sale) => total + Number(sale.stock_account?.buying_price ?? 0),
    0
  );
  const totalGrossProfit = totalSalesAmount - totalBuyingCost;
  const totalExpenses = periodExpenses.reduce((total, expense) => total + Number(expense.amount), 0);

  return normalizeDashboardSnapshot({
    currency: normalizeCurrency(settings.currency),
    role: currentProfile.role,
    metrics: {
      totalStockAccounts: activeStockAccounts.length,
      totalStockBuyingValue: activeStockAccounts.reduce((total, account) => total + Number(account.buying_price), 0),
      totalStockSellingValue: activeStockAccounts.reduce((total, account) => total + Number(account.selling_price ?? 0), 0),
      totalSoldAccounts: periodPaidSales.length,
      totalSalesAmount,
      waitingPaymentCount: periodWaitingSales.length,
      waitingPaymentAmount: periodWaitingSales.reduce((total, sale) => total + Number(sale.sold_amount), 0),
      totalBuyingCost,
      totalGrossProfit,
      totalExpenses,
      netProfit: totalGrossProfit - totalExpenses,
      monthlyProfit: totalGrossProfit,
      yearlyProfit: yearPaidSales.reduce((total, sale) => total + getProfit(sale), 0),
      availableGmailCount: 0,
      usedGmailCount: 0,
      employeeAdvanceBalance: visibleAdvanceTransactions.reduce((total, transaction) => {
        if (transaction.type === "money_given") return total + Number(transaction.amount);
        if (transaction.type === "account_purchase" || transaction.type === "money_returned") return total - Number(transaction.amount);
        return total + Number(transaction.amount);
      }, 0)
    },
    monthlySeries: Array.from({ length: 12 }, (_, index) => {
      const monthSales = yearPaidSales.filter((sale) => new Date(saleCashDate(sale)).getMonth() === index);
      return {
        month: new Date(Date.UTC(year, index, 1)).toLocaleString("en", { month: "short" }),
        sales: monthSales.reduce((total, sale) => total + Number(sale.sold_amount), 0),
        profit: monthSales.reduce((total, sale) => total + getProfit(sale), 0)
      };
    }),
    employeeProfitSeries: employeeProfitSeries(periodPaidSales),
    salesBySource: dashboardSalesBySource(visibleSoldAccounts).slice(0, 5),
    stockValueByGame: stockValueByGame(activeStockAccounts).sort((a, b) => b.value - a.value).slice(0, 12),
    stockQuantityByGame: stockQuantityByGame(activeStockAccounts).sort((a, b) => b.count - a.count).slice(0, 12),
    soldValueByGame: soldValueByGame(periodPaidSales).sort((a, b) => b.value - a.value).slice(0, 12),
    soldQuantityByGame: soldQuantityByGame(periodPaidSales).sort((a, b) => b.count - a.count).slice(0, 12)
  });
}

export async function getDashboardSummary(options: DashboardPeriodOptions): Promise<DashboardSnapshot> {
  if (!hasSupabaseEnv()) return getDashboardSummaryFallback(options);

  const month = options.month === "all" ? null : options.month;
  const supabase = await createClient();
  const currentProfile = await getCurrentProfile();
  if (currentProfile.role === "employee") {
    return getDashboardSummaryFallback(options);
  }

  const [{ data, error }, stockQuantitySummary] = await Promise.all([
    supabase.rpc("dashboard_summary", {
      p_year: options.year,
      p_month: month
    }),
    getStockQuantityByGameSummary()
  ]);
  const paidGameSales = await getDashboardPaidSales({
    ...options,
    employeeId: null
  });

  if (!error && data) {
    return normalizeDashboardSnapshot({
      ...(data as DashboardSnapshot),
      stockQuantityByGame: stockQuantitySummary,
      soldValueByGame: soldValueByGame(paidGameSales).sort((a, b) => b.value - a.value).slice(0, 12),
      soldQuantityByGame: soldQuantityByGame(paidGameSales).sort((a, b) => b.count - a.count).slice(0, 12)
    });
  }

  return getDashboardSummaryFallback(options);
}

export async function getProfiles(): Promise<Profile[]> {
  if (!hasSupabaseEnv()) return getDemoProfiles();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PROFILE_SELECT).order("created_at");
  return (data as Profile[]) ?? [];
}

export async function getStockAccounts(): Promise<StockAccount[]> {
  if (!hasSupabaseEnv()) {
    const accounts = await getDemoStockAccounts();
    return hydrateStockAssignments(accounts.map((account) => ({
      ...account,
      image_url: null,
      image_urls: []
    })));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_accounts")
    .select(STOCK_ACCOUNT_LIST_SELECT)
    .order("created_at", { ascending: false });
  return hydrateStockAssignments((data as unknown as StockAccount[]) ?? []);
}

export async function getStockAccountsPage(options: StockPageOptions = {}): Promise<PagedResult<StockAccount>> {
  const {
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    excludeSold = false,
    assignedOnly = false,
    assignedEmployeeId = null,
    gameName = null,
    sort = "recent"
  } = options;
  const term = searchTerm(options.q);

  if (!hasSupabaseEnv()) {
    const rows = (await getStockAccounts()).filter((account) => {
      if (excludeSold && account.status === "sold") return false;
      if (assignedOnly && !hasAnyAssignment(account)) return false;
      if (assignedEmployeeId && !isAccountAssignedTo(account, assignedEmployeeId)) return false;
      if (gameName && account.game_name !== gameName) return false;
      if (!term) return true;
      return stockMatchesSearch(account, term);
    }).sort((a, b) => {
      const left = new Date(a.created_at).getTime();
      const right = new Date(b.created_at).getTime();
      return sort === "oldest" ? left - right : right - left;
    });
    return paginateMemory(rows, page, pageSize);
  }

  const supabase = await createClient();
  const { from, to } = pageRange(page, pageSize);
  let query = supabase
    .from("stock_accounts")
    .select(STOCK_ACCOUNT_LIST_SELECT, { count: "exact" });

  if (excludeSold) query = query.neq("status", "sold");
  if (gameName) query = query.eq("game_name", gameName);
  if (term || assignedOnly || assignedEmployeeId) {
    const rows: StockAccount[] = [];
    const batchSize = 1000;
    let offset = 0;

    while (offset < 20000) {
      let searchQuery = supabase.from("stock_accounts").select(STOCK_ACCOUNT_LIST_SELECT);
      if (excludeSold) searchQuery = searchQuery.neq("status", "sold");
      if (gameName) searchQuery = searchQuery.eq("game_name", gameName);

      const { data } = await searchQuery
        .order("created_at", { ascending: sort === "oldest" })
        .range(offset, offset + batchSize - 1);
      const batch = (data as unknown as StockAccount[]) ?? [];

      rows.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    const hydratedRows = await hydrateStockAssignments(rows);
    const matchedRows = hydratedRows.filter((account) => {
      if (assignedOnly && !hasAnyAssignment(account)) return false;
      if (assignedEmployeeId && !isAccountAssignedTo(account, assignedEmployeeId)) return false;
      return term ? stockMatchesSearch(account, term) : true;
    });
    return paginateMemory(matchedRows, page, pageSize);
  }

  const { data, count } = await query.order("created_at", { ascending: sort === "oldest" }).range(from, to);
  return {
    rows: await hydrateStockAssignments((data as unknown as StockAccount[]) ?? []),
    total: count ?? 0
  };
}

export async function getStockGameNames(options: { excludeSold?: boolean } = {}) {
  if (!hasSupabaseEnv()) {
    const accounts = await getStockAccounts();
    const rows = options.excludeSold ? accounts.filter((account) => account.status !== "sold") : accounts;
    return Array.from(new Set(rows.map((account) => account.game_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  const supabase = await createClient();
  let query = supabase.from("stock_accounts").select("game_name").order("game_name");
  if (options.excludeSold) query = query.neq("status", "sold");
  const { data } = await query;
  return Array.from(
    new Set(((data as Pick<StockAccount, "game_name">[]) ?? []).map((account) => account.game_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

export async function getStockTotals(options: { excludeSold?: boolean } = {}) {
  if (!hasSupabaseEnv()) {
    const accounts = await getStockAccounts();
    const rows = options.excludeSold ? accounts.filter((account) => account.status !== "sold") : accounts;
    const assignedCount = rows.filter((account) => account.status === "assigned" || hasAnyAssignment(account)).length;
    const availableCount = rows.filter((account) => account.status === "available" && !hasAnyAssignment(account)).length;

    return {
      availableCount,
      assignedCount,
      activeCount: availableCount + assignedCount,
      buyingValue: rows.reduce((total, account) => total + Number(account.buying_price), 0),
      sellingValue: rows.reduce((total, account) => total + Number(account.selling_price ?? 0), 0)
    };
  }

  const supabase = await createClient();
  let stockQuery = supabase.from("stock_accounts").select("id,status,buying_price,selling_price,assigned_employee_id");
  if (options.excludeSold) stockQuery = stockQuery.neq("status", "sold");
  const { data: stockData } = await stockQuery;
  const rows = (stockData as Array<Pick<StockAccount, "id" | "status" | "buying_price" | "selling_price" | "assigned_employee_id">>) ?? [];
  const rowIds = new Set(rows.map((account) => account.id));
  const assignmentIds = new Set<string>();

  const assignmentClients = hasSupabaseAdminEnv()
    ? [createAdminClient(), supabase]
    : [supabase];

  for (const client of assignmentClients) {
    try {
      const { data: assignmentData, error } = await client
        .from("stock_account_assignments")
        .select("stock_account_id");

      if (error) throw error;
      for (const assignment of (assignmentData as Array<{ stock_account_id: string }> | null) ?? []) {
        if (rowIds.has(assignment.stock_account_id)) assignmentIds.add(assignment.stock_account_id);
      }
      break;
    } catch {
      // The app can run before the optional multi-assignment table is exposed by Supabase.
    }
  }

  const assignedCount = rows.filter(
    (account) => account.status === "assigned" || Boolean(account.assigned_employee_id) || assignmentIds.has(account.id)
  ).length;
  const availableCount = rows.filter(
    (account) => account.status === "available" && !account.assigned_employee_id && !assignmentIds.has(account.id)
  ).length;

  return {
    availableCount,
    assignedCount,
    activeCount: availableCount + assignedCount,
    buyingValue: rows.reduce((total, account) => total + Number(account.buying_price), 0),
    sellingValue: rows.reduce((total, account) => total + Number(account.selling_price ?? 0), 0)
  };
}

export async function getStockAccount(id: string): Promise<StockAccount | null> {
  if (!hasSupabaseEnv()) {
    const accounts = await getDemoStockAccounts();
    const account = accounts.find((account) => account.id === id) ?? null;
    return account ? (await hydrateStockAssignments([account]))[0] : null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_accounts")
    .select(STOCK_ACCOUNT_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  const account = (data as StockAccount | null) ?? null;
  return account ? (await hydrateStockAssignments([account]))[0] : null;
}

export async function getStockAccountCredential(
  account: StockAccount,
  profile?: Profile
): Promise<StockAccountCredential | null> {
  const currentProfile = profile ?? (await getCurrentProfile());
  const isAssigned = Boolean(account.assigned_employee_id);
  const canViewCredential =
    (isAssigned || hasAnyAssignment(account)) &&
    (currentProfile.role === "admin" ||
      currentProfile.role === "manager" ||
      isAccountAssignedTo(account, currentProfile.id));

  if (!canViewCredential) return null;

  if (!hasSupabaseEnv()) {
    return getDemoStockAccountCredential(account.id);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_account_credentials")
    .select("stock_account_id,gmail_email,encrypted_password,created_at,updated_at")
    .eq("stock_account_id", account.id)
    .maybeSingle();

  if (!data) return null;
  const credential = data as StockAccountCredential;

  return {
    stock_account_id: credential.stock_account_id,
    gmail_email: credential.gmail_email,
    password: credential.encrypted_password ? decryptSecret(credential.encrypted_password) : null,
    created_at: credential.created_at,
    updated_at: credential.updated_at
  };
}

export async function getSoldAccounts(): Promise<SoldAccount[]> {
  if (!hasSupabaseEnv()) return getDemoSoldAccounts();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sold_accounts")
    .select(SOLD_ACCOUNT_SELECT)
    .order("sold_date", { ascending: false });
  return (data as unknown as SoldAccount[]) ?? [];
}

export async function getSoldAccountsPage(options: SoldPageOptions = {}): Promise<PagedResult<SoldAccount>> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, employeeId = null, gameName = null, paymentStatus, sort = "recent" } = options;
  const term = searchTerm(options.q);

  if (!hasSupabaseEnv()) {
    const rows = (await getSoldAccounts()).filter((sale) => {
      if (employeeId && sale.employee_id !== employeeId) return false;
      if (gameName && sale.stock_account?.game_name !== gameName) return false;
      if (paymentStatus === "not_paid" && sale.payment_status === "paid") return false;
      if (paymentStatus && paymentStatus !== "not_paid" && sale.payment_status !== paymentStatus) return false;
      if (!term) return true;
      return soldMatchesSearch(sale, term);
    }).sort((a, b) => {
      const left = new Date(a.sold_date ?? a.created_at).getTime();
      const right = new Date(b.sold_date ?? b.created_at).getTime();
      return sort === "oldest" ? left - right : right - left;
    });
    return paginateMemory(rows, page, pageSize);
  }

  const supabase = await createClient();
  const { from, to } = pageRange(page, pageSize);
  let query = supabase
    .from("sold_accounts")
    .select(SOLD_ACCOUNT_SELECT, { count: "exact" });

  if (employeeId) query = query.eq("employee_id", employeeId);
  if (paymentStatus === "not_paid") query = query.neq("payment_status", "paid");
  if (paymentStatus && paymentStatus !== "not_paid") query = query.eq("payment_status", paymentStatus);

  if (term || gameName) {
    const rows: SoldAccount[] = [];
    const batchSize = 1000;
    let offset = 0;

    while (offset < 20000) {
      let searchQuery = supabase.from("sold_accounts").select(SOLD_ACCOUNT_SELECT);
      if (employeeId) searchQuery = searchQuery.eq("employee_id", employeeId);
      if (paymentStatus === "not_paid") searchQuery = searchQuery.neq("payment_status", "paid");
      if (paymentStatus && paymentStatus !== "not_paid") searchQuery = searchQuery.eq("payment_status", paymentStatus);

      const { data } = await searchQuery
        .order("sold_date", { ascending: sort === "oldest" })
        .range(offset, offset + batchSize - 1);
      const batch = (data as unknown as SoldAccount[]) ?? [];

      rows.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    const matchedRows = rows.filter((sale) => {
      if (gameName && sale.stock_account?.game_name !== gameName) return false;
      if (!term) return true;
      return soldMatchesSearch(sale, term);
    });
    return paginateMemory(matchedRows, page, pageSize);
  }

  const { data, count } = await query.order("sold_date", { ascending: sort === "oldest" }).range(from, to);
  return {
    rows: (data as unknown as SoldAccount[]) ?? [],
    total: count ?? 0
  };
}

export async function getDashboardPaidSales(options: DashboardPeriodOptions): Promise<SoldAccount[]> {
  const { year, month, employeeId = null } = options;

  if (!hasSupabaseEnv()) {
    return (await getDemoSoldAccounts()).filter((sale) => {
      if (sale.payment_status !== "paid") return false;
      if (employeeId && sale.employee_id !== employeeId) return false;
      return inDashboardPeriod(saleCashDateValue(sale), year, month);
    });
  }

  const supabase = await createClient();
  let query = supabase
    .from("sold_accounts")
    .select("id,stock_account_id,employee_id,sold_amount,sold_source_website,buyer_contact,payment_status,payment_method,payment_received_date,sold_date,notes,created_at,stock_account:stock_accounts(id,game_name,account_title,buying_price,selling_price,secret_code), employee:profiles(id,name,email)")
    .eq("payment_status", "paid")
    .order("sold_date", { ascending: false })
    .limit(2000);

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data } = await query;
  return ((data as unknown as SoldAccount[]) ?? []).filter((sale) =>
    inDashboardPeriod(saleCashDateValue(sale), year, month)
  );
}

export async function getDashboardSourceSales(options: { employeeId?: string | null } = {}): Promise<SoldAccount[]> {
  const { employeeId = null } = options;

  if (!hasSupabaseEnv()) {
    return (await getDemoSoldAccounts()).filter((sale) => !employeeId || sale.employee_id === employeeId);
  }

  const supabase = await createClient();
  let query = supabase
    .from("sold_accounts")
    .select(SOLD_ACCOUNT_SELECT)
    .order("sold_date", { ascending: false })
    .limit(5000);

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data, error } = await query;
  if (!error) return (data as unknown as SoldAccount[]) ?? [];

  let fallbackQuery = supabase
    .from("sold_accounts")
    .select("id,stock_account_id,employee_id,sold_amount,sold_source_website,payment_status,sold_date,created_at")
    .order("sold_date", { ascending: false })
    .limit(5000);

  if (employeeId) fallbackQuery = fallbackQuery.eq("employee_id", employeeId);

  const { data: fallbackData } = await fallbackQuery;
  const fallbackSales = ((fallbackData as unknown as SoldAccount[]) ?? []).map((sale) => ({
    ...sale,
    stock_account: null,
    employee: null
  }));

  return fallbackSales;
}

export async function getDashboardWaitingSales(options: DashboardPeriodOptions & { limit?: number }): Promise<SoldAccount[]> {
  const { year, month, employeeId = null, limit = 8 } = options;

  if (!hasSupabaseEnv()) {
    return (await getDemoSoldAccounts())
      .filter((sale) => {
        if (sale.payment_status === "paid") return false;
        if (employeeId && sale.employee_id !== employeeId) return false;
        return inDashboardPeriod(sale.sold_date, year, month);
      })
      .slice(0, limit);
  }

  const supabase = await createClient();
  let query = supabase
    .from("sold_accounts")
    .select("id,stock_account_id,employee_id,sold_amount,sold_source_website,buyer_contact,payment_status,payment_method,payment_received_date,sold_date,notes,created_at,stock_account:stock_accounts(id,game_name,account_title,buying_price,selling_price,secret_code), employee:profiles(id,name,email)")
    .neq("payment_status", "paid")
    .order("sold_date", { ascending: false })
    .limit(200);

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data } = await query;
  return ((data as unknown as SoldAccount[]) ?? [])
    .filter((sale) => inDashboardPeriod(sale.sold_date, year, month))
    .slice(0, limit);
}

export async function getDashboardWaitingPaymentSummary(options: DashboardPeriodOptions) {
  const { year, month, employeeId = null } = options;

  if (!hasSupabaseEnv()) {
    const rows = (await getDemoSoldAccounts()).filter((sale) => {
      if (sale.payment_status === "paid") return false;
      if (employeeId && sale.employee_id !== employeeId) return false;
      return inDashboardPeriod(sale.sold_date, year, month);
    });

    return {
      count: rows.length,
      amount: rows.reduce((total, sale) => total + Number(sale.sold_amount), 0)
    };
  }

  const supabase = await createClient();
  const range = dashboardDateRange(year, month);
  let query = supabase
    .from("sold_accounts")
    .select("sold_amount,sold_date")
    .neq("payment_status", "paid")
    .gte("sold_date", range.start)
    .lt("sold_date", range.end)
    .limit(5000);

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data } = await query;
  const rows = (data as Pick<SoldAccount, "sold_amount" | "sold_date">[]) ?? [];

  return {
    count: rows.length,
    amount: rows.reduce((total, sale) => total + Number(sale.sold_amount), 0)
  };
}

export async function getDashboardExpenseTotal(options: DashboardPeriodOptions & { paidBy?: string | null }) {
  const { year, month, paidBy = null } = options;

  if (!hasSupabaseEnv()) {
    return (await getDemoExpenses())
      .filter((expense) => {
        if (paidBy && expense.paid_by !== paidBy) return false;
        return inDashboardPeriod(expense.expense_date, year, month);
      })
      .reduce((total, expense) => total + Number(expense.amount), 0);
  }

  const supabase = await createClient();
  let query = supabase.from("expenses").select("amount,expense_date").limit(2000);
  if (paidBy) query = query.eq("paid_by", paidBy);
  const { data } = await query;
  return ((data as Pick<Expense, "amount" | "expense_date">[]) ?? [])
    .filter((expense) => inDashboardPeriod(expense.expense_date, year, month))
    .reduce((total, expense) => total + Number(expense.amount), 0);
}

export async function getStockValueByGameSummary() {
  if (!hasSupabaseEnv()) return stockValueByGame(await getStockAccounts());

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_accounts")
    .select("game_name,buying_price")
    .neq("status", "sold");
  const rows = (data as Pick<StockAccount, "game_name" | "buying_price">[]) ?? [];
  const buckets = new Map<string, { game: string; value: number }>();

  for (const account of rows) {
    const item = buckets.get(account.game_name) ?? { game: account.game_name, value: 0 };
    item.value += Number(account.buying_price);
    buckets.set(account.game_name, item);
  }

  return Array.from(buckets.values());
}

export async function getStockQuantityByGameSummary() {
  if (!hasSupabaseEnv()) return stockQuantityByGame(await getStockAccounts());

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_accounts")
    .select("game_name")
    .neq("status", "sold");
  const rows = (data as Pick<StockAccount, "game_name">[]) ?? [];
  const buckets = new Map<string, { game: string; count: number }>();

  for (const account of rows) {
    const item = buckets.get(account.game_name) ?? { game: account.game_name, count: 0 };
    item.count += 1;
    buckets.set(account.game_name, item);
  }

  return Array.from(buckets.values()).sort((a, b) => b.count - a.count).slice(0, 12);
}

export async function getMonthlyLeaderboard(year: number, month: number): Promise<LeaderboardEntry[]> {
  if (!hasSupabaseEnv()) {
    const [profiles, soldAccounts, dailyTasks, taskCompletions] = await Promise.all([
      getDemoProfiles(),
      getDemoSoldAccounts(),
      getDemoDailyTasks(),
      getDemoDailyTaskCompletions()
    ]);
    const monthlyTasks = dailyTasks.filter((task) => {
      const taskDate = new Date(task.task_date);
      return taskDate.getFullYear() === year && taskDate.getMonth() + 1 === month;
    });

    return profiles
      .filter((profile) => profile.role !== "admin" && profile.status === "active")
      .map((profile) => {
        const employeeSales = soldAccounts.filter((sale) => {
          const soldDate = new Date(sale.sold_date);
          return (
            sale.payment_status === "paid" &&
            sale.employee_id === profile.id &&
            soldDate.getFullYear() === year &&
            soldDate.getMonth() + 1 === month
          );
        });
        const completedTaskCount = taskCompletions.filter(
          (completion) =>
            completion.employee_id === profile.id &&
            monthlyTasks.some((task) => task.id === completion.task_id)
        ).length;
        const taskCompletionRate = monthlyTasks.length
          ? Math.round((completedTaskCount / monthlyTasks.length) * 100)
          : 0;

        return {
          employee_id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          status: profile.status,
          sold_count: employeeSales.length,
          total_sales: employeeSales.reduce((total, sale) => total + Number(sale.sold_amount), 0),
          task_completed_count: completedTaskCount,
          task_total_count: monthlyTasks.length,
          task_completion_rate: taskCompletionRate,
          last_sale: employeeSales
            .map((sale) => sale.sold_date)
            .sort()
            .at(-1) ?? null
        };
      })
      .sort((a, b) => b.sold_count - a.sold_count || b.total_sales - a.total_sales || a.name.localeCompare(b.name));
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("monthly_leaderboard", {
    p_year: year,
    p_month: month
  });

  return ((data as LeaderboardEntry[]) ?? []).map((entry) => ({
    ...entry,
    sold_count: Number(entry.sold_count),
    total_sales: Number(entry.total_sales),
    task_completed_count: Number(entry.task_completed_count ?? 0),
    task_total_count: Number(entry.task_total_count ?? 0),
    task_completion_rate: Number(entry.task_completion_rate ?? 0)
  }));
}

export async function getDailyTasks(): Promise<DailyTask[]> {
  if (!hasSupabaseEnv()) return getDemoDailyTasks();
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_tasks")
    .select(DAILY_TASK_SELECT)
    .order("task_date", { ascending: false });
  return (data as unknown as DailyTask[]) ?? [];
}

export async function getDailyTaskCompletions(): Promise<DailyTaskCompletion[]> {
  if (!hasSupabaseEnv()) return getDemoDailyTaskCompletions();
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_task_completions")
    .select(DAILY_TASK_COMPLETION_SELECT)
    .order("completed_at", { ascending: false });
  return (data as unknown as DailyTaskCompletion[]) ?? [];
}

export async function getGmailAccounts(): Promise<GmailAccount[]> {
  if (!hasSupabaseEnv()) return getDemoGmailAccounts();
  const supabase = await createClient();
  const { data } = await supabase
    .from("gmail_inventory")
    .select("id,email,recovery_info,status,used_for_stock_account_id,date_added,date_used,notes,created_at")
    .order("created_at", { ascending: false });
  return (data as GmailAccount[]) ?? [];
}

export async function getAdvances(): Promise<EmployeeAdvance[]> {
  if (!hasSupabaseEnv()) return demoAdvances;
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_advances")
    .select(ADVANCE_SELECT)
    .order("created_at", { ascending: false });
  return (data as unknown as EmployeeAdvance[]) ?? [];
}

export async function getAdvanceTransactions(): Promise<AdvanceTransaction[]> {
  if (!hasSupabaseEnv()) return demoAdvanceTransactions;
  const supabase = await createClient();
  const { data } = await supabase
    .from("advance_transactions")
    .select(ADVANCE_TRANSACTION_SELECT)
    .order("transaction_date", { ascending: false });
  return (data as AdvanceTransaction[]) ?? [];
}

export async function getExpenses(): Promise<Expense[]> {
  if (!hasSupabaseEnv()) return getDemoExpenses();
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .order("expense_date", { ascending: false });
  return (data as unknown as Expense[]) ?? [];
}

export async function getExpensesPage(options: ExpensePageOptions = {}): Promise<PagedResult<Expense>> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, categories, excludeCategories, paidBy = null } = options;
  const term = searchTerm(options.q);

  if (!hasSupabaseEnv()) {
    const rows = (await getExpenses()).filter((expense) => {
      if (paidBy && expense.paid_by !== paidBy) return false;
      if (categories?.length && !categories.includes(expense.category)) return false;
      if (excludeCategories?.length && excludeCategories.includes(expense.category)) return false;
      if (!term) return true;
      const haystack = `${expense.title} ${expense.category} ${expense.payer?.name ?? ""} ${expense.notes ?? ""}`.toLowerCase();
      return haystack.includes(term.toLowerCase());
    });
    return paginateMemory(rows, page, pageSize);
  }

  const supabase = await createClient();
  const { from, to } = pageRange(page, pageSize);
  let query = supabase
    .from("expenses")
    .select(EXPENSE_SELECT, { count: "exact" });

  if (paidBy) query = query.eq("paid_by", paidBy);
  if (categories?.length) query = query.in("category", categories);
  if (excludeCategories?.length) query = query.not("category", "in", `(${excludeCategories.join(",")})`);
  if (term) {
    const payerIds = await getProfileIdsMatchingTerm(supabase, term);
    const conditions = [
      `title.ilike.%${term}%`,
      `category.ilike.%${term}%`,
      `notes.ilike.%${term}%`,
      inFilter("paid_by", payerIds)
    ].filter(Boolean);

    query = query.or(conditions.join(","));
  }

  const { data, count } = await query.order("expense_date", { ascending: false }).range(from, to);
  return {
    rows: (data as unknown as Expense[]) ?? [],
    total: count ?? 0
  };
}

export async function getExpenseTotals(options: Omit<ExpensePageOptions, "page" | "pageSize" | "q"> = {}) {
  const { categories, excludeCategories, paidBy = null } = options;

  if (!hasSupabaseEnv()) {
    const expenses = (await getExpenses()).filter((expense) => {
      if (paidBy && expense.paid_by !== paidBy) return false;
      if (categories?.length && !categories.includes(expense.category)) return false;
      if (excludeCategories?.length && excludeCategories.includes(expense.category)) return false;
      return true;
    });
    return {
      total: expenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
      byCategory: Object.fromEntries(
        categories?.map((category) => [
          category,
          expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount), 0)
        ]) ?? []
      )
    };
  }

  const supabase = await createClient();
  let query = supabase.from("expenses").select("category,amount");
  if (paidBy) query = query.eq("paid_by", paidBy);
  if (categories?.length) query = query.in("category", categories);
  if (excludeCategories?.length) query = query.not("category", "in", `(${excludeCategories.join(",")})`);
  const { data } = await query;
  const expenses = (data as Pick<Expense, "category" | "amount">[]) ?? [];

  return {
    total: expenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
    byCategory: Object.fromEntries(
      categories?.map((category) => [
        category,
        expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount), 0)
      ]) ?? []
    )
  };
}

export async function getActivityLogs(): Promise<ActivityLog[]> {
  if (!hasSupabaseEnv()) return demoActivityLogs;
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_logs")
    .select(ACTIVITY_LOG_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as unknown as ActivityLog[]) ?? [];
}
