import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_BRAIN_ORGANIZATION_ID,
  type BrainDocMeta,
  type BrainPrincipal,
  type BrainProfile,
  type BrainProject,
  type BrainRole,
  type BrainVisibility,
} from "./types";
import { getDocByPath } from "./db";

type Admin = SupabaseClient;

type MembershipRow = {
  organization_id: string;
  user_id: string;
  role: BrainRole;
  department_id: string | null;
  active: boolean;
};

export async function getBrainMembership(
  admin: Admin,
  userId: string,
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<MembershipRow | null> {
  const { data, error } = await admin
    .from("brain_memberships")
    .select("organization_id, user_id, role, department_id, active")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`membership lookup failed: ${error.message}`);
  return (data as MembershipRow | null) ?? null;
}

type AclRow = {
  doc_id: string;
  principal_type: "user" | "department" | "project" | "role";
  principal_id: string;
  permission: "discover" | "read" | "edit" | "approve";
};

export async function resolveBrainPrincipal(
  admin: Admin,
  user: { id: string; email: string; name: string },
  organizationId = DEFAULT_BRAIN_ORGANIZATION_ID,
): Promise<BrainPrincipal | null> {
  const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] = await Promise.all([
    admin
      .from("brain_memberships")
      .select("organization_id, user_id, role, department_id, active")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("brain_profiles")
      .select("user_id, name, department_id, title")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Identity and authorization fail closed. Deploy 0002 before this code; a
  // missing membership table/column must never silently grant legacy access.
  if (membershipError || profileError) return null;

  const p = profile as BrainProfile | null;
  const m = membership as MembershipRow | null;
  if (m?.active && m.department_id && p) {
    return {
      organizationId,
      userId: user.id,
      name: p.name,
      email: user.email,
      title: p.title,
      departmentId: m.department_id,
      role: m.role,
    };
  }

  return null;
}

const hasAcl = (
  principal: BrainPrincipal,
  docId: string | undefined,
  projectId: string | null,
  acl: AclRow[],
  permissions: AclRow["permission"][],
): boolean => {
  if (!docId) return false;
  return acl.some(
    (entry) =>
      entry.doc_id === docId &&
      permissions.includes(entry.permission) &&
      ((entry.principal_type === "user" && entry.principal_id === principal.userId) ||
        (entry.principal_type === "department" && entry.principal_id === principal.departmentId) ||
        (entry.principal_type === "project" && entry.principal_id === projectId) ||
        (entry.principal_type === "role" && entry.principal_id === principal.role)),
  );
};

export function canReadBrainDoc(
  principal: BrainPrincipal,
  doc: BrainDocMeta,
  projectId: string | null,
  acl: AclRow[] = [],
): boolean {
  const visibility: BrainVisibility = doc.visibility ?? "organization";
  // Elevated roles may enter any active project, but project-only truth must
  // still stay out of company-wide context.
  if (visibility === "project") {
    return Boolean(projectId && doc.project_id === projectId);
  }
  if (principal.role === "org_admin" || principal.role === "knowledge_steward") return true;
  if (hasAcl(principal, doc.id, projectId, acl, ["read", "edit", "approve"])) return true;

  if (visibility === "organization") return true;
  if (visibility === "department") return doc.department_id === principal.departmentId;
  return false;
}

export function canEditBrainTruth(principal: BrainPrincipal): boolean {
  return principal.role === "org_admin" || principal.role === "knowledge_steward";
}

export async function canAccessBrainProject(
  admin: Admin,
  principal: BrainPrincipal,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("brain_user_can_access_project", {
    p_organization_id: principal.organizationId,
    p_user_id: principal.userId,
    p_project_id: projectId,
  });
  if (error) throw new Error(`project authorization failed: ${error.message}`);
  return data === true;
}

export async function getAuthorizedProjects(
  admin: Admin,
  principal: BrainPrincipal,
): Promise<BrainProject[]> {
  const { data: projects, error: projectsError } = await admin
    .from("brain_projects")
    .select("id, name, blurb, status")
    .eq("organization_id", principal.organizationId)
    .eq("status", "active")
    .order("sort");
  if (projectsError) throw new Error(`project catalog failed: ${projectsError.message}`);

  const activeProjects = (projects ?? []) as BrainProject[];
  if (canEditBrainTruth(principal) || !activeProjects.length) return activeProjects;

  const { data: memberships, error: membershipsError } = await admin
    .from("brain_project_memberships")
    .select("project_id")
    .eq("organization_id", principal.organizationId)
    .eq("user_id", principal.userId)
    .eq("active", true);
  if (membershipsError) throw new Error(`project memberships failed: ${membershipsError.message}`);
  const permitted = new Set((memberships ?? []).map((item) => item.project_id as string));
  return activeProjects.filter((project) => permitted.has(project.id));
}

export async function getAuthorizedDocManifest(
  admin: Admin,
  principal: BrainPrincipal,
  projectId: string | null,
): Promise<BrainDocMeta[]> {
  if (projectId && !(await canAccessBrainProject(admin, principal, projectId))) return [];
  const [{ data: docs, error }, { data: acl }] = await Promise.all([
    admin
      .from("brain_docs")
      .select(
        "id, organization_id, path, title, description, department_id, project_id, doc_type, audience, tags, visibility, current_version, review_due_at",
      )
      .eq("organization_id", principal.organizationId)
      .is("deleted_at", null)
      .order("path"),
    admin
      .from("brain_doc_acl")
      .select("doc_id, principal_type, principal_id, permission")
      .eq("organization_id", principal.organizationId),
  ]);
  if (error) throw new Error(`authorized catalog failed: ${error.message}`);

  return ((docs ?? []) as BrainDocMeta[]).filter((doc) =>
    canReadBrainDoc(principal, doc, projectId, (acl ?? []) as AclRow[]),
  );
}

export async function getAuthorizedKnowledgeCatalog(
  admin: Admin,
  principal: BrainPrincipal,
): Promise<{ docs: BrainDocMeta[]; projects: BrainProject[] }> {
  const projects = await getAuthorizedProjects(admin, principal);
  const manifests = await Promise.all([
    getAuthorizedDocManifest(admin, principal, null),
    ...projects.map((project) => getAuthorizedDocManifest(admin, principal, project.id)),
  ]);
  const byPath = new Map<string, BrainDocMeta>();

  manifests.forEach((manifest, index) => {
    const accessProjectId = index === 0 ? null : projects[index - 1].id;
    for (const doc of manifest) {
      if (!byPath.has(doc.path)) {
        byPath.set(doc.path, { ...doc, access_project_id: accessProjectId });
      }
    }
  });

  return {
    docs: [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
    projects,
  };
}

export async function getAuthorizedBrainDoc(
  admin: Admin,
  principal: BrainPrincipal,
  path: string,
  projectId: string | null = null,
) {
  const manifest = await getAuthorizedDocManifest(admin, principal, projectId);
  if (!manifest.some((doc) => doc.path === path)) return null;
  return getDocByPath(admin, path, principal.organizationId);
}

export async function auditBrainEvent(
  admin: Admin,
  principal: BrainPrincipal,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.from("brain_audit_events").insert({
    organization_id: principal.organizationId,
    actor_user_id: principal.userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata,
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
