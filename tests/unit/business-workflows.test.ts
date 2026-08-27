import { describe, expect, test } from "vitest";
import { getDashboardMetrics } from "@/lib/metrics";
import {
  adminProfile,
  employeeProfile,
  managerProfile,
  secondEmployeeProfile
} from "@/tests/fixtures/crm";
import { createBusinessWorkflowHarness } from "@/tests/helpers/business-workflow-harness";

describe("employee role management security", () => {
  test("manager cannot create admin", () => {
    const crm = createBusinessWorkflowHarness();

    expect(() =>
      crm.saveEmployee(managerProfile, {
        name: "Escalated Admin",
        email: "escalated-admin@test.local",
        role: "admin"
      })
    ).toThrow(/Only admins can assign the admin role/);
  });

  test("manager cannot create manager", () => {
    const crm = createBusinessWorkflowHarness();

    expect(() =>
      crm.saveEmployee(managerProfile, {
        name: "Escalated Manager",
        email: "escalated-manager@test.local",
        role: "manager"
      })
    ).toThrow(/Only admins can assign the manager role/);
  });

  test("manager cannot promote a user to admin", () => {
    const crm = createBusinessWorkflowHarness();

    expect(() =>
      crm.saveEmployee(managerProfile, {
        id: employeeProfile.id,
        name: employeeProfile.name,
        email: employeeProfile.email,
        role: "admin"
      })
    ).toThrow(/Only admins can assign the admin role/);
  });
});

describe("stock account workflow", () => {
  test("stock creation works with deterministic required fields", () => {
    const crm = createBusinessWorkflowHarness();

    const account = crm.createStock(adminProfile, {
      game_name: "RSL",
      account_title: "RSL# 200 Legendary Starter",
      secret_code: "RSL# 200",
      buying_price: 15,
      selling_price: 25,
      notes: "private-login@test.local)(secret"
    });

    expect(account).toMatchObject({
      game_name: "RSL",
      account_title: "Legendary Starter",
      secret_code: "RSL# 200",
      buying_price: 15,
      selling_price: 25,
      status: "available",
      created_by: adminProfile.id
    });
    expect(crm.store.stockAccounts).toHaveLength(2);
  });

  test("duplicate stock creation is rejected by secret code and normalized title", () => {
    const crm = createBusinessWorkflowHarness();

    expect(() =>
      crm.createStock(adminProfile, {
        game_name: "Mobile Legends",
        account_title: "Different visible title",
        secret_code: "ml 100",
        buying_price: 11
      })
    ).toThrow(/Duplicate stock account/);

    expect(() =>
      crm.createStock(adminProfile, {
        game_name: "Mobile Legends",
        account_title: "collector natalia epic",
        secret_code: "ML# 101",
        buying_price: 12
      })
    ).toThrow(/Duplicate stock account/);
  });

  test("stock assignment authorization works", () => {
    const crm = createBusinessWorkflowHarness();
    const [account] = crm.store.stockAccounts;

    expect(() => crm.addStockAssignment(employeeProfile, account.id, secondEmployeeProfile.id)).toThrow(
      /Employees can only assign accounts to themselves/
    );

    const ownAssignment = crm.addStockAssignment(employeeProfile, account.id, employeeProfile.id);
    const managerAssignment = crm.addStockAssignment(managerProfile, account.id, secondEmployeeProfile.id);

    expect(ownAssignment.employee_id).toBe(employeeProfile.id);
    expect(managerAssignment.employee_id).toBe(secondEmployeeProfile.id);
    expect(crm.store.stockAssignments).toHaveLength(2);
    expect(account.status).toBe("assigned");
  });
});

