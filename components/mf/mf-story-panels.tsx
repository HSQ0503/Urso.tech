"use client";

import {
  ArrowRight,
  Clock3,
  Database,
  FileCheck2,
  GitBranch,
  Network,
  ShieldCheck,
  Target,
  UserCheck,
  Workflow,
} from "lucide-react";
import { deriveMfControlTower } from "@/lib/mf-demo/harness-runtime.mjs";
import { mfScenarioManifest, mfText } from "@/lib/mf-demo/manifest.mjs";
import type { MfHarnessSnapshot } from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";

function useLabels() {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => language === "pt" ? pt : en;
  const localize = (value: { pt: string; en: string }) => mfText(value, language);
  return { l, localize };
}

export function ConnectedSourcesPanel({
  snapshot,
  roleId,
}: {
  snapshot: MfHarnessSnapshot;
  roleId: string;
}) {
  const { l, localize } = useLabels();
  const sources = snapshot.sources.filter((source) => source.authorizedRoleIds.includes(roleId));
  const modeLabel = {
    live: l("Ingestão real do Brain", "Live Brain ingestion"),
    demo: l("Adaptador da demo", "Demo adapter"),
    pilot: l("Integração do piloto", "Pilot integration"),
  } as const;
  const statusLabel = {
    connected: l("Conectado", "Connected"),
    available_in_pilot: l("Disponível no piloto", "Available in pilot"),
  } as const;
  const authorityLabel: Record<string, string> = {
    evidence: l("evidência", "evidence"),
    controlled: l("controlada", "controlled"),
    working: l("trabalho", "working"),
    policy: l("norma", "policy"),
    decision: l("decisão", "decision"),
    coordination: l("coordenação", "coordination"),
    security: l("segurança", "security"),
  };
  return (
    <section className="mf-story-panel" data-guide-key="connected-sources">
      <header className="mf-story-panel-header">
        <span><Network size={18} /></span>
        <div><small>{l("Contexto conectado", "Connected context")}</small><h2>{l("O Brain conhece a origem e a autoridade de cada contexto", "The Brain knows the origin and authority of every context")}</h2></div>
        <strong>{sources.length} {l("fontes autorizadas", "authorized sources")}</strong>
      </header>
      <div className="mf-source-registry">
        {sources.map((source) => (
          <article className="mf-source-row" key={source.id}>
            <div className="mf-source-identity">
              <span className="mf-source-technology">{source.technology.name}</span>
              <span><small>{source.system}</small><strong>{localize(source.name)}</strong></span>
            </div>
            <dl className="mf-source-facts">
              <div><dt>{l("Autoridade", "Authority")}</dt><dd>{authorityLabel[source.authority] ?? source.authority}</dd></div>
              <div><dt>{l("Atualização", "Freshness")}</dt><dd>{localize(source.freshness)}</dd></div>
            </dl>
            <div className="mf-source-connection">
              <em className={`is-${source.status}`}>{statusLabel[source.status]}</em>
              <small>{l("Modo de conexão", "Connection mode")} · {modeLabel[source.mode]}</small>
            </div>
            <details className="mf-source-evidence">
              <summary>
                <Database size={15} />
                <span>{l("Detalhes da evidência", "Evidence details")}</span>
                <strong>{source.evidencePaths.length} {source.evidencePaths.length === 1 ? l("registro", "record") : l("registros", "records")}</strong>
              </summary>
              <div>
                <div className="mf-source-evidence-meta">
                  <span><UserCheck size={13} /><small>{l("Responsável", "Owner")}</small><strong>{localize(source.owner)}</strong></span>
                  <span><Database size={13} /><small>{l("Tipo de contexto", "Context type")}</small><strong>{localize(source.type)}</strong></span>
                </div>
                <ul aria-label={l("Registros de evidência", "Evidence records")}>
                  {source.evidencePaths.map((path) => (
                    <li key={path} title={path}>
                      <FileCheck2 size={13} />
                      <span>{path.split("/").at(-1) ?? path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ControlledChangePanel({ snapshot }: { snapshot: MfHarnessSnapshot }) {
  const { l } = useLabels();
  const before = mfScenarioManifest.revisions.B;
  const after = mfScenarioManifest.revisions.C;
  const approved = snapshot.decision.status === "approved";
  const decisionTask = snapshot.workItems.find((task) => task.id === "approve-controlled-truth");
  return (
    <section className="mf-story-panel" data-guide-key="controlled-change">
      <header className="mf-story-panel-header">
        <span><GitBranch size={18} /></span>
        <div><small>{l("Registro de mudança controlada", "Controlled Change Record")}</small><h2>{mfScenarioManifest.decision.id} · {l("Revisão C", "Revision C")}</h2></div>
        <strong className={approved ? "is-positive" : "is-warning"}>{approved ? l("Aprovada", "Approved") : l("Decisão pendente", "Decision pending")}</strong>
      </header>
      <div className="mf-truth-transition">
        <article><small>REV. B</small><strong>{snapshot.truth.revisionB === "current" ? l("Atual e aceita", "Current and accepted") : l("Histórica e superada", "Historical and superseded")}</strong><span>{before.footprintM.join(" × ")} m · {before.electricalKw} kW · {before.chilledWaterKw} kW · {before.operatingLoadKn} kN</span></article>
        <ArrowRight size={20} />
        <article><small>REV. C</small><strong>{snapshot.truth.revisionC === "current" ? l("Atual e aceita", "Current and accepted") : l("Material e não resolvida", "Material and unresolved")}</strong><span>{after.footprintM.join(" × ")} m · {after.electricalKw} kW · {after.chilledWaterKw} kW · {after.operatingLoadKn} kN</span></article>
      </div>
      <details className="mf-proof-drawer">
        <summary><ShieldCheck size={14} /> {l("Mostrar a prova", "Show the proof")}</summary>
        <div><span><strong>{l("Fonte", "Source")}</strong><small>Data Sheet Rev. C · SUP-118</small></span><span><strong>{l("Regra", "Rule")}</strong><small>{l("Mudança material exige aprovação do PM", "Material change requires PM approval")}</small></span><span><strong>{l("Efeito temporal", "Temporal effect")}</strong><small>{approved ? l("Rev. B preservada como histórica", "Rev. B preserved as historical") : l("Nenhuma verdade alterada", "No truth changed")}</small></span><span><strong>{l("Recibo", "Receipt")}</strong><small>{decisionTask?.receiptId ?? (approved ? l("Recibo indisponível", "Receipt unavailable") : l("Emitido na aprovação", "Issued on approval"))}</small></span></div>
      </details>
    </section>
  );
}

export function OutcomeComparisonPanel({ snapshot }: { snapshot: MfHarnessSnapshot }) {
  const { l } = useLabels();
  const tower = deriveMfControlTower(snapshot);
  const rows = [
    [l("Mudança descoberta em comunicação fragmentada", "Change found through fragmented communication"), l("Mudança material identificada e evidenciada", "Material change identified and evidenced")],
    [l("PM procura manualmente quem é afetado", "PM manually finds affected teams"), l(`${tower.impactedDisciplines} disciplinas afetadas mapeadas`, `${tower.impactedDisciplines} affected disciplines mapped`)],
    [l("Engenheiros procuram os insumos atuais", "Engineers search for current inputs"), l("Contexto autorizado entregue por papel", "Authorized context delivered by role")],
    [l("Handoffs perseguidos em reuniões", "Handoffs chased in meetings"), l("Dependências coordenadas pelo Harness", "Dependencies coordinated by the Harness")],
    [l(`Atraso provável de ${tower.exposureDays} dias`, `Likely ${tower.exposureDays}-day delay`), l(`${tower.daysRecovered} dias recuperados`, `${tower.daysRecovered} days recovered`)],
  ];
  return (
    <section className="mf-story-panel mf-outcome-comparison" data-guide-key="pilot-outcome">
      <header className="mf-story-panel-header"><span><FileCheck2 size={18} /></span><div><small>{l("Resultado operacional", "Operational outcome")}</small><h2>{l("O valor não é a resposta. É o projeto coordenado.", "The value is not the answer. It is the coordinated project.")}</h2></div><strong>{tower.releaseReadiness}%</strong></header>
      <div><header><span>{l("Sem Urso", "Without Urso")}</span><span>{l("Com Urso", "With Urso")}</span></header>{rows.map(([without, withUrso]) => <p key={without}><span data-label={l("Sem Urso", "Without Urso")}>{without}</span><ArrowRight size={14} /><strong data-label={l("Com Urso", "With Urso")}>{withUrso}</strong></p>)}</div>
    </section>
  );
}

export function PilotProposalPanel() {
  const { l } = useLabels();
  return (
    <section className="mf-story-panel mf-pilot-proposal" data-guide-key="pilot-proposal">
      <header className="mf-story-panel-header"><span><Workflow size={18} /></span><div><small>{l("Próximo passo", "Next step")}</small><h2>{l("Provar o resultado em um projeto real", "Prove the outcome on one real project")}</h2></div><strong>{l("Piloto de um projeto", "One-project pilot")}</strong></header>
      <div className="mf-pilot-grid">
        <article><small>{l("Escopo", "Scope")}</small><ul><li>{l("Um projeto ativo", "One active project")}</li><li>{l("Um workflow integrado de mudança material", "One integrated material-change workflow")}</li><li>{l("Múltiplas disciplinas, fontes e papéis", "Multiple disciplines, sources, and roles")}</li><li>{l("Aprovações sob controle humano", "Human-controlled approvals")}</li></ul></article>
        <article><small>{l("Medição", "Measurement")}</small><ul><li>{l("Tempo até mapear o impacto", "Time to map impact")}</li><li>{l("Envelhecimento de ações e dependências", "Action and dependency aging")}</li><li>{l("Esforço de coordenação do PM", "PM coordination effort")}</li><li>{l("Risco e recuperação do marco", "Milestone risk and recovery")}</li></ul></article>
        <article><small>{l("MF participa com", "MF participates with")}</small><ul><li>{l("Sponsor e gerente do projeto", "Sponsor and project manager")}</li><li>{l("Representantes das disciplinas", "Discipline representatives")}</li><li>{l("Acesso às fontes do piloto", "Access to pilot sources")}</li><li>{l("Revisão semanal de resultados", "Weekly outcome review")}</li></ul></article>
      </div>
      <div className="mf-pilot-commitment" role="note" aria-label={l("Decisão solicitada", "Decision requested")}>
        <Target size={17} />
        <span><small>{l("Decisão solicitada", "Decision requested")}</small><strong>{l("Aprovar o piloto, selecionar o projeto e nomear a equipe", "Approve the pilot, select the project, and nominate the team")}</strong></span>
      </div>
      <footer><Clock3 size={13} /> {l("Integração focada em um workflow, não em uma transformação geral da empresa.", "Integration focused on one workflow, not a company-wide transformation.")}</footer>
    </section>
  );
}
