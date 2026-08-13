import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function importTypeScriptModule(path) {
  const source = await readFile(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    }
  });
  const encoded = encodeURIComponent(transpiled.outputText);
  return import(`data:text/javascript;charset=utf-8,${encoded}`);
}

const policy = await importTypeScriptModule("lib/security/employee-role-policy.ts");

function assertRejected(input, messagePattern) {
  assert.throws(() => policy.assertCanSaveEmployeeRole(input), messagePattern);
}

function assertAllowed(input) {
  assert.doesNotThrow(() => policy.assertCanSaveEmployeeRole(input));
}

test("manager can assign only employee role", () => {
  assert.deepEqual(policy.assignableEmployeeRolesFor("manager"), ["employee"]);
  assertAllowed({ callerRole: "manager", submittedRole: "employee" });
  assertRejected({ callerRole: "manager", submittedRole: "admin" }, /Only admins can assign the admin role/);
  assertRejected({ callerRole: "manager", submittedRole: "manager" }, /Only admins can assign the manager role/);
});

test("manager cannot promote employee to admin or manager", () => {
  assertRejected(
    { callerRole: "manager", submittedRole: "admin", existingRole: "employee" },
    /Only admins can assign the admin role/
  );
  assertRejected(
    { callerRole: "manager", submittedRole: "manager", existingRole: "employee" },
    /Only admins can assign the manager role/
  );
});

test("manager cannot modify existing admin or manager accounts", () => {
  assertRejected(
    { callerRole: "manager", submittedRole: "employee", existingRole: "admin" },
    /Managers can only update employee accounts/
  );
  assertRejected(
    { callerRole: "manager", submittedRole: "employee", existingRole: "manager" },
    /Managers can only update employee accounts/
  );
});

test("employees cannot invoke employee save policy", () => {
  assert.deepEqual(policy.assignableEmployeeRolesFor("employee"), []);
  assertRejected(
    { callerRole: "employee", submittedRole: "employee" },
    /Employees cannot create employee accounts/
  );
});

test("admins retain role-management behavior", () => {
  assert.deepEqual(policy.assignableEmployeeRolesFor("admin"), ["employee", "manager", "admin"]);
  assertAllowed({ callerRole: "admin", submittedRole: "admin" });
  assertAllowed({ callerRole: "admin", submittedRole: "manager" });
  assertAllowed({ callerRole: "admin", submittedRole: "employee" });
  assertAllowed({ callerRole: "admin", submittedRole: "admin", existingRole: "employee" });
  assertAllowed({ callerRole: "admin", submittedRole: "manager", existingRole: "admin" });
});

test("invalid submitted roles are rejected", () => {
  assertRejected(
    { callerRole: "admin", submittedRole: "owner" },
    /Invalid employee role/
  );
});

test("saveEmployee uses the shared server-side role policy", async () => {
  const source = await readFile("app/actions.ts", "utf8");
  assert.match(source, /import \{ assertCanSaveEmployeeRole \} from "@\/lib\/security\/employee-role-policy";/);
  assert.match(source, /assertCanSaveEmployeeRole\(\{\s*callerRole: currentProfile\.role,\s*submittedRole: role,\s*existingRole: existingProfile\?\.role\s*\}\);/s);
});

test("profile RLS blocks manager direct database role escalation", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const migration = await readFile("supabase/migrations/20260813203402_restrict_manager_role_assignment.sql", "utf8");

  for (const sql of [schema, migration]) {
    assert.match(sql, /public\.is_admin\(\)\s+or \(public\.current_app_role\(\) = 'manager' and role = 'employee'\)/);
    assert.match(sql, /using \(\s*public\.is_admin\(\)\s+or \(public\.current_app_role\(\) = 'manager' and role = 'employee'\)/s);
    assert.match(sql, /with check \(\s*public\.is_admin\(\)\s+or \(public\.current_app_role\(\) = 'manager' and role = 'employee'\)/s);
  }
});

