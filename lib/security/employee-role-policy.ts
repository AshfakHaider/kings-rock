import type { Role } from "@/lib/types";

const roleLabels: Record<Role, string> = {
  admin: "admin",
  manager: "manager",
  employee: "employee"
};

export function assignableEmployeeRolesFor(callerRole: Role): Role[] {
  if (callerRole === "admin") return ["employee", "manager", "admin"];
  if (callerRole === "manager") return ["employee"];
  return [];
}

export function assertCanSaveEmployeeRole({
  callerRole,
  submittedRole,
  existingRole
}: {
  callerRole: Role;
  submittedRole: Role;
  existingRole?: Role | null;
}) {
  const submittedRoleLabel = (roleLabels as Record<string, string | undefined>)[submittedRole];
  if (!submittedRoleLabel) {
    throw new Error("Invalid employee role.");
  }

  if (callerRole === "employee") {
    throw new Error("Employees cannot create employee accounts.");
  }

  if (!assignableEmployeeRolesFor(callerRole).includes(submittedRole)) {
    throw new Error(`Only admins can assign the ${submittedRoleLabel} role.`);
  }

  if (callerRole === "manager" && existingRole && existingRole !== "employee") {
    throw new Error("Managers can only update employee accounts.");
  }
}
