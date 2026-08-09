export type Role = "admin" | "manager" | "employee";
export type AccountStatus = "available" | "assigned" | "sold" | "hold" | "problem";
export type GmailStatus = "fresh" | "used" | "problem";
export type PaymentStatus = "paid" | "pending" | "partial";
export type AdvanceStatus = "open" | "partial" | "settled";
export type AdvanceTransactionType =
  | "money_given"
  | "account_purchase"
  | "money_returned"
  | "adjustment";

export type Profile = {
  id: string;
  auth_user_id?: string | null;
  name: string;
  phone?: string | null;
  email: string;
  role: Role;
  status: "active" | "inactive";
  join_date: string;
  notes?: string | null;
  created_at: string;
};

export type StockAccount = {
  id: string;
  game_name: string;
  account_title: string;
  account_details?: string | null;
  purchase_source?: string | null;
  buying_price: number;
  selling_price?: number | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  secret_code?: string | null;
  purchase_date: string;
  status: AccountStatus;
  assigned_employee_id?: string | null;
  gmail_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  assigned_employee?: Pick<Profile, "id" | "name" | "email"> | null;
};

export type StockAccountCredential = {
  stock_account_id: string;
  gmail_email: string;
  password?: string | null;
  encrypted_password?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SoldAccount = {
  id: string;
  stock_account_id: string;
  employee_id: string;
  sold_amount: number;
  sold_source_website?: string | null;
  buyer_contact?: string | null;
  payment_status: PaymentStatus;
  payment_method?: string | null;
  payment_received_date?: string | null;
  sold_date: string;
  notes?: string | null;
  created_at: string;
  stock_account?: Pick<StockAccount, "id" | "game_name" | "account_title" | "buying_price" | "secret_code" | "selling_price"> | null;
  employee?: Pick<Profile, "id" | "name" | "email"> | null;
};

export type LeaderboardEntry = {
  employee_id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "inactive";
  sold_count: number;
  total_sales: number;
  task_completed_count: number;
  task_total_count: number;
  task_completion_rate: number;
  last_sale: string | null;
};

export type DailyTask = {
  id: string;
  title: string;
  description?: string | null;
  task_date: string;
  created_by?: string | null;
  created_at: string;
  creator?: Pick<Profile, "id" | "name" | "email"> | null;
};

export type DailyTaskCompletion = {
  id: string;
  task_id: string;
  employee_id: string;
  screenshot_url?: string | null;
  screenshot_urls?: string[] | null;
  completed_at: string;
  task?: Pick<DailyTask, "id" | "title" | "task_date"> | null;
  employee?: Pick<Profile, "id" | "name" | "email"> | null;
};

export type GmailAccount = {
  id: string;
  email: string;
  recovery_info?: string | null;
  status: GmailStatus;
  used_for_stock_account_id?: string | null;
  date_added: string;
  date_used?: string | null;
  notes?: string | null;
  created_at: string;
};

export type EmployeeAdvance = {
  id: string;
  employee_id: string;
  amount_given: number;
  date_given: string;
  purpose?: string | null;
  payment_method?: string | null;
  status: AdvanceStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  employee?: Pick<Profile, "id" | "name" | "email"> | null;
};

export type AdvanceTransaction = {
  id: string;
  advance_id: string;
  employee_id: string;
  type: AdvanceTransactionType;
  amount: number;
  stock_account_id?: string | null;
  transaction_date: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  title: string;
  category:
    | "gmail_purchase"
    | "ads"
    | "website_fee"
    | "employee_payment"
    | "scam_account"
    | "refund_account"
    | "other";
  amount: number;
  expense_date: string;
  paid_by?: string | null;
  notes?: string | null;
  created_at: string;
  payer?: Pick<Profile, "id" | "name" | "email"> | null;
};

export type ActivityLog = {
  id: string;
  user_id?: string | null;
  action: string;
  table_name: string;
  record_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  created_at: string;
  user?: Pick<Profile, "id" | "name" | "email"> | null;
};

export type Settings = {
  id: string;
  business_name: string;
  currency: string;
  game_categories: string[];
  sale_source_websites: string[];
  expense_categories: string[];
  employee_permissions: Record<string, unknown>;
};

export type DashboardSnapshot = {
  currency: string;
  role: Role;
  metrics: {
    totalStockAccounts: number;
    totalStockBuyingValue: number;
    totalStockSellingValue: number;
    totalSoldAccounts: number;
    totalSalesAmount: number;
    waitingPaymentCount: number;
    waitingPaymentAmount: number;
    totalBuyingCost: number;
    totalGrossProfit: number;
    totalExpenses: number;
    netProfit: number;
    monthlyProfit: number;
    yearlyProfit: number;
    availableGmailCount: number;
    usedGmailCount: number;
    employeeAdvanceBalance: number;
  };
  monthlySeries: Array<{ month: string; sales: number; profit: number }>;
  employeeProfitSeries: Array<{ name: string; profit: number; sales: number }>;
  stockValueByGame: Array<{ game: string; value: number }>;
  stockQuantityByGame: Array<{ game: string; count: number }>;
  soldValueByGame: Array<{ game: string; value: number }>;
  soldQuantityByGame: Array<{ game: string; count: number }>;
  salesBySource: Array<{ source: string; soldCount: number; totalSales: number; profit: number }>;
};
