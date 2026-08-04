"use client";

import type React from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  FileCheck2,
  FileSearch,
  LockKeyhole,
  Network,
  Play,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Wrench,
  Workflow,
} from "lucide-react";
import {
  deriveMfWorkflowAccess,
  deriveMfWorkflowInteraction,
  deriveMfWorkflowPresentation,
} from "@/lib/mf-demo/workflow-runtime.mjs";
import { mfScenarioManifest, mfText } from "@/lib/mf-demo/manifest.mjs";
import type { MfHarnessSnapshot } from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";

export type MfAgentWorkflowProps = {
  snapshot: MfHarnessSnapshot;
  viewerRoleId: string;
  selectedWorkflowId: string;
  onSelectWorkflow: (workflowId: string) => void;
  onAdvance: () => void;
  onOpenOutputs: () => void;
};

function TechnologyGlyph({ id }: { id: string }): React.JSX.Element {
  if (id === "slack") {
    return (
      <svg className="mf-technology-glyph is-slack" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="1" width="5" height="10" rx="2.5" />
        <rect x="13" y="9" width="10" height="5" rx="2.5" />
        <rect x="10" y="13" width="5" height="10" rx="2.5" />
        <rect x="1" y="10" width="10" height="5" rx="2.5" />
      </svg>
    );
  }

  if (id === "teams") {
    return (
      <svg className="mf-technology-glyph is-teams" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="17.5" cy="6" r="3" />
        <path d="M13.5 10h8v7.5a3.5 3.5 0 0 1-3.5 3.5h-4.5z" />
        <path d="M3 5h12v13H3z" />
        <path className="mf-technology-glyph-cut" d="M6.5 8h5v2h-1.5v5h-2V10H6.5z" />
      </svg>
    );
  }

  const glyph = id === "cde" ? "CDE" : id === "revit" ? "R" : id === "primavera-p6" ? "P6" : "UB";
  return <span className={`mf-technology-lettermark is-${id}`} aria-hidden="true">{glyph}</span>;
}