describe("sales, payments, and funds", () => {
  test("sold stock cannot be sold twice", () => {
    const crm = createBusinessWorkflowHarness();
    const [account] = crm.store.stockAccounts;
    crm.addStockAssignment(employeeProfile, account.id, employeeProfile.id);

    const sale = crm.sellStock(employeeProfile, {
      stock_account_id: account.id,
      sold_amount: 30
    });

    expect(sale.payment_status).toBe("pending");
    expect(account.status).toBe("sold");
    expect(() =>
      crm.sellStock(employeeProfile, {
        stock_account_id: account.id,
        sold_amount: 31
      })
    ).toThrow(/already been sold/);
  });

  test("payment-state behavior excludes waiting payments until marked paid", () => {
    const crm = createBusinessWorkflowHarness();
    const [account] = crm.store.stockAccounts;
    crm.addStockAssignment(employeeProfile, account.id, employeeProfile.id);

    const sale = crm.sellStock(employeeProfile, {
      stock_account_id: account.id,
      sold_amount: 30,
      payment_status: "pending"
    });

    const waitingMetrics = getDashboardMetrics({
      stockAccounts: crm.store.stockAccounts,
      soldAccounts: crm.store.soldAccounts,
      gmailAccounts: crm.store.gmailAccounts,
      expenses: crm.store.expenses,
      advanceTransactions: crm.store.advanceTransactions
    });

    expect(waitingMetrics.totalSoldAccounts).toBe(0);
    expect(waitingMetrics.totalSalesAmount).toBe(0);
    expect(waitingMetrics.waitingPaymentCount).toBe(1);
    expect(waitingMetrics.waitingPaymentAmount).toBe(30);

    crm.markSalePaid(employeeProfile, sale.id);

    const paidMetrics = getDashboardMetrics({
      stockAccounts: crm.store.stockAccounts,
      soldAccounts: crm.store.soldAccounts,
      gmailAccounts: crm.store.gmailAccounts,
      expenses: crm.store.expenses,
      advanceTransactions: crm.store.advanceTransactions
    });

    expect(paidMetrics.totalSoldAccounts).toBe(1);
    expect(paidMetrics.totalSalesAmount).toBe(30);
    expect(paidMetrics.totalBuyingCost).toBe(10);
    expect(paidMetrics.totalGrossProfit).toBe(20);
    expect(paidMetrics.waitingPaymentCount).toBe(0);
  });

  test("employee fund operations preserve expected balances", () => {
    const crm = createBusinessWorkflowHarness();

    const advance = crm.createAdvance(adminProfile, employeeProfile.id, 100);
    crm.addAdvanceTransaction(adminProfile, advance.id, "account_purchase", 35, "stock-existing");
    crm.addAdvanceTransaction(managerProfile, advance.id, "money_returned", 15);
    crm.addAdvanceTransaction(adminProfile, advance.id, "adjustment", 5);

    expect(crm.advanceBalance(advance.id)).toBe(55);
  });

  test("successful advance creation creates opening transaction", () => {
    const crm = createBusinessWorkflowHarness();

    const advance = crm.createAdvance(adminProfile, employeeProfile.id, 100, { requestId: "request-create-ok" });
    const transactions = crm.store.advanceTransactions.filter((transaction) => transaction.advance_id === advance.id);

    expect(crm.store.advances).toHaveLength(1);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      employee_id: employeeProfile.id,
      type: "money_given",
      amount: 100
    });
    expect(crm.advanceBalance(advance.id)).toBe(100);
  });

  test("successful advance deletion removes advance and related transactions", () => {
    const crm = createBusinessWorkflowHarness();
    const advance = crm.createAdvance(managerProfile, employeeProfile.id, 100);
    crm.addAdvanceTransaction(adminProfile, advance.id, "account_purchase", 40);

    const result = crm.deleteAdvance(adminProfile, advance.id);

    expect(result.deleted_transaction_count).toBe(2);
    expect(crm.store.advances).toHaveLength(0);
    expect(crm.store.advanceTransactions).toHaveLength(0);
  });

  test("failure during opening transaction rolls back advance creation", () => {
    const crm = createBusinessWorkflowHarness();

    expect(() =>
      crm.createAdvance(adminProfile, employeeProfile.id, 100, {
        requestId: "request-create-fail",
        failOpeningTransaction: true
      })
    ).toThrow(/Opening advance transaction failed/);

    expect(crm.store.advances).toHaveLength(0);
    expect(crm.store.advanceTransactions).toHaveLength(0);
  });

  test("failed advance deletion leaves original financial state intact", () => {
    const crm = createBusinessWorkflowHarness();
    const advance = crm.createAdvance(adminProfile, employeeProfile.id, 100);
    crm.addAdvanceTransaction(managerProfile, advance.id, "money_returned", 25);

    expect(() =>
      crm.deleteAdvance(managerProfile, advance.id, {
        failAfterTransactionDelete: true
      })
    ).toThrow(/Advance delete failed/);

    expect(crm.store.advances).toHaveLength(1);
    expect(crm.store.advanceTransactions).toHaveLength(2);
    expect(crm.advanceBalance(advance.id)).toBe(75);
  });

  test("unauthorized employee cannot manipulate another employee's advance", () => {
    const crm = createBusinessWorkflowHarness();
    const advance = crm.createAdvance(adminProfile, secondEmployeeProfile.id, 100);

    expect(() => crm.createAdvance(employeeProfile, secondEmployeeProfile.id, 50)).toThrow(/Employees cannot manage funds/);
    expect(() => crm.addAdvanceTransaction(employeeProfile, advance.id, "adjustment", 10)).toThrow(
      /Employees cannot manage fund transactions/
    );
    expect(() => crm.deleteAdvance(employeeProfile, advance.id)).toThrow(/Employees cannot delete funds/);
  });

  test("repeated advance submission with same request id is idempotent", () => {
    const crm = createBusinessWorkflowHarness();

    const first = crm.createAdvance(adminProfile, employeeProfile.id, 100, { requestId: "request-repeat" });
    const second = crm.createAdvance(adminProfile, employeeProfile.id, 100, { requestId: "request-repeat" });

    expect(second.id).toBe(first.id);
    expect(crm.store.advances).toHaveLength(1);
    expect(crm.store.advanceTransactions).toHaveLength(1);
    expect(crm.advanceBalance(first.id)).toBe(100);
  });

  test("concurrent-style repeated operations do not corrupt balances", () => {
    const crm = createBusinessWorkflowHarness();
    const requestIds = ["request-a", "request-a", "request-b"];

    const advances = requestIds.map((requestId) =>
      crm.createAdvance(managerProfile, employeeProfile.id, 50, { requestId })
    );

    expect(new Set(advances.map((advance) => advance.id)).size).toBe(2);
    expect(crm.store.advances).toHaveLength(2);
    expect(crm.store.advanceTransactions).toHaveLength(2);
    expect(getDashboardMetrics({
      stockAccounts: crm.store.stockAccounts,
      soldAccounts: crm.store.soldAccounts,
      gmailAccounts: crm.store.gmailAccounts,
      expenses: crm.store.expenses,
      advanceTransactions: crm.store.advanceTransactions
    }).employeeAdvanceBalance).toBe(100);
  });
});
