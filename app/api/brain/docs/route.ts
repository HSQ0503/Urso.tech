// Manual doc writes from the vault browser (/brain/docs/new + /edit) — the
// human twin of the AI's create_doc/update_doc/delete_doc tools. Same shared
// write core (lib/brain/write.ts), same soft-delete, same origin='brain'
// semantics: manual edits flow back to Obsidian via `brain-sync --export`.

import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { getDocByPath, insertBrainDoc, softDeleteBrainDoc, updateBrainDoc, type BrainDocWrite } from "@/lib/brain/db";
import { checkMeta, hashDoc, linksFor, normalizeDocPath, sanitizePathPart } from "@/lib/brain/write";

type Body = {
  path?: string;
  title?: string;
  content?: string;
  description?: string;
  department?: string;
  project?: string;
  type?: string;
  audience?: string[];
};

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const title = sanitizePathPart(body.title ?? "");
  const content = (body.content ?? "").trim();
  if (title.length < 2) return Response.json({ error: "Title is required (2+ chars)." }, { status: 400 });
  if (!content) return Response.json({ error: "Content is required." }, { status: 400 });

  const checked = await checkMeta(admin, { department: body.department, project: body.project, type: body.type });
  if (checked.error) return Response.json({ error: checked.error }, { status: 400 });

  const normalized = normalizeDocPath(body.path, title);
  if (normalized.error || !normalized.path) return Response.json({ error: normalized.error ?? "Invalid path." }, { status: 400 });
  if (await getDocByPath(admin, normalized.path)) {
    return Response.json({ error: `A doc already exists at "${normalized.path}".` }, { status: 409 });
  }

  const row: BrainDocWrite = {
    path: normalized.path,
    title,
    description: (body.description ?? "").trim().slice(0, 200),
    department_id: checked.department_id ?? null,
    project_id: checked.project_id ?? null,
    doc_type: checked.doc_type ?? "doc",
    audience: checked.doc_type === "rule" ? (body.audience?.length ? body.audience : ["all"]) : [],
    tags: [],
    links: await linksFor(admin, content),
    content,
    content_hash: "",
  };
  row.content_hash = hashDoc(row);
  try {
    await insertBrainDoc(admin, row, user.email);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return Response.json({ ok: true, path: row.path });
}

export async function PATCH(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.path) return Response.json({ error: "path required" }, { status: 400 });
  const existing = await getDocByPath(admin, body.path);
  if (!existing) return Response.json({ error: "No doc at that path." }, { status: 404 });

  const checked = await checkMeta(admin, { department: body.department, project: body.project, type: body.type });
  if (checked.error) return Response.json({ error: checked.error }, { status: 400 });

  const content = body.content !== undefined ? body.content.trim() : existing.content;
  if (!content) return Response.json({ error: "Content can't be empty." }, { status: 400 });
  const next: Omit<BrainDocWrite, "path"> = {
    title: body.title ? sanitizePathPart(body.title) : existing.title,
    description: body.description !== undefined ? body.description.trim().slice(0, 200) : existing.description,
    department_id: checked.department_id !== undefined ? checked.department_id : existing.department_id,
    project_id: checked.project_id !== undefined ? checked.project_id : existing.project_id,
    doc_type: checked.doc_type ?? existing.doc_type,
    audience: body.audience ?? existing.audience,
    tags: [],
    links: body.content !== undefined ? await linksFor(admin, content) : existing.links,
    content,
    content_hash: "",
  };
  next.content_hash = hashDoc(next);
  try {
    const ok = await updateBrainDoc(admin, body.path, next, user.email);
    if (!ok) return Response.json({ error: "Update didn't apply — the doc may have just been deleted." }, { status: 409 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return Response.json({ ok: true, path: body.path });
}

export async function DELETE(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { path?: string };
  if (!body.path) return Response.json({ error: "path required" }, { status: 400 });
  try {
    const ok = await softDeleteBrainDoc(admin, body.path, user.email);
    if (!ok) return Response.json({ error: "No live doc at that path." }, { status: 404 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return Response.json({ ok: true });
}
