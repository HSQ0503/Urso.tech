import type { BrainRole } from "@/lib/brain/types";

export const MF_BRAIN_ORGANIZATION_ID = "minerbo-fuchs-demo";
export const MF_BRAIN_PROJECT_ID = "uberlandia-refrescos-f3";

export const MF_DEMO_CLAIM_IDS = {
  revisionB: "d2000000-0000-4000-8000-000000000001",
  electricalB: "d2000000-0000-4000-8000-000000000002",
  chilledWaterB: "d2000000-0000-4000-8000-000000000003",
  operatingLoadB: "d2000000-0000-4000-8000-000000000004",
  releaseDateB: "d2000000-0000-4000-8000-000000000005",
  revisionC: "d2000000-0000-4000-8000-000000000011",
  electricalC: "d2000000-0000-4000-8000-000000000012",
  chilledWaterC: "d2000000-0000-4000-8000-000000000013",
  operatingLoadC: "d2000000-0000-4000-8000-000000000014",
  decisionStatus: "d2000000-0000-4000-8000-000000000021",
} as const;

export const MF_DEMO_RELATION_IDS = {
  revision: "d3000000-0000-4000-8000-000000000001",
  electrical: "d3000000-0000-4000-8000-000000000002",
  chilledWater: "d3000000-0000-4000-8000-000000000003",
  operatingLoad: "d3000000-0000-4000-8000-000000000004",
} as const;

export type MfDemoPersona = {
  roleId: string;
  userId: string;
  name: string;
  email: string;
  departmentId: string;
  titlePt: string;
  titleEn: string;
  brainRole: BrainRole;
};

export const MF_DEMO_PERSONAS: MfDemoPersona[] = [
  {
    roleId: "project-manager",
    userId: "mf-demo:project-manager",
    name: "Marina Costa",
    email: "project-manager@mf-demo.urso.ws",
    departmentId: "planning",
    titlePt: "Gerente do Projeto",
    titleEn: "Project Manager",
    brainRole: "knowledge_steward",
  },
  {
    roleId: "electrical",
    userId: "mf-demo:electrical",
    name: "Rafael Almeida",
    email: "electrical@mf-demo.urso.ws",
    departmentId: "electrical",
    titlePt: "Líder de Elétrica",
    titleEn: "Electrical Lead",
    brainRole: "member",
  },
  {
    roleId: "bim",
    userId: "mf-demo:bim",
    name: "Camila Nunes",
    email: "bim@mf-demo.urso.ws",
    departmentId: "bim",
    titlePt: "Coordenadora BIM",
    titleEn: "BIM Coordinator",
    brainRole: "member",
  },
  {
    roleId: "planning",
    userId: "mf-demo:planning",
    name: "Lucas Ferreira",
    email: "planning@mf-demo.urso.ws",
    departmentId: "planning",
    titlePt: "Engenheiro de Planejamento",
    titleEn: "Planning Engineer",
    brainRole: "member",
  },
  {
    roleId: "quality",
    userId: "mf-demo:quality",
    name: "Beatriz Souza",
    email: "quality@mf-demo.urso.ws",
    departmentId: "quality",
    titlePt: "Líder de Qualidade",
    titleEn: "Quality Lead",
    brainRole: "member",
  },
];

export function isMfDemoRoleId(roleId: string | null | undefined): roleId is string {
  return typeof roleId === "string" && MF_DEMO_PERSONAS.some((persona) => persona.roleId === roleId);
}

export function getMfDemoPersona(roleId: string | null | undefined): MfDemoPersona | null {
  return MF_DEMO_PERSONAS.find((persona) => persona.roleId === roleId) ?? null;
}
