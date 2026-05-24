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
