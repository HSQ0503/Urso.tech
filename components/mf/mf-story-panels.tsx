"use client";

import {
  ArrowRight,
  Check,
  CircleDot,
  Clock3,
  Database,
  FileCheck2,
  GitBranch,
  Link2,
  LockKeyhole,
  Network,
  ShieldCheck,
  Target,
  UserCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import { deriveMfControlTower, getMfRoleWorkspace } from "@/lib/mf-demo/harness-runtime.mjs";
import { mfScenarioManifest, mfText } from "@/lib/mf-demo/manifest.mjs";
import type { MfHarnessSnapshot, MfWorkItem } from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";

function useLabels() {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => language === "pt" ? pt : en;
  const localize = (value: { pt: string; en: string }) => mfText(value, language);
  return { language, l, localize };
}

export function ExecutiveValueBar({ snapshot }: { snapshot: MfHarnessSnapshot }) {
  const { l } = useLabels();
  const tower = deriveMfControlTower(snapshot);
  const values = [
    [l("Marco protegido", "Protected milestone"), tower.milestone],
    [l("Disciplinas afetadas", "Affected disciplines"), `${tower.impactedDisciplines} / 15`],
    [l("Bloqueios abertos", "Open blockers"), String(tower.openBlockers)],
    [l("Exposição", "Exposure"), `${tower.exposureDays} ${l("dias", "days")}`],
    [l("Dias recuperados", "Days recovered"), String(tower.daysRecovered)],
    [l("Prontidão", "Readiness"), `${tower.releaseReadiness}%`],
  ];
  return (
    <section className="mf-executive-value" aria-label={l("Valor operacional", "Operational value")}>
      {values.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
    </section>
  );
}

export function StoryRail({ step }: { step: number }) {
  const { l } = useLabels();
  const phases = [
    [1, l("Mudança detectada", "Change detected")],
    [3, l("Verdade controlada", "Truth controlled")],
    [4, l("Impacto compreendido", "Impact understood")],
    [5, l("Trabalho coordenado", "Work coordinated")],
    [8, l("Liberação protegida", "Release protected")],
  ];
  return (
    <nav className="mf-story-rail" aria-label={l("História de valor", "Value story")}>
      {phases.map(([threshold, label], index) => {
        const active = step >= Number(threshold);
        return <span key={String(label)} className={active ? "is-complete" : ""}><i>{active ? <Check size={11} /> : index + 1}</i>{label}</span>;
      })}
    </nav>
  );
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
  return (
    <section className="mf-story-panel" data-guide-key="connected-sources">
      <header className="mf-story-panel-header">
        <span><Network size={18} /></span>
        <div><small>{l("Contexto conectado", "Connected context")}</small><h2>{l("O Brain conhece a origem e a autoridade de cada contexto", "The Brain knows the origin and authority of every context")}</h2></div>
        <strong>{sources.length} {l("fontes autorizadas", "authorized sources")}</strong>
      </header>
      <div className="mf-source-registry">
        {sources.map((source) => (
          <article key={source.id}>
            <header><Database size={16} /><span><small>{source.system}</small><strong>{localize(source.name)}</strong></span><em className={`is-${source.mode}`}>{modeLabel[source.mode]}</em></header>
            <dl>
              <div><dt>{l("Connection mode", "Connection mode")}</dt><dd>{modeLabel[source.mode]}</dd></div>
              <div><dt>{l("Authority", "Authority")}</dt><dd>{source.authority}</dd></div>
              <div><dt>{l("Freshness", "Freshness")}</dt><dd>{localize(source.freshness)}</dd></div>
              <div><dt>{l("Evidence", "Evidence")}</dt><dd>{source.evidencePaths.length} {l("registros", "records")}</dd></div>
            </dl>
            <footer><UserCheck size={13} /> {localize(source.owner)}</footer>
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
  return (
    <section className="mf-story-panel" data-guide-key="controlled-change">
      <header className="mf-story-panel-header">
        <span><GitBranch size={18} /></span>
        <div><small>{l("Registro de mudança controlada", "Controlled Change Record")}</small><h2>{mfScenarioManifest.decision.id} · {l("Revisão C", "Revision C")}</h2></div>
        <strong className={approved ? "is-positive" : "is-warning"}>{approved ? l("Aprovada", "Approved") : l("Decisão pendente", "Decision pending")}</strong>
      </header>
      <div className="mf-truth-transition">
        <article><small>REV. B</small><strong>{snapshot.truth.revisionB === "current" ? l("Atual e aceita", "Current and accepted") : l("Histórica e superseded", "Historical and superseded")}</strong><span>{before.footprintM.join(" × ")} m · {before.electricalKw} kW · {before.chilledWaterKw} kW · {before.operatingLoadKn} kN</span></article>
        <ArrowRight size={20} />
        <article><small>REV. C</small><strong>{snapshot.truth.revisionC === "current" ? l("Atual e aceita", "Current and accepted") : l("Material e não resolvida", "Material and unresolved")}</strong><span>{after.footprintM.join(" × ")} m · {after.electricalKw} kW · {after.chilledWaterKw} kW · {after.operatingLoadKn} kN</span></article>
      </div>
      <details className="mf-proof-drawer">
        <summary><ShieldCheck size={14} /> {l("Mostrar a prova", "Show the proof")}</summary>
        <div><span><strong>{l("Fonte", "Source")}</strong><small>Data Sheet Rev. C · SUP-118</small></span><span><strong>{l("Regra", "Rule")}</strong><small>{l("Mudança material exige aprovação do PM", "Material change requires PM approval")}</small></span><span><strong>{l("Efeito temporal", "Temporal effect")}</strong><small>{approved ? l("Rev. B preservada como histórica", "Rev. B preserved as historical") : l("Nenhuma verdade alterada", "No truth changed")}</small></span><span><strong>{l("Recibo", "Receipt")}</strong><small>{snapshot.receipts.at(-1)?.id ?? l("Emitido na aprovação", "Issued on approval")}</small></span></div>
      </details>
    </section>
  );
}

function taskStateLabel(task: MfWorkItem, l: (pt: string, en: string) => string) {
  if (task.state === "complete") return l("Concluído", "Complete");
  if (task.state === "in_progress") return l("Em execução", "In progress");
  if (task.state === "ready") return l("Pronto", "Ready");
  return l("Bloqueado", "Blocked");
}

export function ObjectiveWorkflowPanel({ snapshot }: { snapshot: MfHarnessSnapshot }) {
  const { l, localize } = useLabels();
  return (
    <section className="mf-story-panel" data-guide-key="objective-workflow">
      <header className="mf-story-panel-header">
        <span><Target size={18} /></span>
        <div><small>{l("Objetivo do Harness", "Harness objective")}</small><h2>{localize(mfScenarioManifest.objective.title)}</h2><p>{localize(mfScenarioManifest.objective.detail)}</p></div>
        <strong>{snapshot.objective.completedTasks} / {snapshot.objective.totalTasks}</strong>
      </header>
      <div className="mf-objective-workflow">
        {snapshot.workItems.map((task) => {
          const owner = mfScenarioManifest.roles.find((role) => role.id === task.ownerRoleId);
          return (
            <article key={task.id} className={`is-${task.state}`}>
              <header><CircleDot size={14} /><span><small>{owner ? localize(owner.name) : task.ownerRoleId}</small><strong>{localize(task.title)}</strong></span><em>{taskStateLabel(task, l)}</em></header>
              <p>{localize(task.detail)}</p>
              <footer><span><GitBranch size={12} /> {task.dependsOn.length ? task.dependsOn.join(" · ") : l("Sem dependência", "No dependency")}</span>{task.humanGate ? <span><LockKeyhole size={12} /> {l("Human gate", "Human gate")}</span> : null}</footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function EmployeeObjectivePanel({
  snapshot,
  roleId,
}: {
  snapshot: MfHarnessSnapshot;
  roleId: string;
}) {
  const { l, localize } = useLabels();
  const workspace = getMfRoleWorkspace(snapshot, roleId);
  const next = workspace.nextTask;
  return (
    <section className="mf-story-panel mf-employee-objective" data-guide-key="employee-objective">
      <header className="mf-story-panel-header">
        <span><UsersRound size={18} /></span>
        <div><small>{l("Mesmo evento. Contexto e ações autorizados para este papel.", "Same event. Authorized context and actions for this role.")}</small><h2>{localize(workspace.role.objective)}</h2></div>
        <strong>{localize(workspace.role.name)}</strong>
      </header>
      <div className="mf-employee-objective-grid">
        <article><small>{l("Sua próxima ação", "Your next action")}</small><strong>{next ? localize(next.title) : l("Objetivo concluído", "Objective complete")}</strong><p>{next ? localize(next.detail) : localize(workspace.role.deliverable)}</p></article>
        <article><small>{l("Por que você está envolvido", "Why you are involved")}</small><strong>{localize(workspace.role.assignment)}</strong><p>{workspace.downstreamTasks.length} {l("handoffs dependem do seu trabalho", "handoffs depend on your work")}</p></article>
        <article><small>{l("Contexto autorizado", "Authorized context")}</small><strong>{workspace.sources.length} {l("fontes entregues", "sources delivered")}</strong><p>{workspace.sources.map((source) => localize(source.name)).join(" · ")}</p></article>
        <article><small>{l("Entregável", "Deliverable")}</small><strong>{localize(workspace.role.deliverable)}</strong><p>{l("Definition of done", "Definition of done")}: {next ? taskStateLabel(next, l) : l("Aprovado e entregue", "Approved and handed off")}</p></article>
      </div>
      <footer className="mf-employee-gate"><ShieldCheck size={15} /><span><strong>{l("Human gate", "Human gate")}</strong><small>{next?.humanGate ? l("Validação humana obrigatória antes do handoff", "Human validation required before handoff") : l("Handoff automático após critérios completos", "Automatic handoff after criteria are complete")}</small></span></footer>
    </section>
  );
}

export function OutcomeComparisonPanel({ snapshot }: { snapshot: MfHarnessSnapshot }) {
  const { l } = useLabels();
  const tower = deriveMfControlTower(snapshot);
  const rows = [
    [l("Mudança descoberta em comunicação fragmentada", "Change found through fragmented communication"), l("Mudança material identificada e evidenciada", "Material change identified and evidenced")],
    [l("PM procura manualmente quem é afetado", "PM manually finds affected teams"), l("10 disciplinas afetadas mapeadas", "10 affected disciplines mapped")],
    [l("Engenheiros procuram os insumos atuais", "Engineers search for current inputs"), l("Contexto autorizado entregue por papel", "Authorized context delivered by role")],
    [l("Handoffs perseguidos em reuniões", "Handoffs chased in meetings"), l("Dependências coordenadas pelo Harness", "Dependencies coordinated by the Harness")],
    [l("Atraso provável de 10 dias", "Likely 10-day delay"), l(`${tower.daysRecovered} dias recuperados`, `${tower.daysRecovered} days recovered`)],
  ];
  return (
    <section className="mf-story-panel mf-outcome-comparison" data-guide-key="pilot-outcome">
      <header className="mf-story-panel-header"><span><FileCheck2 size={18} /></span><div><small>{l("Resultado operacional", "Operational outcome")}</small><h2>{l("O valor não é a resposta. É o projeto coordenado.", "The value is not the answer. It is the coordinated project.")}</h2></div><strong>{tower.releaseReadiness}%</strong></header>
      <div><header><span>{l("Sem Urso", "Without Urso")}</span><span>{l("Com Urso", "With Urso")}</span></header>{rows.map(([without, withUrso]) => <p key={without}><span>{without}</span><ArrowRight size={14} /><strong>{withUrso}</strong></p>)}</div>
    </section>
  );
}

export function PilotProposalPanel() {
  const { l } = useLabels();
  return (
    <section className="mf-story-panel mf-pilot-proposal" data-guide-key="pilot-proposal">
      <header className="mf-story-panel-header"><span><Workflow size={18} /></span><div><small>{l("Próximo passo", "Next step")}</small><h2>{l("Provar o resultado em um projeto real", "Prove the outcome on one real project")}</h2></div><strong>{l("Piloto de um projeto", "One-project pilot")}</strong></header>
      <div className="mf-pilot-grid">
        <article><small>{l("Escopo", "Scope")}</small><ul><li>{l("Um projeto ativo", "One active project")}</li><li>{l("Um workflow de mudança material", "One material-change workflow")}</li><li>{l("Fontes e papéis selecionados", "Selected sources and roles")}</li><li>{l("Aprovações sob controle humano", "Human-controlled approvals")}</li></ul></article>
        <article><small>{l("Medição", "Measurement")}</small><ul><li>{l("Tempo até mapear o impacto", "Time to map impact")}</li><li>{l("Envelhecimento de ações e dependências", "Action and dependency aging")}</li><li>{l("Esforço de coordenação do PM", "PM coordination effort")}</li><li>{l("Risco e recuperação do marco", "Milestone risk and recovery")}</li></ul></article>
        <article><small>{l("MF participa com", "MF participates with")}</small><ul><li>{l("Sponsor e gerente do projeto", "Sponsor and project manager")}</li><li>{l("Representantes das disciplinas", "Discipline representatives")}</li><li>{l("Acesso às fontes do piloto", "Access to pilot sources")}</li><li>{l("Revisão semanal de resultados", "Weekly outcome review")}</li></ul></article>
      </div>
      <button type="button"><Target size={16} /> {l("Selecionar o projeto e nomear a equipe do piloto", "Select the project and nominate the pilot team")} <ArrowRight size={15} /></button>
      <footer><Clock3 size={13} /> {l("Integração focada em um workflow, não em uma transformação geral da empresa.", "Integration focused on one workflow, not a company-wide transformation.")} <Link2 size={13} /></footer>
    </section>
  );
}
