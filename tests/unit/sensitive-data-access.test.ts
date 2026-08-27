import { describe, expect, test } from "vitest";
import { canViewStockImages } from "@/lib/stock-images";
import {
  adminProfile,
  employeeProfile,
  inactiveEmployeeProfile,
  secondEmployeeProfile
} from "@/tests/fixtures/crm";
import { createBusinessWorkflowHarness } from "@/tests/helpers/business-workflow-harness";

describe("sensitive stock data access", () => {
  test("unauthorized users cannot access protected private notes", () => {
    const crm = createBusinessWorkflowHarness();
    const [account] = crm.store.stockAccounts;

    expect(() => crm.viewPrivateStockNote(secondEmployeeProfile, account.id)).toThrow(
      /Private notes are not available/
    );
  });

  test("admin and assigned employee can access protected private notes", () => {
    const crm = createBusinessWorkflowHarness();
    const [account] = crm.store.stockAccounts;
    crm.addStockAssignment(employeeProfile, account.id, employeeProfile.id);

    expect(crm.viewPrivateStockNote(adminProfile, account.id)).toBe("gmail@test.local)(password123");
    expect(crm.viewPrivateStockNote(employeeProfile, account.id)).toBe("gmail@test.local)(password123");
  });

  test("inactive users cannot receive stock image access", () => {
    expect(canViewStockImages({ id: "stock-existing" }, inactiveEmployeeProfile)).toBe(false);
  });
});
