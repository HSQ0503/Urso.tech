// Brain profile: self-managed display details within organization-provisioned
// membership and department boundaries.

import { getBrainUser } from "@/lib/brain/access";
import { getBrainMembership } from "@/lib/brain/authorization";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { getDepartments, getProfile, upsertProfile } from "@/lib/brain/db";

export async function GET() {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const [profile, departments] = await Promise.all([getProfile(admin, user.id), getDepartments(admin)]);
  return Response.json({ profile, departments });
}

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { departmentId?: string; title?: string; name?: string };
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  const [departments, membership] = await Promise.all([
    getDepartments(admin),
    getBrainMembership(admin, user.id).catch(() => null),
  ]);
  if (!membership?.active || !membership.department_id) {
    return Response.json({ error: "An active organization membership with an assigned department is required." }, { status: 403 });
  }
  const departmentId = (body.departmentId ?? "").trim();
  if (departmentId !== membership.department_id) {
    return Response.json({ error: "Your department is assigned by your organization and cannot be changed here." }, { status: 403 });
  }
  if (!departments.some((department) => department.id === membership.department_id)) {
    return Response.json({ error: "Your assigned department is no longer available." }, { status: 403 });
  }

  const profile = {
    user_id: user.id,
    name: (body.name ?? "").trim().slice(0, 80) || user.name,
    department_id: departmentId,
    title: (body.title ?? "").trim().slice(0, 80),
  };
  try {
    await upsertProfile(admin, profile);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return Response.json({ profile });
}
