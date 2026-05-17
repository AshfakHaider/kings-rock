import type {
  ActivityLog,
  AdvanceTransaction,
  EmployeeAdvance,
  Expense,
  GmailAccount,
  Profile,
  Settings,
  SoldAccount,
  StockAccount
} from "@/lib/types";

export const demoProfiles: Profile[] = [
  {
    id: "admin-demo",
    name: "Admin Owner",
    email: "admin@example.com",
    phone: "+8801700000001",
    role: "admin",
    status: "active",
    join_date: "2026-01-01",
    notes: "Demo owner",
    created_at: "2026-01-01T00:00:00Z"
  },
  {
    id: "manager-demo",
    name: "Mina Manager",
    email: "manager@example.com",
    phone: "+8801700000002",
    role: "manager",
    status: "active",
    join_date: "2026-01-10",
    notes: "Demo manager",
    created_at: "2026-01-10T00:00:00Z"
  },
  {
    id: "employee-demo",
    name: "Rafi Seller",
    email: "employee@example.com",
    phone: "+8801700000003",
    role: "employee",
    status: "active",
    join_date: "2026-02-01",
    notes: "Demo seller",
    created_at: "2026-02-01T00:00:00Z"
  }
];

export const demoStockAccounts: StockAccount[] = [
  {
    id: "stock-1",
    game_name: "PUBG",
    account_title: "PUBG Conqueror S18",
    account_details: "High tier account with rare skins",
    purchase_source: "Agent Karim",
    buying_price: 18500,
    selling_price: 24500,
    image_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
    image_urls: [
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=1200&auto=format&fit=crop"
    ],
    secret_code: "pubg1801",
    purchase_date: "2026-05-01",
    status: "assigned",
    assigned_employee_id: "employee-demo",
    gmail_id: "gmail-2",
    notes: "Ready to sell",
    created_by: "admin-demo",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
    assigned_employee: demoProfiles[2]
  },
  {
    id: "stock-2",
    game_name: "Free Fire",
    account_title: "FF Elite Pass Bundle",
    account_details: "Multiple elite passes and weapons",
    purchase_source: "Facebook seller",
    buying_price: 7200,
    selling_price: 9800,
    image_url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop",
    image_urls: [
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop"
    ],
    secret_code: "ff7206",
    purchase_date: "2026-05-06",
    status: "available",
    assigned_employee_id: null,
    gmail_id: null,
    notes: "Fresh stock",
    created_by: "manager-demo",
    created_at: "2026-05-06T10:00:00Z",
    updated_at: "2026-05-06T10:00:00Z"
  },
  {
    id: "stock-3",
    game_name: "Clash of Clans",
    account_title: "TH15 Semi Max",
    account_details: "Strong village, good heroes",
    purchase_source: "Employee purchase",
    buying_price: 12000,
    selling_price: 16800,
    image_url: "https://images.unsplash.com/photo-1511882150382-421056c89033?q=80&w=1200&auto=format&fit=crop",
    image_urls: [
      "https://images.unsplash.com/photo-1511882150382-421056c89033?q=80&w=1200&auto=format&fit=crop"
    ],
    secret_code: "coc1202",
    purchase_date: "2026-04-22",
    status: "sold",
    assigned_employee_id: "employee-demo",
    gmail_id: null,
    notes: "Sold on G2G",
    created_by: "admin-demo",
    created_at: "2026-04-22T10:00:00Z",
    updated_at: "2026-05-10T10:00:00Z",
    assigned_employee: demoProfiles[2]
  }
];

export const demoSoldAccounts: SoldAccount[] = [
  {
    id: "sold-1",
    stock_account_id: "stock-3",
    employee_id: "employee-demo",
    sold_amount: 16800,
    sold_source_website: "G2G",
    buyer_contact: "buyer@example.com",
    payment_status: "paid",
    payment_method: "Bkash",
    sold_date: "2026-05-10",
    notes: "Smooth sale",
    created_at: "2026-05-10T10:00:00Z",
    stock_account: demoStockAccounts[2],
    employee: demoProfiles[2]
  }
];

