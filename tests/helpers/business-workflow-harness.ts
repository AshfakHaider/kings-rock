import { assertCanSaveEmployeeRole } from "@/lib/security/employee-role-policy";
import { getAdvanceBalance } from "@/lib/metrics";
import { cleanSecretCode, stripSecretCodeFromTitle } from "@/lib/stock-title";
import type {
  AdvanceTransaction,
  EmployeeAdvance,
  PaymentStatus,
  Profile,
  Role,
  SoldAccount,
  StockAccount,
  StockAccountAssignment
} from "@/lib/types";
import { crmFixture, type CrmFixture } from "@/tests/fixtures/crm";

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cloneFixture(seed: CrmFixture): CrmFixture {
  return {
    profiles: seed.profiles.map((item) => ({ ...item })),
    stockAccounts: seed.stockAccounts.map((item) => ({ ...item })),
    stockAssignments: seed.stockAssignments.map((item) => ({ ...item })),
    soldAccounts: seed.soldAccounts.map((item) => ({ ...item })),
    advances: seed.advances.map((item) => ({ ...item })),
    advanceTransactions: seed.advanceTransactions.map((item) => ({ ...item })),
    gmailAccounts: seed.gmailAccounts.map((item) => ({ ...item })),
    expenses: seed.expenses.map((item) => ({ ...item }))
  };
}

function requireActiveProfile(profile: Profile) {
  if (profile.status !== "active") {
    throw new Error("Active profile required.");
  }
}

