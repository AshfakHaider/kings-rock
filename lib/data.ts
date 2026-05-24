import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
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
  StockAccountCredential
} from "@/lib/types";
import {
  employeeProfitSeries,
  getDashboardMetrics,
  monthlySeries,
  salesBySource,
  stockValueByGame
} from "@/lib/metrics";
import { normalizeCurrency } from "@/lib/utils";

export const DEFAULT_PAGE_SIZE = 50;

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
  assignedEmployeeId?: string | null;
  sort?: "recent" | "oldest";
};

type ExpensePageOptions = PageOptions & {
  categories?: string[];
  excludeCategories?: string[];
  paidBy?: string | null;
};

type SoldPageOptions = PageOptions & {
  employeeId?: string | null;
  paymentStatus?: "paid" | "pending" | "partial" | "not_paid";
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
  const value = (q ?? "").trim();
  return value.length ? value.replaceAll("%", "\\%").replaceAll("_", "\\_") : null;
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
    .select("*")
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
  const { data } = await supabase.from("settings").select("*").limit(1).single();
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
      stockValueByGame: stockValueByGame(stockAccounts)
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_snapshot");

  if (!error && data) {
    return normalizeDashboardSnapshot(data as DashboardSnapshot);
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
    stockValueByGame: stockValueByGame(stockAccounts)
  };
}

export async function getProfiles(): Promise<Profile[]> {
  if (!hasSupabaseEnv()) return getDemoProfiles();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  return (data as Profile[]) ?? [];
}

