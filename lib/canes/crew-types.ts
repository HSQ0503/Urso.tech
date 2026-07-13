import type { JobStatus } from "@/lib/canes/types";

export type TechnicianActor = {
  kind: "technician";
  accountId: string;
  authUserId: string;
  teamMemberId: string;
  email: string;
  name: string;
  phone: string | null;
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
};
