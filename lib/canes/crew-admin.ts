import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getAdminSession } from "@/lib/urso-auth";
import type { Crew, TeamMember } from "@/lib/canes/types";
import { resolvePermissions } from "@/lib/canes/crew-types";
import type { CrewAccountRole, CrewPermissions, TechnicianAccountAdminRow } from "@/lib/canes/crew-types";

type MemberAdminRow = Pick<
  TeamMember,
  "id" | "name" | "crew_id" | "active" | "role"
> & {
  phone: string | null;
  email: string | null;
};

type AccountAdminRow = {
  id: string;
  team_member_id: string;
  active: boolean;
  last_login_at: string | null;
  // 0015 — optional so the panel still lists accounts before the migration runs.
  account_role?: string | null;
  permissions?: Partial<CrewPermissions> | null;
};

export type TechnicianAccountAdminData = {
  ready: boolean;
  rows: TechnicianAccountAdminRow[];
  crews: Crew[];
};

export async function listTechnicianAccountsForOwner(): Promise<TechnicianAccountAdminData> {
  if (!(await getAdminSession()) || !canesConfigured()) {
    return { ready: false, rows: [], crews: [] };
  }
  const db = canesDb();
  const [membersResult, accountsResult, crewsResult] = await Promise.all([
    db
      .from("team_members")
      .select("id, name, phone, email, crew_id, active, role")
      .in("role", ["worker", "ops_manager"])
      .order("sort", { ascending: true }),
    db.from("crew_accounts").select("*"),
    db.from("crews").select("*").eq("active", true).order("sort", { ascending: true }),
  ]);
  if (membersResult.error || accountsResult.error || crewsResult.error) {
    return { ready: false, rows: [], crews: [] };
  }

  const members = (membersResult.data ?? []) as MemberAdminRow[];
  const accounts = (accountsResult.data ?? []) as AccountAdminRow[];
  const crews = (crewsResult.data ?? []) as Crew[];
  const accountByMember = new Map(accounts.map((account) => [account.team_member_id, account]));
  const crewById = new Map(crews.map((crew) => [crew.id, crew]));
  return {
    ready: true,
    crews,
    rows: members.map((member) => {
      const account = accountByMember.get(member.id);
      // The roster is the role authority (auth-actions syncs accounts to it).
      const role: CrewAccountRole = member.role === "ops_manager" ? "ops_manager" : "technician";
      return {
        teamMemberId: member.id,
        accountId: account?.id ?? null,
        name: member.name,
        phone: member.phone,
        email: member.email,
        crewId: member.crew_id,
        crewName: member.crew_id ? crewById.get(member.crew_id)?.name ?? null : null,
        active: member.active && (account?.active ?? true),
        provisioned: Boolean(account),
        lastLoginAt: account?.last_login_at ?? null,
        role,
        permissions: resolvePermissions(role, account?.permissions),
      };
    }),
  };
}
