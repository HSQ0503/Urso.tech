"use client";

import type React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  FileSearch,
  LockKeyhole,
  Network,
  ShieldCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import { disciplines } from "@/lib/mf-demo/fixtures";
import { getMfRoleWorkspace } from "@/lib/mf-demo/harness-runtime.mjs";
import {
  deriveMfManagerQueue,
  deriveMfManagerWorkspace,
  deriveMfTeamCommand,
} from "@/lib/mf-demo/manager-runtime.mjs";
import type {
  MfHandoffStageStatus,
  MfManagerActionItem,
  MfTeamStatus,
} from "@/lib/mf-demo/manager-runtime.mjs";
import { mfScenarioManifest, mfText } from "@/lib/mf-demo/manifest.mjs";
import type { DemoView, DisciplineGroup, MfHarnessSnapshot } from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";

export type MfTeamCommandProps = {
  snapshot: MfHarnessSnapshot;
  selectedRoleId: string;
  onNavigate: (view: DemoView) => void;
};

type DisplayState = "ready" | "in_progress" | "waiting" | "at_risk" | "complete";

const disciplineGroups: Record<DisciplineGroup, { pt: string; en: string }> = {
  brain: { pt: "Decisão e controle", en: "Decision & control" },
  skeleton: { pt: "Infraestrutura física", en: "Physical infrastructure" },
  organs: { pt: "Sistemas da instalação", en: "Facility systems" },
};

function displayState(team: MfTeamStatus): DisplayState {
  if (team.atRisk) return "at_risk";
  if (team.state === "blocked") return "waiting";
  return team.state;
}

function actionDisplayState(action: MfManagerActionItem): DisplayState {
  if (action.state === "blocked") return "waiting";
  return action.state;
}

function handoffDisplayState(stage: MfHandoffStageStatus): DisplayState {
  if (stage.state === "blocked") return "waiting";
  return stage.state;
}

function stateIcon(state: DisplayState): React.JSX.Element {
  if (state === "complete") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (state === "in_progress") return <CircleDot size={15} aria-hidden="true" />;
  if (state === "ready") return <Clock3 size={15} aria-hidden="true" />;
  if (state === "at_risk") return <AlertTriangle size={15} aria-hidden="true" />;
  return <LockKeyhole size={15} aria-hidden="true" />;
}

