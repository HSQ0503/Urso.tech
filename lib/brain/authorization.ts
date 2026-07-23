import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_BRAIN_ORGANIZATION_ID,
  type BrainDocMeta,
  type BrainPrincipal,
  type BrainProfile,
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
  if (principal.role === "org_admin" || principal.role === "knowledge_steward") return true;
  if (hasAcl(principal, doc.id, projectId, acl, ["read", "edit", "approve"])) return true;

  const visibility: BrainVisibility = doc.visibility ?? "organization";
  if (visibility === "organization") return true;
  if (visibility === "department") return doc.department_id === principal.departmentId;
  if (visibility === "project") return Boolean(projectId && doc.project_id === projectId);
  return false;
}

export function canEditBrainTruth(principal: BrainPrincipal): boolean {
  return principal.role === "org_admin" || principal.role === "knowledge_steward";
}

export async function getAuthorizedDocManifest(
  admin: Admin,
  principal: BrainPrincipal,
  projectId: string | null,
): Promise<BrainDocMeta[]> {
  const [{ data: docs, error }, { data: acl }] = await Promise.all([
    admin
      .from("brain_docs")
      .select(
        "id, organization_id, path, title, description, department_id, project_id, doc_type, audience, visibility, current_version, review_due_at",
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
  if (error) console.error("[brain] audit write failed:", error.message);
}