export const demoGmail: GmailAccount[] = [
  {
    id: "gmail-1",
    email: "fresh.one@example.com",
    recovery_info: "Recovery phone ending 001",
    status: "fresh",
    used_for_stock_account_id: null,
    date_added: "2026-05-01",
    date_used: null,
    notes: "Fresh Gmail",
    created_at: "2026-05-01T10:00:00Z"
  },
  {
    id: "gmail-2",
    email: "used.pubg@example.com",
    recovery_info: "Recovery phone ending 002",
    status: "used",
    used_for_stock_account_id: "stock-1",
    date_added: "2026-05-02",
    date_used: "2026-05-02",
    notes: "Used for PUBG account",
    created_at: "2026-05-02T10:00:00Z"
  }
];

export const demoAdvances: EmployeeAdvance[] = [
  {
    id: "advance-1",
    employee_id: "employee-demo",
    amount_given: 30000,
    date_given: "2026-05-01",
    purpose: "Buying accounts",
    payment_method: "Cash",
    status: "partial",
    notes: "May buying fund",
    created_by: "admin-demo",
    created_at: "2026-05-01T10:00:00Z",
    employee: demoProfiles[2]
  }
];

export const demoAdvanceTransactions: AdvanceTransaction[] = [
  {
    id: "tx-1",
    advance_id: "advance-1",
    employee_id: "employee-demo",
    type: "money_given",
    amount: 30000,
    stock_account_id: null,
    transaction_date: "2026-05-01",
    notes: "Opening fund",
    created_by: "admin-demo",
    created_at: "2026-05-01T10:00:00Z"
  },
  {
    id: "tx-2",
    advance_id: "advance-1",
    employee_id: "employee-demo",
    type: "account_purchase",
    amount: 12000,
    stock_account_id: "stock-3",
    transaction_date: "2026-05-03",
    notes: "COC purchase",
    created_by: "admin-demo",
    created_at: "2026-05-03T10:00:00Z"
  }
];

export const demoExpenses: Expense[] = [
  {
    id: "expense-1",
    title: "Gmail batch purchase",
    category: "gmail_purchase",
    amount: 1200,
    expense_date: "2026-05-02",
    paid_by: "admin-demo",
    notes: "20 fresh gmails",
    created_at: "2026-05-02T10:00:00Z",
    payer: demoProfiles[0]
  },
  {
    id: "expense-2",
    title: "Facebook ads",
    category: "ads",
    amount: 3500,
    expense_date: "2026-05-08",
    paid_by: "manager-demo",
    notes: "Sales promotion",
    created_at: "2026-05-08T10:00:00Z",
    payer: demoProfiles[1]
  }
];

export const demoActivityLogs: ActivityLog[] = [
  {
    id: "log-1",
    user_id: "employee-demo",
    action: "account_sold",
    table_name: "sold_accounts",
    record_id: "sold-1",
    created_at: "2026-05-10T10:00:00Z",
    new_data: { sold_amount: 16800 },
    user: demoProfiles[2]
  },
  {
    id: "log-2",
    user_id: "admin-demo",
    action: "advance_added",
    table_name: "employee_advances",
    record_id: "advance-1",
    created_at: "2026-05-01T10:00:00Z",
    new_data: { amount_given: 30000 },
    user: demoProfiles[0]
  }
];

export const demoSettings: Settings = {
  id: "settings-demo",
  business_name: "Kings Rock",
  currency: "BDT",
  game_categories: ["Mobile Legends", "Clash of Clans", "PUBG", "Free Fire", "Valorant", "COD Mobile"],
  sale_source_websites: ["Facebook", "PlayerAuctions", "G2G", "Discord"],
  expense_categories: [
    "gmail_purchase",
    "ads",
    "website_fee",
    "employee_payment",
    "scam_account",
    "refund_account",
    "other"
  ],
  employee_permissions: {
    can_view_profit: false,
    can_view_buying_price: false
  }
};
