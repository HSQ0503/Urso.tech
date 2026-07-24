import type { JobStatus } from "@/lib/canes/types";

// ── 0015: per-account role + permission flags ────────────────────────────────
// technician = crew portal only; ops_manager = runs operations from the owner
// console (DJ), scoped by flags. Stored jsonb overrides merge over the role's
// defaults so a new flag added later inherits sensibly for existing accounts.

export type CrewAccountRole = "technician" | "ops_manager";

export type CrewPermissionKey =
  | "calls"      // place calls / see call buttons for customers & leads
  | "leads"      // lead pipeline + inbox
  | "schedule"   // schedule, assign, move jobs; calendar events
  | "customers"  // customer directory edits
  | "estimates"  // create, edit, send estimates
  | "invoices";  // create, edit, send invoices; record payments

export type CrewPermissions = Record<CrewPermissionKey, boolean>;

export const CREW_PERMISSION_KEYS: CrewPermissionKey[] = [
  "calls", "leads", "schedule", "customers", "estimates", "invoices",
];

export const CREW_PERMISSION_LABEL: Record<CrewPermissionKey, string> = {
  calls: "Call customers",
  leads: "Leads & inbox",
  schedule: "Manage schedule",
  customers: "Manage customers",
  estimates: "Estimates",
  invoices: "Invoices & payments",
};

export const DEFAULT_CREW_PERMISSIONS: Record<CrewAccountRole, CrewPermissions> = {
  technician: { calls: false, leads: false, schedule: false, customers: false, estimates: false, invoices: false },
  ops_manager: { calls: true, leads: true, schedule: true, customers: true, estimates: true, invoices: true },
};

// Stored overrides win; unset keys fall back to the role default.
export function resolvePermissions(
  role: CrewAccountRole,
  stored: Partial<CrewPermissions> | null | undefined,
): CrewPermissions {
  const base = DEFAULT_CREW_PERMISSIONS[role];
  const out = { ...base };
  for (const key of CREW_PERMISSION_KEYS) {
    const v = stored?.[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

export type TechnicianActor = {
  kind: "technician";
  accountId: string;
  authUserId: string;
  teamMemberId: string;
  email: string;
  name: string;
  phone: string | null;
  role: CrewAccountRole;
  permissions: CrewPermissions;
  crewIds: string[];
  crewNames: string[];
};

export type TechnicianJobItem = {
  id: string;
  jobId: string;
  position: number;
  name: string;
  description: string | null;
  quantity: number;
  done: boolean;
  required: boolean;
  technicianNote: string | null;
  blocked: boolean;
  completedAt: string | null;
};

export type TechnicianJob = {
  id: string;
  status: JobStatus;
  customerName: string | null;
  customerPhone: string | null;
  jobName: string | null;
  jobAddress: string | null;
  scheduledAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
  arrivalWindowMinutes: number;
  gateCode: string | null;
  siteNotes: string | null;
  notes: string | null;
  crewId: string;
  crewName: string;
  crewColor: string;
  items: TechnicianJobItem[];
  minutesWorked: number;
  checkedInAt: string | null;
};

export type TechnicianWeek = {
  startDate: string;
  endDate: string;
  jobs: TechnicianJob[];
  minutesWorked: number;
};

export type TechnicianAccountAdminRow = {
  teamMemberId: string;
  accountId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  crewId: string | null;
  crewName: string | null;
  active: boolean;
  provisioned: boolean;
  lastLoginAt: string | null;
  role: CrewAccountRole;
  permissions: CrewPermissions; // resolved (defaults merged); meaningful once provisioned
};
