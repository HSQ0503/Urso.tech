"use client";

import {
  ArrowRight,
  Box,
  FileCheck2,
  LockKeyhole,
  Maximize2,
} from "lucide-react";
import { artifacts } from "@/lib/mf-demo/fixtures";
import { deriveMfArtifactAccess } from "@/lib/mf-demo/workflow-runtime.mjs";
import { useMfLanguage } from "../mf-language";
import type { ViewProps } from "./view-props";

function BimScaffold({ active }: { active: boolean }) {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  return (
    <div className={`mf-bim-preview mf-bim-monochrome ${active ? "is-active" : ""}`}>
      <svg viewBox="0 0 620 330" role="img" aria-label={l("Scaffold BIM conceitual", "Concept BIM scaffold")}>
        <defs><pattern id="mf-grid-mono" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" /></pattern></defs>
        <rect width="620" height="330" fill="url(#mf-grid-mono)" />
        <path d="M80 235 272 124l275 70-192 111Z" fill="rgba(255,255,255,.025)" stroke="#555" />
        <path d="M164 226 302 148l140 36-139 80Z" fill="rgba(255,255,255,.04)" stroke="#8c8c8c" strokeDasharray="7 6" />
        <path d="M148 221 313 127l169 43-166 96Z" fill={active ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.07)"} stroke={active ? "#fff" : "#777"} strokeWidth="2" />
        <path d="M148 221v-52l165-93 169 43v51M313 76v51M482 119v51M148 169l165 43 169-93" fill="none" stroke="rgba(255,255,255,.35)" />
        <circle cx="313" cy="212" r="7" fill="#fff" /><circle cx="448" cy="135" r="7" fill="#e44" />
        <path d="M313 212 258 294" stroke="#fff" strokeDasharray="4 4" /><path d="M448 135 506 74" stroke="#e44" strokeDasharray="4 4" />
        <text x="178" y="320" fill="#bbb" fontSize="12">+1,2 m · {l("envelope revisado", "revised envelope")}</text><text x="512" y="70" fill="#ff8888" fontSize="11">{l("Interferência 02", "Clash 02")}</text>
      </svg>
      <span className="mf-demo-watermark">{l("DEMONSTRAÇÃO · NÃO CONSTRUTIVO", "DEMONSTRATION · NOT FOR CONSTRUCTION")}</span>
    </div>
  );
}

export function ArtifactsView({ step, roleId, onNavigate, onOpenArtifact, artifactReviewStates }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const artifactAccess = deriveMfArtifactAccess(roleId);
  const visibleArtifacts = artifacts.filter((artifact) =>
    artifactAccess.canViewAll || artifactAccess.artifactIds.includes(artifact.id));
  const canViewBimScaffold = artifactAccess.canViewAll
    || artifactAccess.artifactIds.includes("bim-scaffold");
  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Trabalho produzido", "Work produced")}</span><h1>{l("O que os workflows entregam às equipes", "What workflows deliver to teams")}</h1><p>{l("Cada item abaixo é um rascunho, análise ou checklist criado para uma pessoa da MF revisar. Nada é emitido automaticamente.", "Each item below is a draft, analysis, or checklist created for an MF employee to review. Nothing is issued automatically.")}</p></div></header>

      <section className="mf-output-definition" data-guide-key="work-produced"><FileCheck2 size={20} /><div><strong>{l("“Trabalho produzido” significa uma saída verificável", "“Work produced” means a verifiable output")}</strong><p>{l("Ela mostra as fontes usadas, o que Urso fez, quem precisa revisar e qual decisão depende dela.", "It shows the sources used, what Urso did, who must review it, and which decision depends on it.")}</p></div></section>

      <section className="mf-output-list">
        {visibleArtifacts.map((artifact) => {
          const unlocked = step >= artifact.availableAt;
          const reviewState = artifactReviewStates[artifact.id] ?? (step >= 8 ? "approved" : step >= 7 ? "validated" : "draft");
          return <article key={artifact.id} className={unlocked ? "is-ready" : "is-locked"}><div className="mf-output-type">{unlocked ? <FileCheck2 size={18} /> : <LockKeyhole size={17} />}<span><small>{t(artifact.type)}</small><strong>{t(artifact.title)}</strong></span></div><div><small>{l("O que é", "What it is")}</small><p>{unlocked ? t(artifact.description) : l(`Disponível quando o workflow chegar à etapa ${artifact.availableAt}.`, `Available when the workflow reaches step ${artifact.availableAt}.`)}</p></div><div><small>{l("Por que importa", "Why it matters")}</small><p>{unlocked ? t(artifact.validation) : l("Ainda não foi gerado.", "It has not been generated yet.")}</p></div><div><small>{l("Quem revisa", "Who reviews")}</small><p>{t(artifact.discipline)}</p></div><div className="mf-output-action"><span className={`mf-simple-status is-${reviewState}`}>{!unlocked ? l("Bloqueado", "Locked") : reviewState === "approved" ? l("Aprovado", "Approved") : reviewState === "validated" ? l("Pronto para aprovar", "Ready to approve") : l("Rascunho", "Draft")}</span><button type="button" onClick={() => onOpenArtifact(artifact.id)} disabled={!unlocked}><Maximize2 size={14} /> {l("Abrir e revisar", "Open and review")}</button></div></article>;
        })}
      </section>

      {canViewBimScaffold ? <section className="mf-bim-output"><header><div><span className="mf-eyebrow">{l("Exemplo visual · workflow BIM", "Visual example · BIM workflow")}</span><h2>{l("Scaffold básico para iniciar coordenação", "Basic scaffold to start coordination")}</h2></div><span>{l("Rascunho · exige revisão BIM", "Draft · requires BIM review")}</span></header><BimScaffold active={step >= 6} /><footer><Box size={17} /><p>{l("Urso organiza geometria, conexões e áreas de interferência para a equipe começar. O Coordenador BIM decide o que entra no modelo oficial.", "Urso organizes geometry, connections, and clash areas so the team can begin. The BIM Coordinator decides what enters the official model.")}</p><button type="button" onClick={() => onNavigate("workflows")}>{l("Ver como o workflow funciona", "See how the workflow works")} <ArrowRight size={14} /></button></footer></section> : null}
    </div>
  );
}

