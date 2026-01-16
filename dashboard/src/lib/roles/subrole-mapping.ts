/**
 * Role to Subrole Mapping
 * Defines subroles available for each primary role
 */

export const ROLE_SUBROLE_MAPPING: Record<string, string[]> = {
  SUPER_ADMIN: ["SENIOR", "LEAD"],
  ADMIN: ["SENIOR", "JUNIOR", "SUPERVISOR", "MANAGER"],
  AGENT: ["SENIOR", "JUNIOR", "SUPERVISOR", "TEAM_LEAD"],
  AREA_MANAGER_MERCHANT: ["SENIOR", "JUNIOR", "REGIONAL", "ZONAL"],
  AREA_MANAGER_RIDER: ["SENIOR", "JUNIOR", "REGIONAL", "ZONAL"],
  SALES_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "SUPERVISOR", "EXECUTIVE", "LEAD"],
  ADVERTISEMENT_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "CREATIVE_DIRECTOR", "SPECIALIST"],
  AUDIT_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "LEAD_AUDITOR", "AUDITOR"],
  COMPLIANCE_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "COMPLIANCE_OFFICER", "SPECIALIST"],
  SUPPORT_L1: ["SENIOR", "JUNIOR", "SUPERVISOR", "TEAM_LEAD"],
  SUPPORT_L2: ["SENIOR", "JUNIOR", "SUPERVISOR", "TEAM_LEAD"],
  SUPPORT_L3: ["SENIOR", "JUNIOR", "SUPERVISOR", "TECHNICAL_LEAD", "MANAGER"],
  FINANCE_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "ACCOUNTANT", "ANALYST", "CONTROLLER"],
  OPERATIONS_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "SUPERVISOR", "COORDINATOR", "LEAD"],
  DEVELOPER: ["SENIOR", "TL", "SUPERVISOR", "MANAGER", "INTERN", "JUNIOR", "MID_LEVEL", "LEAD", "ARCHITECT"],
  READ_ONLY: ["VIEWER", "AUDITOR"],
  MANAGER: ["SENIOR", "JUNIOR", "REGIONAL", "DEPARTMENT", "PROJECT", "PROGRAM"],
  SUPERVISOR: ["SENIOR", "JUNIOR", "TEAM_LEAD", "SHIFT_LEAD"],
  TEAM_LEAD: ["SENIOR", "JUNIOR", "LEAD"],
  COORDINATOR: ["SENIOR", "JUNIOR", "PROJECT", "PROGRAM", "EVENT"],
  ANALYST: ["SENIOR", "JUNIOR", "BUSINESS", "DATA", "FINANCIAL", "SYSTEMS"],
  SPECIALIST: ["SENIOR", "JUNIOR", "TECHNICAL", "DOMAIN", "SUBJECT_MATTER"],
  CONSULTANT: ["SENIOR", "JUNIOR", "LEAD", "PRINCIPAL"],
  INTERN: ["DEVELOPMENT", "MARKETING", "SALES", "OPERATIONS", "HR", "FINANCE"],
  TRAINEE: ["DEVELOPMENT", "MARKETING", "SALES", "OPERATIONS", "HR", "FINANCE"],
  QA_ENGINEER: ["SENIOR", "JUNIOR", "LEAD", "MANAGER", "AUTOMATION", "MANUAL"],
  PRODUCT_MANAGER: ["SENIOR", "JUNIOR", "LEAD", "DIRECTOR", "ASSOCIATE"],
  PROJECT_MANAGER: ["SENIOR", "JUNIOR", "LEAD", "PROGRAM", "PORTFOLIO"],
  HR_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "RECRUITER", "SPECIALIST", "GENERALIST"],
  MARKETING_TEAM: ["SENIOR", "JUNIOR", "MANAGER", "SPECIALIST", "ANALYST", "DIRECTOR"],
  CUSTOMER_SUCCESS: ["SENIOR", "JUNIOR", "MANAGER", "SPECIALIST", "ACCOUNT_MANAGER"],
  DATA_ANALYST: ["SENIOR", "JUNIOR", "LEAD", "SPECIALIST", "SCIENTIST"],
  BUSINESS_ANALYST: ["SENIOR", "JUNIOR", "LEAD", "SPECIALIST", "CONSULTANT"],
};

/**
 * Subrole display labels
 * Maps subrole codes to human-readable labels
 */
export const SUBROLE_LABELS: Record<string, string> = {
  // Seniority levels
  SENIOR: "Senior",
  JUNIOR: "Junior",
  MID_LEVEL: "Mid-Level",
  INTERN: "Intern",
  TRAINEE: "Trainee",
  
  // Leadership roles
  TL: "Team Lead",
  TEAM_LEAD: "Team Lead",
  LEAD: "Lead",
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
  ARCHITECT: "Architect",
  DIRECTOR: "Director",
  EXECUTIVE: "Executive",
  
  // Specialized roles
  REGIONAL: "Regional",
  ZONAL: "Zonal",
  DEPARTMENT: "Department",
  PROJECT: "Project",
  PROGRAM: "Program",
  PORTFOLIO: "Portfolio",
  
  // Technical roles
  TECHNICAL_LEAD: "Technical Lead",
  CREATIVE_DIRECTOR: "Creative Director",
  COMPLIANCE_OFFICER: "Compliance Officer",
  LEAD_AUDITOR: "Lead Auditor",
  AUDITOR: "Auditor",
  ACCOUNTANT: "Accountant",
  ANALYST: "Analyst",
  CONTROLLER: "Controller",
  
  // Domain-specific
  BUSINESS: "Business",
  DATA: "Data",
  FINANCIAL: "Financial",
  SYSTEMS: "Systems",
  TECHNICAL: "Technical",
  DOMAIN: "Domain",
  SUBJECT_MATTER: "Subject Matter Expert",
  
  // Consultant levels
  CONSULTANT: "Consultant",
  PRINCIPAL: "Principal",
  
  // Intern/Trainee departments
  DEVELOPMENT: "Development",
  MARKETING: "Marketing",
  SALES: "Sales",
  OPERATIONS: "Operations",
  HR: "HR",
  FINANCE: "Finance",
  
  // QA specific
  AUTOMATION: "Automation",
  MANUAL: "Manual",
  
  // Product/Project Management
  ASSOCIATE: "Associate",
  
  // HR specific
  RECRUITER: "Recruiter",
  GENERALIST: "Generalist",
  
  // Customer Success
  ACCOUNT_MANAGER: "Account Manager",
  
  // Data roles
  SCIENTIST: "Scientist",
  
  // Read-only roles
  VIEWER: "Viewer",
  
  // Other
  SPECIALIST: "Specialist",
  COORDINATOR: "Coordinator",
  EVENT: "Event",
  SHIFT_LEAD: "Shift Lead",
};

/**
 * Get subroles for a given role
 */
export function getSubrolesForRole(role: string): string[] {
  return ROLE_SUBROLE_MAPPING[role] || [];
}

/**
 * Get display label for a subrole
 */
export function getSubroleLabel(subrole: string): string {
  return SUBROLE_LABELS[subrole] || subrole.replace(/_/g, " ");
}

/**
 * Check if a role has subroles defined
 */
export function hasSubroles(role: string): boolean {
  const subroles = ROLE_SUBROLE_MAPPING[role];
  return subroles && subroles.length > 0;
}

/**
 * Check if a subrole is valid for a given role
 */
export function isValidSubroleForRole(role: string, subrole: string): boolean {
  if (subrole === "OTHER") return true; // "Other" is always valid
  const subroles = ROLE_SUBROLE_MAPPING[role];
  return subroles ? subroles.includes(subrole) : false;
}