export function createBusinessWorkflowHarness(seed: CrmFixture = crmFixture()) {
  const store = cloneFixture(seed);

  function stockById(id: string) {
    const account = store.stockAccounts.find((item) => item.id === id);
    if (!account) throw new Error("Stock account not found.");
    return account;
  }

  function isAssigned(stockAccountId: string, employeeId: string) {
    const account = stockById(stockAccountId);
    return account.assigned_employee_id === employeeId ||
      store.stockAssignments.some((assignment) => assignment.stock_account_id === stockAccountId && assignment.employee_id === employeeId);
  }

  function assertNoDuplicateStock(input: { secret_code?: string | null; account_title: string }, excludeId?: string) {
    const requestedCode = normalizeIdentity(cleanSecretCode(input.secret_code));
    const requestedTitle = normalizeIdentity(stripSecretCodeFromTitle(input.account_title, input.secret_code));

    const duplicate = store.stockAccounts
      .filter((account) => account.id !== excludeId && account.status !== "sold")
      .find((account) => {
        const accountCode = normalizeIdentity(cleanSecretCode(account.secret_code));
        const accountTitle = normalizeIdentity(stripSecretCodeFromTitle(account.account_title, account.secret_code));
        return Boolean(requestedCode && accountCode === requestedCode) || accountTitle === requestedTitle;
      });

    if (duplicate) throw new Error("Duplicate stock account already exists.");
  }

  function saveEmployee(caller: Profile, input: {
    id?: string;
    name: string;
    email: string;
    role: Role;
    status?: "active" | "inactive";
  }) {
    requireActiveProfile(caller);
    const existing = input.id ? store.profiles.find((profile) => profile.id === input.id) : null;
    assertCanSaveEmployeeRole({
      callerRole: caller.role,
      submittedRole: input.role,
      existingRole: existing?.role
    });

    const profile: Profile = {
      id: input.id ?? `profile-${store.profiles.length + 1}`,
      name: input.name,
      email: input.email,
      role: input.role,
      status: input.status ?? "active",
      join_date: "2026-08-14",
      created_at: "2026-08-14T00:00:00.000Z"
    };

    if (existing) {
      Object.assign(existing, profile);
      return existing;
    }

    store.profiles.push(profile);
    return profile;
  }

  function viewPrivateStockNote(caller: Profile, stockAccountId: string) {
    requireActiveProfile(caller);
    const account = stockById(stockAccountId);
    if (caller.role === "admin" || isAssigned(account.id, caller.id)) return account.notes ?? null;
    throw new Error("Private notes are not available to this user.");
  }

  function createStock(caller: Profile, input: {
    game_name: string;
    account_title: string;
    buying_price: number;
    selling_price?: number | null;
    secret_code?: string | null;
    notes?: string | null;
  }) {
    requireActiveProfile(caller);
    assertNoDuplicateStock(input);

    const account: StockAccount = {
      id: `stock-${store.stockAccounts.length + 1}`,
      game_name: input.game_name,
      account_title: stripSecretCodeFromTitle(input.account_title, input.secret_code),
      buying_price: input.buying_price,
      selling_price: input.selling_price ?? null,
      secret_code: cleanSecretCode(input.secret_code),
      purchase_date: "2026-08-14",
      status: "available",
      assigned_employee_id: null,
      notes: input.notes ?? null,
      created_by: caller.id,
      created_at: "2026-08-14T00:00:00.000Z",
      updated_at: "2026-08-14T00:00:00.000Z"
    };

    store.stockAccounts.push(account);
    return account;
  }

  function addStockAssignment(caller: Profile, stockAccountId: string, employeeId: string) {
    requireActiveProfile(caller);
    const account = stockById(stockAccountId);
    if (account.status === "sold") throw new Error("Sold stock cannot be assigned.");
    if (caller.role === "employee" && caller.id !== employeeId) {
      throw new Error("Employees can only assign accounts to themselves.");
    }

    const existing = store.stockAssignments.find((assignment) => assignment.stock_account_id === stockAccountId && assignment.employee_id === employeeId);
    if (existing) return existing;

    const assignment: StockAccountAssignment = {
      id: `assignment-${store.stockAssignments.length + 1}`,
      stock_account_id: stockAccountId,
      employee_id: employeeId,
      assigned_by: caller.id,
      created_at: "2026-08-14T00:00:00.000Z"
    };

    store.stockAssignments.push(assignment);
    account.status = "assigned";
    return assignment;
  }

  function sellStock(caller: Profile, input: {
    stock_account_id: string;
    employee_id?: string;
    sold_amount: number;
    payment_status?: PaymentStatus;
  }) {
    requireActiveProfile(caller);
    const account = stockById(input.stock_account_id);
    if (account.status === "sold" || store.soldAccounts.some((sale) => sale.stock_account_id === account.id)) {
      throw new Error("This stock account has already been sold.");
    }

    const employeeId = caller.role === "employee" ? caller.id : input.employee_id ?? caller.id;
    if (caller.role === "employee" && !isAssigned(account.id, caller.id)) {
      throw new Error("Employees can only sell assigned stock accounts.");
    }

    const paymentStatus = input.payment_status ?? "pending";
    const sale: SoldAccount = {
      id: `sale-${store.soldAccounts.length + 1}`,
      stock_account_id: account.id,
      employee_id: employeeId,
      sold_amount: input.sold_amount,
      sold_source_website: "FunPay",
      payment_status: paymentStatus,
      payment_method: paymentStatus === "paid" ? "Wise" : null,
      payment_received_date: paymentStatus === "paid" ? "2026-08-14" : null,
      sold_date: "2026-08-14",
      created_at: "2026-08-14T00:00:00.000Z",
      stock_account: account
    };

    account.status = "sold";
    store.soldAccounts.push(sale);
    return sale;
  }

  function markSalePaid(caller: Profile, saleId: string) {
    requireActiveProfile(caller);
    const sale = store.soldAccounts.find((item) => item.id === saleId);
    if (!sale) throw new Error("Sale was not found.");
    if (caller.role === "employee" && sale.employee_id !== caller.id) {
      throw new Error("Employees can only mark their own sales as paid.");
    }

    sale.payment_status = "paid";
    sale.payment_method = sale.payment_method ?? "Wise";
    sale.payment_received_date = "2026-08-14";
    return sale;
  }

  function createAdvance(caller: Profile, employeeId: string, amount: number, options: {
    requestId?: string;
    failOpeningTransaction?: boolean;
  } = {}) {
    requireActiveProfile(caller);
    if (caller.role === "employee") throw new Error("Employees cannot manage funds.");

    const existing = options.requestId
      ? store.advances.find((item) => (item as EmployeeAdvance & { request_id?: string }).request_id === options.requestId)
      : null;
    if (existing) return existing;

    const advance: EmployeeAdvance = {
      id: `advance-${store.advances.length + 1}`,
      employee_id: employeeId,
      amount_given: amount,
      date_given: "2026-08-14",
      status: "open",
      created_by: caller.id,
      created_at: "2026-08-14T00:00:00.000Z"
    } as EmployeeAdvance;
    (advance as EmployeeAdvance & { request_id?: string }).request_id = options.requestId;

    const transaction: AdvanceTransaction = {
      id: `advance-tx-${store.advanceTransactions.length + 1}`,
      advance_id: advance.id,
      employee_id: employeeId,
      type: "money_given",
      amount,
      transaction_date: "2026-08-14",
      created_by: caller.id,
      created_at: "2026-08-14T00:00:00.000Z"
    };

    if (options.failOpeningTransaction) {
      throw new Error("Opening advance transaction failed.");
    }

    store.advances.push(advance);
    store.advanceTransactions.push(transaction);
    return advance;
  }

  function addAdvanceTransaction(caller: Profile, advanceId: string, type: AdvanceTransaction["type"], amount: number, stockAccountId?: string | null) {
    requireActiveProfile(caller);
    if (caller.role === "employee") throw new Error("Employees cannot manage fund transactions.");
    const advance = store.advances.find((item) => item.id === advanceId);
    if (!advance) throw new Error("Advance was not found.");

    const transaction: AdvanceTransaction = {
      id: `advance-tx-${store.advanceTransactions.length + 1}`,
      advance_id: advance.id,
      employee_id: advance.employee_id,
      type,
      amount,
      stock_account_id: stockAccountId ?? null,
      transaction_date: "2026-08-14",
      created_by: caller.id,
      created_at: "2026-08-14T00:00:00.000Z"
    };

    store.advanceTransactions.push(transaction);
    return transaction;
  }

  function deleteAdvance(caller: Profile, advanceId: string, options: {
    failAfterTransactionDelete?: boolean;
  } = {}) {
    requireActiveProfile(caller);
    if (caller.role === "employee") throw new Error("Employees cannot delete funds.");
    const advance = store.advances.find((item) => item.id === advanceId);
    if (!advance) throw new Error("Advance was not found.");

    const remainingTransactions = store.advanceTransactions.filter((transaction) => transaction.advance_id !== advanceId);
    const remainingAdvances = store.advances.filter((item) => item.id !== advanceId);
    const deletedTransactionCount = store.advanceTransactions.length - remainingTransactions.length;

    if (options.failAfterTransactionDelete) {
      throw new Error("Advance delete failed.");
    }

    store.advanceTransactions.splice(0, store.advanceTransactions.length, ...remainingTransactions);
    store.advances.splice(0, store.advances.length, ...remainingAdvances);

    return {
      deleted_advance_id: advanceId,
      deleted_transaction_count: deletedTransactionCount
    };
  }

  function advanceBalance(advanceId: string) {
    return getAdvanceBalance(store.advanceTransactions.filter((transaction) => transaction.advance_id === advanceId));
  }

  return {
    store,
    saveEmployee,
    viewPrivateStockNote,
    createStock,
    addStockAssignment,
    sellStock,
    markSalePaid,
    createAdvance,
    deleteAdvance,
    addAdvanceTransaction,
    advanceBalance
  };
}
