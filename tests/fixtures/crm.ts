import type {
  AdvanceTransaction,
  EmployeeAdvance,
  Expense,
  GmailAccount,
  Profile,
  SoldAccount,
  StockAccount,
  StockAccountAssignment
} from "@/lib/types";

export const adminProfile: Profile = {
  id: "profile-admin",
  auth_user_id: "auth-admin",
  name: "Admin",
  email: "admin@test.local",
  role: "admin",
  status: "active",
  join_date: "2026-01-01",
  created_at: "2026-01-01T00:00:00.000Z"
};

export const managerProfile: Profile = {
  id: "profile-manager",
  auth_user_id: "auth-manager",
  name: "Manager",
  email: "manager@test.local",
  role: "manager",
  status: "active",
  join_date: "2026-01-02",
  created_at: "2026-01-02T00:00:00.000Z"
};

export const employeeProfile: Profile = {
  id: "profile-employee",
  auth_user_id: "auth-employee",
  name: "Employee",
  email: "employee@test.local",
  role: "employee",
  status: "active",
  join_date: "2026-01-03",
  created_at: "2026-01-03T00:00:00.000Z"
};

export const secondEmployeeProfile: Profile = {
  id: "profile-employee-2",
  auth_user_id: "auth-employee-2",
  name: "Second Employee",
  email: "employee2@test.local",
  role: "employee",
  status: "active",
  join_date: "2026-01-04",
  created_at: "2026-01-04T00:00:00.000Z"
};

export const inactiveEmployeeProfile: Profile = {
  ...secondEmployeeProfile,
  id: "profile-inactive",
  auth_user_id: "auth-inactive",
  email: "inactive@test.local",
  status: "inactive"
};

export function stockFixture(overrides: Partial<StockAccount> = {}): StockAccount {
  return {
    id: "stock-existing",
    game_name: "Mobile Legends",
    account_title: "Collector Natalia Epic",
    buying_price: 10,
    selling_price: 19,
    secret_code: "ML# 100",
    purchase_date: "2026-08-01",
    status: "available",
    assigned_employee_id: null,
    notes: "gmail@test.local)(password123",
    created_by: adminProfile.id,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

export type CrmFixture = {
  profiles: Profile[];
  stockAccounts: StockAccount[];
  stockAssignments: StockAccountAssignment[];
  soldAccounts: SoldAccount[];
  advances: EmployeeAdvance[];
  advanceTransactions: AdvanceTransaction[];
  gmailAccounts: GmailAccount[];
  expenses: Expense[];
};

export function crmFixture(): CrmFixture {
  return {
    profiles: [
      adminProfile,
      managerProfile,
      employeeProfile,
      secondEmployeeProfile,
      inactiveEmployeeProfile
    ],
    stockAccounts: [stockFixture()],
    stockAssignments: [],
    soldAccounts: [],
    advances: [],
    advanceTransactions: [],
    gmailAccounts: [],
    expenses: []
  };
}
