"use client";

import {
  Clock3,
  Network,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { activityEvents, artifacts } from "@/lib/mf-demo/fixtures";
import { mfScenarioManifest } from "@/lib/mf-demo/manifest.mjs";
import { deriveMfArtifactAccess } from "@/lib/mf-demo/workflow-runtime.mjs";
import { useMfLanguage } from "../mf-language";
import type { ViewProps } from "./view-props";

export function AuditView({ step, roleId, onNavigate, artifactReviewStates, snapshot }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const events = activityEvents.filter((event) => step >= event.availableAt).reverse();
  const artifactAccess = deriveMfArtifactAccess(roleId);
  const visibleArtifacts = artifacts.filter((artifact) =>
    artifactAccess.canViewAll || artifactAccess.artifactIds.includes(artifact.id));
  const approvedArtifacts = visibleArtifacts.flatMap((artifact) => {
    const workItems = snapshot?.workItems.filter((task) => task.artifactId === artifact.id) ?? [];
    if (artifactReviewStates[artifact.id] !== "approved"
      || workItems.length === 0
      || workItems.some((task) => task.state !== "complete")) return [];
    const workItem = [...workItems].sort((left, right) => right.completeAt - left.completeAt)[0];
    return [{ artifact, workItem }];
  });
  const transitionReceipts = snapshot?.receipts ?? [];
  const decisionApproved = snapshot?.decision.status === "approved";

  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Decisões e histórico", "Decisions & history")}</span><h1>{l("Nada muda sem deixar uma explicação", "Nothing changes without leaving an explanation")}</h1><p>{l("Veja o que mudou, quem aprovou, quais fontes foram usadas e o que o sistema atualizou.", "See what changed, who approved it, which sources were used, and what the system updated.")}</p></div><button type="button" className="mf-secondary-action" onClick={() => onNavigate("brain")}>{l("Abrir relações no Brain", "Open relationships in the Brain")} <Network size={14} /></button></header>
      <section className="mf-audit-summary"><div><Clock3 size={18} /><span><small>{l("Workflow", "Workflow")}</small><strong>{mfScenarioManifest.workflow.id}</strong></span></div><div><UserCheck size={18} /><span><small>{l("Decisão humana", "Human decision")}</small><strong>{decisionApproved ? `${snapshot?.decision.id} · ${l("Aprovada", "Approved")}` : l("Aguardando", "Waiting")}</strong></span></div><div><ShieldCheck size={18} /><span><small>{l("Trabalho aprovado", "Approved work")}</small><strong>{approvedArtifacts.length} / {visibleArtifacts.length}</strong></span></div></section>

      <section className="mf-history-list">
        <header><span>{l("Horário", "Time")}</span><span>{l("Evidência canônica", "Canonical evidence")}</span><span>{l("Quem / sistema", "Who / system")}</span><span>{l("Recibo", "Receipt")}</span></header>
        {approvedArtifacts.map(({ artifact, workItem }) => <div key={`artifact-${artifact.id}`}><time>{l("Agora", "Now")}</time><span><strong>{t(artifact.title)}</strong><small>{l("Resultado aprovado e conectado ao Brain", "Approved result connected to the Brain")}</small></span><span>{t(artifact.discipline)}</span>{workItem.receiptId ? <code>{workItem.receiptId}</code> : <span className="mf-simple-status is-draft">{l("Recibo pendente", "Receipt pending")}</span>}</div>)}
        {transitionReceipts.map((receipt) => <div key={`transition-${receipt.id}`}><time>{l("Agora", "Now")}</time><span><strong>{l("Transição canônica do cenário", "Canonical scenario transition")} {receipt.fromStep} → {receipt.toStep}</strong><small>{receipt.action}</small></span><span>{receipt.actorRoleId}</span><code>{receipt.id}</code></div>)}
        {approvedArtifacts.length === 0 && transitionReceipts.length === 0 ? <div><time>—</time><span><strong>{l("Nenhum recibo canônico registrado", "No canonical receipt recorded")}</strong><small>{l("A trilha permanece sem evidência emitida.", "The trail remains without issued evidence.")}</small></span><span>Urso Harness</span><span className="mf-simple-status is-draft">{l("Recibo pendente", "Receipt pending")}</span></div> : null}
      </section>

      <section className="mf-history-list">
        <header><span>{l("Horário", "Time")}</span><span>{l("Atividade do cenário", "Scenario activity")}</span><span>{l("Quem / sistema", "Who / system")}</span><span>{l("Evidência", "Evidence")}</span></header>
        {events.map((event) => <div key={`event-${event.id}`}><time>{event.time}</time><span><strong>{t(event.title)}</strong><small>{t(event.detail)}</small></span><span>{event.id === "approved" ? l("Gerente do Projeto", "Project Manager") : "Urso Harness"}</span><span className="mf-simple-status is-draft">{l("Recibo indisponível", "Receipt unavailable")}</span></div>)}
      </section>
    </div>
  );
}