export function MfAgentWorkflow(props: MfAgentWorkflowProps): React.JSX.Element {
  const { snapshot, viewerRoleId, selectedWorkflowId, onSelectWorkflow, onAdvance, onOpenOutputs } = props;
  const { language } = useMfLanguage();
  const localize = (value: { pt: string; en: string }) => mfText(value, language);
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const access = deriveMfWorkflowAccess(viewerRoleId);
  const effectiveWorkflowId = access.workflowIds.includes(selectedWorkflowId)
    ? selectedWorkflowId
    : access.defaultWorkflowId;

  if (!effectiveWorkflowId) {
    return (
      <section className="mf-agent-workflow is-unavailable" aria-labelledby="mf-agent-workflow-title">
        <div className="mf-workflow-unavailable"><LockKeyhole size={20} aria-hidden="true" /><div><span className="mf-eyebrow">{l("Acesso ao workflow", "Workflow access")}</span><h2 id="mf-agent-workflow-title">{l("Nenhum workflow autorizado", "No authorized workflow")}</h2><p>{l("O Brain não encontrou um workflow canônico para este papel.", "The Brain found no canonical workflow for this role.")}</p></div></div>
      </section>
    );
  }

  const presentation = deriveMfWorkflowPresentation(snapshot, effectiveWorkflowId);
  const interaction = deriveMfWorkflowInteraction(presentation, viewerRoleId);

  const modeLabels = {
    live: l("Ao vivo", "Live"),
    demo: l("Adaptador demo", "Demo adapter"),
    pilot: l("Integração piloto", "Pilot integration"),
  } as const;
  const workStateLabels = {
    blocked: l("Bloqueado", "Blocked"),
    ready: l("Aguardando decisão", "Awaiting decision"),
    in_progress: l("Em decisão", "Decision in progress"),
    complete: l("Tarefa de decisão concluída", "Decision task complete"),
  } as const;
  const permissionLabels = {
    read: l("Leitura", "Read"),
    query: l("Consulta", "Query"),
    draft: l("Rascunho", "Draft"),
    write: l("Escrita", "Write"),
  } as const;

  const sourceStatusLabels = {
    connected: l("Conectado", "Connected"),
    available_in_pilot: l("Disponível no piloto", "Available in pilot"),
  } as const;
  const receiptStatusLabels = {
    available: l("Registrado", "Recorded"),
    pending: l("Pendente", "Pending"),
    missing: l("Ausente", "Missing"),
  } as const;
  const stageState = (stageId: string) => interaction.stages.find((stage) => stage.id === stageId)?.state ?? "pending";
  const stageStateLabel = (state: "complete" | "current" | "pending") => {
    if (state === "complete") return l("Concluído", "Complete");
    if (state === "current") return l("Etapa atual", "Current stage");
    return l("Aguardando", "Waiting");
  };
  const proposedTruth = presentation.truth.currentRevision === "B"
    ? l("Rev. C · evidência proposta", "Rev. C · proposed evidence")
    : l("Rev. C · verdade atual aceita", "Rev. C · accepted current truth");
  const visibleRoleDeliveries = viewerRoleId === "project-manager"
    ? presentation.roleDeliveries
    : presentation.roleDeliveries.filter((delivery) => delivery.role.id === viewerRoleId);
  const outputSummary = presentation.gate.receipt.state === "missing"
    ? l("Recibo do gate ausente. Nenhuma saída pode ser emitida.", "Gate receipt missing. No output may be issued.")
    : presentation.outputsReady && presentation.gate.receipt.state === "available"
      ? l("Registros aprovados emitidos com seus recibos.", "Approved records are issued with their receipts.")
      : presentation.outputsReady
        ? l("Existem registros em rascunho. A emissão segue bloqueada até o recibo do gate.", "Draft records exist. Issuance remains blocked until the gate receipt is recorded.")
        : l("As saídas permanecem bloqueadas até a etapa de controle definida.", "Outputs remain locked until their defined control stage.");
  const runAdvance = () => {
    if (!interaction.canAdvance) return;
    onAdvance();
  };

  return (
    <section className="mf-agent-workflow" aria-labelledby="mf-agent-workflow-title">
      <nav className="mf-workflow-tabs" aria-label={l("Selecionar workflow", "Select workflow")}>
        {access.workflows.map((workflow, index) => {
          const owner = mfScenarioManifest.roles.find((role) => role.id === workflow.ownerRoleId);
          const selected = workflow.id === effectiveWorkflowId;
          return (
            <button
              type="button"
              key={workflow.id}
              className={selected ? "is-selected" : ""}
              aria-pressed={selected}
              onClick={() => onSelectWorkflow(workflow.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span><small>{owner ? localize(owner.name) : workflow.runCode}</small><strong>{localize(workflow.title)}</strong></span>
            </button>
          );
        })}
      </nav>

      <div className="mf-workflow-canvas">
        <header className="mf-workflow-canvas-header">
          <div>
            <span className="mf-eyebrow"><Workflow size={14} aria-hidden="true" />{presentation.runCode}</span>
            <h2 id="mf-agent-workflow-title">{localize(presentation.title)}</h2>
            <dl className="mf-workflow-run-brief">
              <div><dt>{l("Gatilho", "Trigger")}</dt><dd>{localize(presentation.trigger)}</dd></div>
              <div><dt>{l("Intenção de controle", "Control intent")}</dt><dd>{localize(presentation.purpose)}</dd></div>
            </dl>
          </div>
          <button type="button" className="mf-primary-action" onClick={runAdvance} disabled={!interaction.canAdvance}>
            {interaction.terminal ? <CheckCircle2 size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            {localize(interaction.action.label)}
          </button>
        </header>

        <div className="mf-workflow-vitals" aria-label={l("Resumo operacional do workflow", "Workflow operating summary")}>
          <span><small>{l("Fontes autorizadas", "Authorized sources")}</small><strong>{presentation.sources.length}</strong></span>
          <span><small>{l("Agentes especializados", "Specialist agents")}</small><strong>{presentation.agents.length}</strong></span>
          <span><small>{l("Gate humano", "Human gate")}</small><strong>{localize(presentation.gate.role.name)}</strong></span>
          <span><small>{l("Saídas controladas", "Controlled outputs")}</small><strong>{presentation.outputs.length}</strong></span>
        </div>

        <section className="mf-workflow-schematic" aria-labelledby="mf-workflow-schematic-title">
          <header>
            <div><span>{l("Fluxo de mudança do projeto", "Project change flow")}</span><strong id="mf-workflow-schematic-title">{l("Da revisão recebida aos pacotes de trabalho emitidos", "From received revision to issued work packages")}</strong></div>
            <code>{presentation.runCode}</code>
          </header>
          <div className="mf-flowchart-grid">
            <section className={`mf-flow-group is-sources is-${stageState("connected_context")}`}>
              <header><span>01</span><div><small>{l("Recebimento", "Source intake")}</small><strong>{l("Fontes autorizadas", "Authorized sources")}</strong></div></header>
              <ul>
                {presentation.sources.map((source) => (
                  <li key={source.id}><TechnologyGlyph id={source.technology.id} /><span><strong>{source.technology.name}</strong><small>{localize(source.name)}</small></span><em>{modeLabels[source.mode]}</em></li>
                ))}
              </ul>
            </section>
            <div className="mf-flow-bus"><span>{l("normalizar", "normalize")}</span><i aria-hidden="true" /><ArrowRight size={16} aria-hidden="true" /></div>
            <article className={`mf-flow-core is-${stageState("brain_boundary")}`}>
              <header><span>02</span><small>{l("Base aprovada", "Approved baseline")}</small></header>
              <ShieldCheck size={21} aria-hidden="true" />
              <strong>{l("Base aprovada do projeto", "Approved project baseline")}</strong>
              <dl><div><dt>{l("Atual", "Current")}</dt><dd>REV. {presentation.truth.currentRevision}</dd></div><div><dt>{l("Escopo", "Scope")}</dt><dd>{presentation.gate.affectedRoleCount} {l("equipes", "teams")}</dd></div></dl>
              <p>{l("Identidade, versão e autoridade verificadas antes da análise.", "Identity, revision, and authority verified before analysis.")}</p>
            </article>
            <div className="mf-flow-bus"><span>{l("distribuir", "scope")}</span><i aria-hidden="true" /><ArrowRight size={16} aria-hidden="true" /></div>
            <section className={`mf-flow-group is-analysis is-${stageState("agents_tools")}`}>
              <header><span>03</span><div><small>{l("Análise de impacto", "Impact analysis")}</small><strong>{l("Trabalho em paralelo", "Parallel work")}</strong></div></header>
              <ul>
                {presentation.agents.map((agent) => (
                  <li key={agent.id}><Bot size={15} aria-hidden="true" /><span><strong>{localize(agent.name)}</strong><small>{localize(agent.tool.name)}</small></span><em>{permissionLabels[agent.tool.permission]}</em></li>
                ))}
              </ul>
            </section>
            <div className="mf-flow-bus"><span>{l("consolidar", "converge")}</span><i aria-hidden="true" /><ArrowRight size={16} aria-hidden="true" /></div>
            <article className={`mf-flow-gate is-${stageState("human_gate")}`}>
              <header><span>04</span><small>{l("Decisão MF", "MF decision")}</small></header>
              <UserCheck size={22} aria-hidden="true" />
              <strong>{l("Aprovação do PM", "PM approval")}</strong>
              <p>{localize(presentation.gate.decision)}</p>
              <em>{localize(presentation.gate.role.name)}</em>
            </article>
            <div className="mf-flow-bus"><span>{l("emitir", "issue")}</span><i aria-hidden="true" /><ArrowRight size={16} aria-hidden="true" /></div>
            <section className={`mf-flow-group is-outputs is-${stageState("controlled_outputs")}`}>
              <header><span>05</span><div><small>{l("Pacotes de trabalho", "Work packages")}</small><strong>{l("Saídas controladas", "Controlled outputs")}</strong></div></header>
              <ul>
                {presentation.outputs.map((output) => (
                  <li key={output.id}>{output.ready ? <CheckCircle2 size={15} aria-hidden="true" /> : <FileCheck2 size={15} aria-hidden="true" />}<span><strong>{localize(output.label)}</strong><small>{output.recipients.map((role) => localize(role.name)).join(" · ")}</small></span><em>{receiptStatusLabels[output.receipt.state]}</em></li>
                ))}
              </ul>
            </section>
          </div>
          <div className="mf-flow-return"><span>{l("Ciclo de auditoria", "Audit loop")}</span><i aria-hidden="true" /><Network size={15} aria-hidden="true" /><strong>{l("evidências · decisões · saídas → histórico do projeto", "evidence · decisions · outputs → project history")}</strong></div>
        </section>

        <details className="mf-workflow-stage-register">
          <summary><span><strong>{l("Abrir registro de controles", "Open control register")}</strong><small>{l("Evidência, permissão e critério de liberação por etapa", "Evidence, permission, and release criteria by stage")}</small></span><em>05 {l("etapas", "stages")}</em></summary>
          <div className="mf-workflow-pipeline" aria-label={l("Registro detalhado do fluxo", "Detailed flow register")}>
          <article className={`mf-workflow-stage is-context is-${stageState("connected_context")}`} aria-current={stageState("connected_context") === "current" ? "step" : undefined}>
            <header><span>01</span><div><small>{stageStateLabel(stageState("connected_context"))}</small><h3>{l("Entradas autorizadas", "Authorized inputs")}</h3></div></header>
            <p>{localize(presentation.trigger)}</p>
            <aside className="mf-harness-context"><TechnologyGlyph id="urso-brain" /><span><strong>{l("Controle de ingresso", "Ingress control")}</strong><small>{l("Somente fontes autorizadas para este fluxo são lidas.", "Only sources authorized for this run are read.")}</small></span></aside>
            <ul className="mf-technology-list">
              {presentation.sources.map((source) => (
                <li key={source.id}>
                  <TechnologyGlyph id={source.technology.id} />
                  <span className="mf-technology-copy"><strong>{source.technology.name}</strong><small>{localize(source.name)} · {source.authorizedRoleIds.length} {l("papéis autorizados", "authorized roles")}</small></span>
                  <span className="mf-source-statuses"><em className={`is-${source.mode}`}>{modeLabels[source.mode]}</em><em className={`mf-source-connection-status is-${source.status}`}>{sourceStatusLabels[source.status]}</em></span>
                </li>
              ))}
            </ul>
          </article>

          <span className="mf-workflow-connector" aria-hidden="true"><small>{l("Compilar", "Compile")}</small><ArrowRight size={17} /></span>

          <article className={`mf-workflow-stage is-brain is-${stageState("brain_boundary")}`} aria-current={stageState("brain_boundary") === "current" ? "step" : undefined}>
            <header><span>02</span><div><small>{stageStateLabel(stageState("brain_boundary"))}</small><h3>{l("Controle de contexto", "Context control")}</h3></div></header>
            <div className="mf-brain-identity"><TechnologyGlyph id="urso-brain" /><span><strong>Urso Brain</strong><small>{l("Identidade · política · verdade temporal", "Identity · policy · temporal truth")}</small></span></div>
            <dl>
              <div><dt>{l("Verdade controlada", "Controlled truth")}</dt><dd>REV. {presentation.truth.currentRevision}</dd></div>
              <div><dt>{l("Evidência", "Evidence")}</dt><dd>{proposedTruth}</dd></div>
              <div><dt>{l("Privilégios", "Privileges")}</dt><dd>{localize(presentation.ownerRole.name)} · {presentation.sources.length} {l("fontes", "sources")}</dd></div>
              <div><dt>{l("Dependências", "Dependencies")}</dt><dd>{presentation.gate.affectedRoleCount} {l("equipes afetadas", "affected teams")}</dd></div>
            </dl>
            <aside><ShieldCheck size={16} aria-hidden="true" /><span><strong>{l("Política de mudança material", "Material-change policy")}</strong><small>{l("Nenhuma verdade material muda sem aprovação humana.", "No material truth changes without human approval.")}</small></span></aside>
          </article>

          <span className="mf-workflow-connector" aria-hidden="true"><small>{l("Autorizar", "Authorize")}</small><ArrowRight size={17} /></span>

          <article className={`mf-workflow-stage is-agents is-${stageState("agents_tools")}`} aria-current={stageState("agents_tools") === "current" ? "step" : undefined}>
            <header><span>03</span><div><small>{stageStateLabel(stageState("agents_tools"))}</small><h3>{l("Execução controlada", "Controlled execution")}</h3></div></header>
            <p>{l("Cada agente tem um objetivo limitado, uma ferramenta e uma permissão explícita.", "Each agent has one bounded objective, one tool, and an explicit permission.")}</p>
            <ul className="mf-agent-tool-list">
              {presentation.agents.map((agent) => (
                <li key={agent.id}>
                  <div><Bot size={15} aria-hidden="true" /><span><strong>{localize(agent.name)}</strong><small>{localize(agent.objective)}</small></span></div>
                  <div><Wrench size={14} aria-hidden="true" /><span><strong>{localize(agent.tool.name)}</strong><small className={`is-${agent.tool.permission}`}>{permissionLabels[agent.tool.permission]} · {agent.tool.permission}</small></span></div>
                </li>
              ))}
            </ul>
          </article>

          <span className="mf-workflow-connector" aria-hidden="true"><small>{l("Submeter", "Submit")}</small><ArrowRight size={17} /></span>

          <article className={`mf-workflow-stage is-gate is-${stageState("human_gate")}`} aria-current={stageState("human_gate") === "current" ? "step" : undefined} data-guide-key="human-review">
            <header><span>04</span><div><small>{stageStateLabel(stageState("human_gate"))}</small><h3>{l("Autorização humana", "Human authorization")}</h3></div></header>
            <div className="mf-human-gate-callout"><UserCheck size={21} aria-hidden="true" /><span><small>{workStateLabels[presentation.gate.state]}</small><strong>{localize(presentation.gate.decision)}</strong></span></div>
            <dl>
              <div><dt>{l("Responsável MF", "Accountable MF role")}</dt><dd>{localize(presentation.gate.role.name)}</dd></div>
              <div><dt>{l("Decisão", "Decision")}</dt><dd>{localize(presentation.gate.task.title)}</dd></div>
              <div><dt>{l("Evidências", "Evidence")}</dt><dd>{presentation.gate.evidenceCount}</dd></div>
              <div><dt>{l("Equipes afetadas", "Affected teams")}</dt><dd>{presentation.gate.affectedRoleCount}</dd></div>
              <div><dt>{l("Recibo do gate", "Gate receipt")}</dt><dd><span className={`mf-receipt-status is-${presentation.gate.receipt.state}`}>{receiptStatusLabels[presentation.gate.receipt.state]}</span>{presentation.gate.receipt.id ? ` · ${presentation.gate.receipt.id}` : ""}</dd></div>
            </dl>
            <p className="mf-no-auto-issuance"><LockKeyhole size={14} aria-hidden="true" />{l("Obrigatório · nenhuma emissão oficial automática", "Required · no automatic official issuance")}</p>
          </article>

          <span className="mf-workflow-connector" aria-hidden="true"><small>{l("Liberar", "Release")}</small><ArrowRight size={17} /></span>

          <article className={`mf-workflow-stage is-outputs is-${stageState("controlled_outputs")}`} aria-current={stageState("controlled_outputs") === "current" ? "step" : undefined}>
            <header><span>05</span><div><small>{stageStateLabel(stageState("controlled_outputs"))}</small><h3>{l("Registros emitidos", "Issued records")}</h3></div></header>
            <p>{outputSummary}</p>
            <ul className="mf-controlled-output-list">
              {presentation.outputs.map((output) => (
                <li key={output.id}>
                  {output.ready && output.receipt.state === "available" ? <CheckCircle2 size={15} aria-hidden="true" /> : <FileCheck2 size={15} aria-hidden="true" />}
                  <span><strong>{localize(output.label)}</strong><small>{output.kind} · {output.recipients.map((role) => localize(role.name)).join(" · ")}</small></span>
                  <em><span className={`mf-receipt-status is-${output.receipt.state}`}>{receiptStatusLabels[output.receipt.state]}</span> · {output.ready ? l("Disponível", "Available") : l("Aguardando disponibilidade", "Awaiting availability")}</em>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onOpenOutputs}>{l("Abrir saídas e evidências", "Open outputs and evidence")}<ArrowRight size={14} aria-hidden="true" /></button>
          </article>
          </div>
        </details>

        <aside className="mf-workflow-receipt">
          <div><Network size={17} aria-hidden="true" /><span><strong>{l("Retorno de auditoria", "Audit return")}</strong><small>{l("Leituras, contexto, ações, decisões e saídas são gravados no histórico do projeto.", "Reads, context, actions, decisions, and outputs are written to project history.")}</small></span></div>
          <span className="mf-receipt-truth"><span className={`mf-receipt-status is-${presentation.gate.receipt.state}`}>{receiptStatusLabels[presentation.gate.receipt.state]}</span><code>{presentation.gate.receipt.id ?? presentation.runCode}</code></span>
        </aside>
      </div>

      <section className="mf-role-delivery" aria-labelledby="mf-role-delivery-title">
        <header><div><span className="mf-eyebrow">{l("Distribuição autorizada", "Authorized delivery")}</span><h2 id="mf-role-delivery-title">{l("Ordens de trabalho por função", "Role-specific work orders")}</h2></div><span><UsersRound size={15} aria-hidden="true" />{visibleRoleDeliveries.length} {l("papéis autorizados", "authorized roles")}</span></header>
        <div>
          {visibleRoleDeliveries.map((delivery) => (
            <article key={delivery.role.id}>
              <header><span>{localize(delivery.role.name).slice(0, 2).toUpperCase()}</span><div><small>{l("Objetivo", "Objective")}</small><h3>{localize(delivery.role.name)}</h3></div></header>
              <p>{localize(delivery.objective)}</p>
              <dl>
                <div><dt>{l("Próxima ação", "Next action")}</dt><dd>{delivery.nextAction ? localize(delivery.nextAction.title) : l("Nenhuma ação aberta", "No open action")}</dd></div>
                <div><dt>{l("Entregável", "Deliverable")}</dt><dd>{localize(delivery.deliverable)}</dd></div>
              </dl>
              <div className="mf-role-delivery-sources"><small>{l("Fontes autorizadas", "Authorized sources")}</small><p>{delivery.sources.length > 0 ? delivery.sources.map((source) => source.technology.name).join(" · ") : l("Nenhuma fonte necessária", "No source required")}</p></div>
              <footer><span><CircleDot size={13} aria-hidden="true" />{delivery.openActionCount} {l("ações", "actions")}</span><span><FileSearch size={13} aria-hidden="true" />{delivery.sourceCount} {l("fontes", "sources")}</span></footer>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
