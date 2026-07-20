// Brain profile: who this user is inside the company (department + title).
// Self-serve — switching your department is also how a demo persona is played.

import { getBrainUser } from "@/lib/brain/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDepartments, getProfile, upsertProfile } from "@/lib/brain/db";

export async function GET() {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const [profile, departments] = await Promise.all([getProfile(admin, user.id), getDepartments(admin)]);
  return Response.json({ profile, departments });
}

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { departmentId?: string; title?: string; name?: string };
  const admin = createAdminClient();

  const departments = await getDepartments(admin);
  const departmentId = (body.departmentId ?? "").trim();
  if (!departments.some((d) => d.id === departmentId)) {
    return Response.json({ error: "unknown department" }, { status: 400 });
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