export function MfTeamCommand(props: MfTeamCommandProps): React.JSX.Element {
  const { snapshot, selectedRoleId, onNavigate } = props;
  const { language } = useMfLanguage();
  const teamCommand = deriveMfTeamCommand(snapshot);
  const managerQueue = deriveMfManagerQueue(snapshot);
  const managerWorkspace = deriveMfManagerWorkspace(snapshot);
  const roleWorkspace = getMfRoleWorkspace(snapshot, selectedRoleId);
  const selectedManifestRole = mfScenarioManifest.roles.find((role) => role.id === selectedRoleId)
    ?? mfScenarioManifest.roles[0];
  const localize = (value: { pt: string; en: string }) => mfText(value, language);
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);

  const stateLabels: Record<DisplayState, string> = {
    ready: l("Pronto", "Ready"),
    in_progress: l("Em andamento", "In progress"),
    waiting: l("Aguardando", "Waiting"),
    at_risk: l("Em risco", "At risk"),
    complete: l("Concluído", "Complete"),
  };
  const isManager = selectedRoleId === "project-manager";
  const nextRoleTask = roleWorkspace.nextTask;
  const authorizedSystems = [...new Set(roleWorkspace.sources.map((source) => source.system))].join(" · ");
  const pilotTeams = teamCommand.teams.filter((team) =>
    mfScenarioManifest.roles.some((role) => role.id === team.roleId),
  );
  const waitingTeamCount = pilotTeams.filter((team) => {
    const state = displayState(team);
    return state === "waiting" || state === "at_risk";
  }).length;
  const managerGroups = [
    { id: "now", label: l("Agora", "Now"), items: managerQueue.now },
    { id: "next", label: l("Depois", "Next"), items: managerQueue.next },
    { id: "waiting", label: l("Aguardando equipe", "Waiting on team"), items: managerQueue.waitingOnTeam },
    { id: "done", label: l("Concluído", "Done"), items: managerQueue.done },
  ];
  const managerActionDestination = (action: MfManagerActionItem): { view: DemoView; label: string } => {
    if (action.actionId === "DEC-042") return { view: "changes", label: l("Revisar mudança", "Review change") };
    if (action.actionId === "SCN-003") return { view: "workflows", label: l("Abrir workflow", "Open workflow") };
    if (action.actionId === "EXE-02" && action.state === "complete") {
      return { view: "audit", label: l("Abrir auditoria", "Open audit") };
    }
    if (action.actionId === "EXE-02") return { view: "artifacts", label: l("Revisar evidências", "Review evidence") };
    return { view: "workflows", label: l("Ver execução", "View execution") };
  };

  return (
    <section className="mf-team-command" data-guide-key="role-work" aria-labelledby="mf-team-command-title">
      <header className="mf-team-command-situation">
        <div>
          <span className="mf-eyebrow">{l("Grupo piloto de execução", "Pilot execution group")}</span>
          <h2 id="mf-team-command-title">
            {isManager ? localize(managerWorkspace.objective.title) : localize(roleWorkspace.role.objective)}
          </h2>
          <p>
            {isManager
              ? l(
                "Este centro coordena os cinco papéis do piloto que possuem pacotes detalhados. As dez disciplinas afetadas continuam visíveis no mapa, mas não receberam todas o mesmo nível de atribuição.",
                "This center coordinates the five pilot roles with detailed work packages. The ten affected disciplines remain visible in the map, but they have not all received the same level of assignment.",
              )
              : nextRoleTask
                ? localize(nextRoleTask.detail)
                : l("Nenhuma próxima ação permanece aberta para este papel.", "No next action remains open for this role.")}
          </p>
        </div>
        <aside>
          {isManager ? (
            <><ShieldCheck size={18} aria-hidden="true" /><span><small>{l("Situação integrada", "Integrated situation")}</small><strong>{localize(managerWorkspace.objective.detail)}</strong></span></>
          ) : (
            <><FileSearch size={18} aria-hidden="true" /><span><small>{l("Contexto autorizado", "Authorized context")}</small><strong>{l(`${roleWorkspace.sources.length} fontes autorizadas`, `${roleWorkspace.sources.length} authorized sources`)}</strong><em>{authorizedSystems || l("Sem fonte necessária nesta etapa", "No source required at this stage")}</em></span></>
          )}
        </aside>
      </header>

      <section className="mf-team-summary" aria-label={l("Resumo do comando", "Command summary")}>
        <article><small>{l("Trabalho ativo", "Active work")}</small><strong>{teamCommand.activeWorkCount}</strong><span>{l("Papéis com tarefa em andamento", "Roles with work in progress")}</span></article>
        <article><small>{l("Decisões para o gerente", "Manager attention decisions")}</small><strong>{managerQueue.decisionsRequiringAction.length}</strong><span>{l("Decisões humanas exigindo atenção", "Human decisions requiring attention")}</span></article>
        <article><small>{l("Equipes em risco / aguardando", "At-risk / waiting teams")}</small><strong>{waitingTeamCount}</strong><span>{l("Prontidão segue a cadeia canônica", "Readiness follows the canonical chain")}</span></article>
      </section>

      <div className="mf-team-command-layout">
        <section className="mf-team-list" aria-labelledby="mf-team-list-title">
          <header><div><span className="mf-eyebrow">{l("Execução do piloto", "Pilot execution")}</span><h3 id="mf-team-list-title">{l("Trabalho por disciplina", "Work by discipline")}</h3></div><span><UsersRound size={14} aria-hidden="true" />{l("Papéis ativos e impactados", "Impacted and active roles")}</span></header>
          <div>
            {pilotTeams.map((team) => {
              const role = mfScenarioManifest.roles.find((candidate) => candidate.id === team.roleId);
              const state = displayState(team);
              const selected = team.roleId === selectedRoleId;
              return (
                <article className={`mf-team-row is-${state}${selected ? " is-selected" : ""}`} key={team.roleId} aria-current={selected ? "true" : undefined}>
                  <div className="mf-team-row-role"><span>{localize(team.role).slice(0, 2).toUpperCase()}</span><div><small>{l("Objetivo", "Objective")}</small><strong>{role ? localize(role.name) : localize(team.role)}</strong><p>{role ? localize(role.objective) : "—"}</p></div></div>
                  <div className="mf-team-row-task"><small>{l("Tarefa canônica atual", "Current canonical task")}</small><strong>{team.currentTask ? localize(team.currentTask.title) : l("Sem tarefa aberta", "No open task")}</strong><p>{team.currentTask ? localize(team.currentTask.detail) : l("O pacote deste papel está concluído.", "This role's package is complete.")}</p></div>
                  <div className="mf-team-row-owner"><small>{l("Responsável", "Accountable")}</small><strong>{localize(team.role)}</strong></div>
                  <span className={`mf-team-state is-${state}`}>{stateIcon(state)}{stateLabels[state]}</span>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="mf-manager-decision-rail" aria-labelledby="mf-manager-attention-title">
          <header><div><span className="mf-eyebrow">{l("Fila canônica", "Canonical queue")}</span><h3 id="mf-manager-attention-title">{l("Atenção do gerente", "Manager attention")}</h3></div><span>{managerQueue.actionRequiredCount}</span></header>
          <div>
            {managerGroups.map((group) => (
              <section key={group.id}>
                <header><h4>{group.label}</h4><span>{group.items.length}</span></header>
                {group.items.length > 0 ? group.items.map((action) => {
                  const state = actionDisplayState(action);
                  const destination = managerActionDestination(action);
                  return (
                    <article key={action.actionId} className={`is-${state}`}>
                      <div className="mf-manager-decision-meta"><strong>{action.actionId}</strong><span className={`mf-team-state is-${state}`}>{stateIcon(state)}{stateLabels[state]}</span></div>
                      <h5>{localize(action.label)}</h5>
                      <p><Clock3 size={13} aria-hidden="true" />{localize(action.due)}</p>
                      <p>{action.blockingTeamCount > 0 ? l(`${action.blockingTeamCount} equipes bloqueando`, `${action.blockingTeamCount} blocking teams`) : l(`${action.evidenceCount} evidências vinculadas`, `${action.evidenceCount} linked evidence items`)}</p>
                      <button type="button" onClick={() => onNavigate(destination.view)}>{destination.label}<ArrowRight size={14} aria-hidden="true" /></button>
                    </article>
                  );
                }) : <p className="mf-team-empty">{l("Nenhuma ação nesta prioridade.", "No action at this priority.")}</p>}
              </section>
            ))}
          </div>
        </aside>
      </div>

      <section className="mf-handoff-chain" aria-labelledby="mf-handoff-chain-title">
        <header><div><span className="mf-eyebrow">{l("Sequência operacional", "Operational sequence")}</span><h3 id="mf-handoff-chain-title">{l("Cadeia crítica de handoff", "Critical handoff chain")}</h3></div><Network size={18} aria-hidden="true" /></header>
        <ol>
          {teamCommand.handoffStages.map((stage, index) => {
            const state = handoffDisplayState(stage);
            return (
              <li className={`is-${state}`} key={stage.id}>
                <i>{stateIcon(state)}</i>
                <span><small>{String(index + 1).padStart(2, "0")}</small><strong>{localize(stage.label)}</strong><em>{stateLabels[state]}</em></span>
              </li>
            );
          })}
        </ol>
      </section>

      <details className="mf-discipline-evidence">
        <summary><span><Workflow size={17} aria-hidden="true" /><strong>{l("Mapa completo das 15 disciplinas", "Full 15-discipline map")}</strong><small>{l("Evidência de cobertura do projeto", "Project coverage evidence")}</small></span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div>
          {(Object.keys(disciplineGroups) as DisciplineGroup[]).map((group) => (
            <section key={group}>
              <header><h4>{language === "pt" ? disciplineGroups[group].pt : disciplineGroups[group].en}</h4><span>{disciplines.filter((discipline) => discipline.group === group).length}</span></header>
              <ul>
                {disciplines.filter((discipline) => discipline.group === group).map((discipline) => {
                  const related = discipline.id === selectedManifestRole.departmentId || discipline.id === selectedRoleId;
                  return (
                    <li className={`${discipline.impact !== "none" ? `is-${discipline.impact}` : ""}${related ? " is-related" : ""}`} key={discipline.id}>
                      <span>{discipline.shortName}</span><div><strong>{language === "pt" ? discipline.name : discipline.englishName}</strong><small>{discipline.impact === "none" ? l("Sem pacote detalhado", "No detailed package") : l("Impacto mapeado", "Impact mapped")}</small></div>{related ? <em>{l("Papel selecionado", "Selected role")}</em> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </section>
  );
}
