/**
 * Values for Postgres enum `system_user_role_type` — keep in sync with Drizzle `systemUserRoleTypeEnum` in schema.ts.
 */
export const SYSTEM_USER_ROLE_TYPE_VALUES = [
  "SUPER_ADMIN",
  "ADMIN",
  "AGENT",
  "AREA_MANAGER_MERCHANT",
  "AREA_MANAGER_RIDER",
  "SALES_TEAM",
  "ADVERTISEMENT_TEAM",
  "AUDIT_TEAM",
  "COMPLIANCE_TEAM",
  "SUPPORT_L1",
  "SUPPORT_L2",
  "SUPPORT_L3",
  "FINANCE_TEAM",
  "OPERATIONS_TEAM",
  "DEVELOPER",
  "READ_ONLY",
  "MANAGER",
  "SUPERVISOR",
  "TEAM_LEAD",
  "COORDINATOR",
  "ANALYST",
  "SPECIALIST",
  "CONSULTANT",
  "INTERN",
  "TRAINEE",
  "QA_ENGINEER",
  "PRODUCT_MANAGER",
  "PROJECT_MANAGER",
  "HR_TEAM",
  "MARKETING_TEAM",
  "CUSTOMER_SUCCESS",
  "DATA_ANALYST",
  "BUSINESS_ANALYST",
] as const;

export type SystemUserRoleTypeValue = (typeof SYSTEM_USER_ROLE_TYPE_VALUES)[number];

export function isValidSystemUserRoleType(v: string): v is SystemUserRoleTypeValue {
  return (SYSTEM_USER_ROLE_TYPE_VALUES as readonly string[]).includes(v);
}