export async function getStockAccounts(): Promise<StockAccount[]> {
  if (!hasSupabaseEnv()) {
    const accounts = await getDemoStockAccounts();
    return accounts.map((account) => ({
      ...account,
      image_url: null,
      image_urls: []
    }));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_accounts")
    .select("id,game_name,account_title,account_details,purchase_source,buying_price,selling_price,secret_code,purchase_date,status,assigned_employee_id,gmail_id,notes,created_by,created_at,updated_at,assigned_employee:profiles!stock_accounts_assigned_employee_id_fkey(id,name,email)")
    .order("created_at", { ascending: false });
  return (data as unknown as StockAccount[]) ?? [];
}

export async function getStockAccountsPage(options: StockPageOptions = {}): Promise<PagedResult<StockAccount>> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, excludeSold = false, assignedEmployeeId = null, sort = "recent" } = options;
  const term = searchTerm(options.q);

  if (!hasSupabaseEnv()) {
    const rows = (await getStockAccounts()).filter((account) => {
      if (excludeSold && account.status === "sold") return false;
      if (assignedEmployeeId && account.assigned_employee_id !== assignedEmployeeId) return false;
      if (!term) return true;
      const haystack = `${account.game_name} ${account.account_title} ${account.secret_code ?? ""} ${account.status} ${account.assigned_employee?.name ?? ""}`.toLowerCase();
      return haystack.includes(term.toLowerCase());
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
    .select("id,game_name,account_title,account_details,purchase_source,buying_price,selling_price,secret_code,purchase_date,status,assigned_employee_id,gmail_id,notes,created_by,created_at,updated_at,assigned_employee:profiles!stock_accounts_assigned_employee_id_fkey(id,name,email)", { count: "exact" });

  if (excludeSold) query = query.neq("status", "sold");
  if (assignedEmployeeId) query = query.eq("assigned_employee_id", assignedEmployeeId);
  if (term) {
    query = query.or(`game_name.ilike.%${term}%,account_title.ilike.%${term}%,secret_code.ilike.%${term}%,status.ilike.%${term}%`);
  }

  const { data, count } = await query.order("created_at", { ascending: sort === "oldest" }).range(from, to);
  return {
    rows: (data as unknown as StockAccount[]) ?? [],
    total: count ?? 0
  };
}

export async function getStockTotals(options: { excludeSold?: boolean } = {}) {
  if (!hasSupabaseEnv()) {
    const accounts = await getStockAccounts();
    const rows = options.excludeSold ? accounts.filter((account) => account.status !== "sold") : accounts;
    const assignedCount = rows.filter((account) => account.status === "assigned" || Boolean(account.assigned_employee_id)).length;
    const availableCount = rows.filter((account) => account.status === "available" && !account.assigned_employee_id).length;
    return {
      availableCount,
      assignedCount,
      activeCount: availableCount + assignedCount,
      buyingValue: rows.reduce((total, account) => total + Number(account.buying_price), 0),
      sellingValue: rows.reduce((total, account) => total + Number(account.selling_price ?? 0), 0)
    };
  }

  const supabase = await createClient();
  let query = supabase.from("stock_accounts").select("status,buying_price,selling_price,assigned_employee_id");
  if (options.excludeSold) query = query.neq("status", "sold");
  const { data } = await query;
  const rows = (data as Pick<StockAccount, "status" | "buying_price" | "selling_price" | "assigned_employee_id">[]) ?? [];
  const assignedCount = rows.filter((account) => account.status === "assigned" || Boolean(account.assigned_employee_id)).length;
  const availableCount = rows.filter((account) => account.status === "available" && !account.assigned_employee_id).length;

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
    return accounts.find((account) => account.id === id) ?? null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_accounts")
    .select("*, assigned_employee:profiles!stock_accounts_assigned_employee_id_fkey(id,name,email)")
    .eq("id", id)
    .maybeSingle();

  return (data as StockAccount | null) ?? null;
}

export async function getStockAccountCredential(
  account: StockAccount,
  profile?: Profile
): Promise<StockAccountCredential | null> {
  const currentProfile = profile ?? (await getCurrentProfile());
  const isAssigned = Boolean(account.assigned_employee_id);
  const canViewCredential =
    isAssigned &&
    (currentProfile.role === "admin" ||
      currentProfile.role === "manager" ||
      account.assigned_employee_id === currentProfile.id);

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
    .select("*, stock_account:stock_accounts(id,game_name,account_title,buying_price,selling_price,secret_code), employee:profiles(id,name,email)")
    .order("sold_date", { ascending: false });
  return (data as SoldAccount[]) ?? [];
}

export async function getSoldAccountsPage(options: SoldPageOptions = {}): Promise<PagedResult<SoldAccount>> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, employeeId = null, paymentStatus } = options;
  const term = searchTerm(options.q);

  if (!hasSupabaseEnv()) {
    const rows = (await getSoldAccounts()).filter((sale) => {
      if (employeeId && sale.employee_id !== employeeId) return false;
      if (paymentStatus === "not_paid" && sale.payment_status === "paid") return false;
      if (paymentStatus && paymentStatus !== "not_paid" && sale.payment_status !== paymentStatus) return false;
      if (!term) return true;
      const haystack = `${sale.stock_account?.secret_code ?? ""} ${sale.stock_account?.account_title ?? ""} ${sale.stock_account?.game_name ?? ""} ${sale.employee?.name ?? ""} ${sale.employee?.email ?? ""} ${sale.sold_source_website ?? ""} ${sale.buyer_contact ?? ""} ${sale.payment_status}`.toLowerCase();
      return haystack.includes(term.toLowerCase());
    });
    return paginateMemory(rows, page, pageSize);
  }

  const supabase = await createClient();
  const { from, to } = pageRange(page, pageSize);
  let query = supabase
    .from("sold_accounts")
    .select("*, stock_account:stock_accounts(id,game_name,account_title,buying_price,selling_price,secret_code), employee:profiles(id,name,email)", { count: "exact" });

  if (employeeId) query = query.eq("employee_id", employeeId);
  if (paymentStatus === "not_paid") query = query.neq("payment_status", "paid");
  if (paymentStatus && paymentStatus !== "not_paid") query = query.eq("payment_status", paymentStatus);
  if (term) {
    query = query.or(`sold_source_website.ilike.%${term}%,buyer_contact.ilike.%${term}%,payment_status.ilike.%${term}%,notes.ilike.%${term}%`);
  }

  const { data, count } = await query.order("sold_date", { ascending: false }).range(from, to);
  return {
    rows: (data as SoldAccount[]) ?? [],
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
    .select("*, creator:profiles!daily_tasks_created_by_fkey(id,name,email)")
    .order("task_date", { ascending: false });
  return (data as DailyTask[]) ?? [];
}

export async function getDailyTaskCompletions(): Promise<DailyTaskCompletion[]> {
  if (!hasSupabaseEnv()) return getDemoDailyTaskCompletions();
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_task_completions")
    .select("*, employee:profiles(id,name,email), task:daily_tasks(id,title,task_date)")
    .order("completed_at", { ascending: false });
  return (data as DailyTaskCompletion[]) ?? [];
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
    .select("*, employee:profiles(id,name,email)")
    .order("created_at", { ascending: false });
  return (data as EmployeeAdvance[]) ?? [];
}

export async function getAdvanceTransactions(): Promise<AdvanceTransaction[]> {
  if (!hasSupabaseEnv()) return demoAdvanceTransactions;
  const supabase = await createClient();
  const { data } = await supabase
    .from("advance_transactions")
    .select("*")
    .order("transaction_date", { ascending: false });
  return (data as AdvanceTransaction[]) ?? [];
}

export async function getExpenses(): Promise<Expense[]> {
  if (!hasSupabaseEnv()) return getDemoExpenses();
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("*, payer:profiles!expenses_paid_by_fkey(id,name,email)")
    .order("expense_date", { ascending: false });
  return (data as Expense[]) ?? [];
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
    .select("*, payer:profiles!expenses_paid_by_fkey(id,name,email)", { count: "exact" });

  if (paidBy) query = query.eq("paid_by", paidBy);
  if (categories?.length) query = query.in("category", categories);
  if (excludeCategories?.length) query = query.not("category", "in", `(${excludeCategories.join(",")})`);
  if (term) {
    query = query.or(`title.ilike.%${term}%,category.ilike.%${term}%,notes.ilike.%${term}%`);
  }

  const { data, count } = await query.order("expense_date", { ascending: false }).range(from, to);
  return {
    rows: (data as Expense[]) ?? [],
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
    .select("*, user:profiles(id,name,email)")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as ActivityLog[]) ?? [];
}
