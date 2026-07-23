// Brain profile: who this user is inside the company (department + title).
// Self-serve — switching your department is also how a demo persona is played.

import { getBrainUser } from "@/lib/brain/access";
import { resolveBrainPrincipal } from "@/lib/brain/authorization";
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

  const departments = await getDepartments(admin);
  const departmentId = (body.departmentId ?? "").trim();
  if (!departments.some((d) => d.id === departmentId)) {
    return Response.json({ error: "unknown department" }, { status: 400 });
  }
  const current = await getProfile(admin, user.id);
  const principal = current ? await resolveBrainPrincipal(admin, user) : null;
  if (current && !principal) {
    return Response.json({ error: "Your organization membership is inactive." }, { status: 403 });
  }
  if (
    current &&
    current.department_id !== departmentId &&
    principal?.role !== "org_admin" &&
    principal?.role !== "knowledge_steward"
  ) {
    return Response.json({ error: "Only an admin or knowledge steward can change department identity." }, { status: 403 });
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
