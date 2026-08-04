"use client";

import type React from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileSearch,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import {
  deriveMfManagerCockpitPresentation,
  deriveMfManagerWorkspace,
} from "@/lib/mf-demo/manager-runtime.mjs";
import type { MfManagerActionItem } from "@/lib/mf-demo/manager-runtime.mjs";
import { mfText } from "@/lib/mf-demo/manifest.mjs";
import type { DemoView, MfHarnessSnapshot } from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";

export type MfManagerWorkspaceProps = {
  snapshot: MfHarnessSnapshot;
  onAdvance: () => void;
  onNavigate: (view: DemoView) => void;
};

type ProgressState = "complete" | "active" | "pending";

function stateIcon(state: MfManagerActionItem["state"]) {
  if (state === "complete") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (state === "in_progress") return <CircleDot size={15} aria-hidden="true" />;
  if (state === "ready") return <Clock3 size={15} aria-hidden="true" />;
  return <LockKeyhole size={15} aria-hidden="true" />;
}

function progressIcon(state: ProgressState) {
  if (state === "complete") return <Check size={14} aria-hidden="true" />;
  if (state === "active") return <CircleDot size={14} aria-hidden="true" />;
  return <Clock3 size={14} aria-hidden="true" />;
}

export function MfManagerWorkspace(props: MfManagerWorkspaceProps): React.JSX.Element {
  const { snapshot, onAdvance, onNavigate } = props;
  const { language } = useMfLanguage();
  const workspace = deriveMfManagerWorkspace(snapshot);
  const presentation = deriveMfManagerCockpitPresentation(snapshot);
  const localize = (value: { pt: string; en: string }) => mfText(value, language);
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);

  const briefing = [
    {
      badge: l("Baseline estável", "Stable baseline"),
      title: l("O projeto segue protegido pela Revisão B", "The project remains protected by Revision B"),
      detail: l("O Brain monitora fontes autorizadas; nenhuma decisão material exige sua ação.", "The Brain is monitoring authorized sources; no material decision requires your action."),
      tone: "stable",
    },
    {
      badge: l("Sinal recebido", "Incoming signal"),
      title: l("Uma revisão do fornecedor entrou no radar", "A supplier revision has entered the radar"),
      detail: l("O Harness preservou o sinal. A Revisão B continua sendo a verdade vigente enquanto a evidência é comparada.", "The Harness preserved the signal. Revision B remains current truth while the evidence is compared."),
      tone: "warning",
    },
    {
      badge: l("Decisão necessária", "Decision required"),
      title: l("DEC-042 requer sua decisão", "DEC-042 requires your decision"),
      detail: l("Quatro mudanças materiais estão documentadas; a Revisão C ainda não é verdade controlada.", "Four material changes are documented; Revision C is not controlled truth yet."),
      tone: "warning",
    },
    {
      badge: l("Coordenação iniciada", "Coordination started"),
      title: l("Revisão C aprovada. Agora mapeie o impacto.", "Revision C approved. Now map the impact."),
      detail: l("DEC-042 foi registrada e o plano de impacto pode definir responsáveis e critérios de fechamento.", "DEC-042 is recorded, and the impact plan can now define owners and closure criteria."),
      tone: "warning",
    },
    {
      badge: l("Impacto conhecido", "Impact known"),
      title: l("Dez equipes precisam de uma direção comum", "Ten teams need one coordinated direction"),
      detail: l("O impacto está mapeado. Os pacotes ainda precisam ser distribuídos antes da execução técnica.", "The impact is mapped. Work packages still need distribution before technical execution."),
      tone: "warning",
    },
    {
      badge: l("Trabalho coordenado", "Coordinated work"),
      title: l("Os pacotes-piloto estão prontos para os papéis atuais de execução", "Pilot work packages are ready for the current execution roles"),
      detail: l("O Harness preparou trabalho para Gerência, Elétrica, BIM, Planejamento e Qualidade; isso não representa atribuição para todas as disciplinas afetadas.", "The Harness prepared work for Project Management, Electrical, BIM, Planning, and Quality; this does not represent assignment across every affected discipline."),
      tone: "warning",
    },
    {
      badge: l("Cenário requerido", "Scenario required"),
      title: l("SCN-003 precisa da sua escolha", "SCN-003 needs your selection"),
      detail: l("Planejamento preparou a recuperação de oito dias. A escolha humana antecede o fechamento das revisões.", "Planning prepared an eight-day recovery. Human selection precedes review closure."),
      tone: "warning",
    },
    {
      badge: l("Liberação requerida", "Release required"),
      title: l("EXE-02 aguarda sua liberação", "EXE-02 awaits your release"),
      detail: l("As revisões técnicas estão concluídas e as evidências do gate estão disponíveis para sua confirmação.", "Technical reviews are complete, and gate evidence is available for your confirmation."),
      tone: "warning",
    },
    {
      badge: l("Resultado protegido", "Protected outcome"),
      title: l("EXE-02 permanece protegido e rastreável", "EXE-02 remains protected and traceable"),
      detail: l("A decisão coordenada preservou o marco, recuperou oito dias e deixou um recibo verificável.", "The coordinated decision protected the milestone, recovered eight days, and left a verifiable receipt."),
      tone: "positive",
    },
  ][snapshot.step];

  const primaryAction = presentation.featuredManagerAction;
  if (!primaryAction) {
    return (
      <section className="mf-manager-workspace" data-manager-fallback aria-label={l("Cockpit do gerente indisponível", "Manager cockpit unavailable")}>
        <header className="mf-manager-briefing" data-guide-key="project-status">
          <div>
            <span className="mf-eyebrow">{l("Briefing do gerente", "Manager briefing")}</span>
            <h1>{l("A ação principal não está disponível", "The primary action is unavailable")}</h1>
            <p>{l("A fila não corresponde ao estado esperado do cenário. O projeto permanece protegido sem executar uma decisão material.", "The queue does not match the expected scenario state. The project remains protected without executing a material decision.")}</p>
          </div>
          <span className="mf-manager-state"><ShieldCheck size={15} aria-hidden="true" />{l("Estado seguro", "Safe state")}</span>
        </header>
        <article className="mf-primary-decision">
          <header><div><span>{l("Ação do gerente", "Manager action")}</span><strong>{l("Indisponível", "Unavailable")}</strong></div><span className="mf-decision-state"><LockKeyhole size={15} aria-hidden="true" />{l("Bloqueado", "Blocked")}</span></header>
          <div className="mf-primary-decision-copy"><h2>{l("Nenhuma ação material pode avançar", "No material action can advance")}</h2><p>{l("Atualize o estado do projeto para reconstruir a fila de trabalho.", "Refresh the project state to rebuild the work queue.")}</p></div>
          <footer><button type="button" className="mf-primary-action" disabled aria-label={l("Ação material indisponível", "Material action unavailable")}><LockKeyhole size={15} />{l("Ação indisponível", "Action unavailable")}</button></footer>
        </article>
      </section>
    );
  }

  const primaryTask = snapshot.workItems.find((task) => task.id === primaryAction.taskId);
  const primaryOwner = workspace.team.teams.find((team) => team.roleId === primaryTask?.ownerRoleId);
  const stateLabels = {
    blocked: l("Bloqueado", "Blocked"),
    ready: l("Pronto para iniciar", "Ready to start"),
    in_progress: l("Em andamento", "In progress"),
    complete: l("Concluído", "Complete"),
  } as const;
  const primaryStateLabel = snapshot.step === 0
    ? l("Monitorado", "Monitored")
    : snapshot.step === 1
      ? l("Sinal recebido", "Incoming")
      : stateLabels[primaryAction.state];
  const primaryStateClass = snapshot.step === 0
    ? "monitored"
    : snapshot.step === 1
      ? "incoming"
      : primaryAction.state;
  const affectedTeamValue = snapshot.step >= 4
    ? String(workspace.controlTower.impactedDisciplines)
    : l("Escopo em análise", "Scope under review");
  const milestoneValue = presentation.milestone.status === "baseline"
    ? l("Baseline", "Baseline")
    : presentation.milestone.status === "exposed"
      ? l(`${presentation.milestone.days} dias expostos`, `${presentation.milestone.days} days exposed`)
      : presentation.milestone.status === "recovery_proposed"
        ? l(`${presentation.milestone.days} dias propostos`, `${presentation.milestone.days} days proposed`)
        : presentation.milestone.status === "recovery_selected"
          ? l(`${presentation.milestone.days} dias selecionados`, `${presentation.milestone.days} days selected`)
          : l(`${presentation.milestone.days} dias protegidos`, `${presentation.milestone.days} days protected`);
  const managerDecisionStatus = workspace.queue.decisionsRequiringAction.length > 0
    ? l("Decisão humana aguardando revisão", "Human decision awaiting review")
    : workspace.queue.actionRequiredCount > 0
      ? l("Ação gerencial em andamento", "Manager action in progress")
      : l("Nenhuma decisão gerencial pendente", "No manager decision pending");
  const affectedTeamStatus = snapshot.step >= 4
    ? l("Impacto confirmado", "Impact confirmed")
    : l("Impacto ainda não confirmado", "Impact not confirmed yet");
  const milestoneStatus = presentation.milestone.selectionRequired
    ? l("Seleção do gerente necessária", "Manager selection required")
    : presentation.milestone.status === "baseline"
      ? l("Baseline preservada", "Baseline holding")
      : presentation.milestone.status === "exposed"
        ? l("Recuperação ainda não selecionada", "Recovery not selected yet")
        : presentation.milestone.status === "recovery_selected"
          ? l("Recuperação selecionada", "Recovery selected")
          : l("Liberação protegida", "Release protected");
  const consequence = snapshot.step < 2
    ? l("A Revisão B permanece vigente até a comparação produzir evidência suficiente.", "Revision B remains current until the comparison produces sufficient evidence.")
    : snapshot.step === 2
      ? l("Sem DEC-042, nenhuma premissa nova pode entrar nos pacotes das equipes.", "Without DEC-042, no new assumption can enter team packages.")
      : snapshot.step === 3
        ? l("A coordenação protege as equipes enquanto o escopo de impacto é confirmado.", "Coordination protects the teams while the impact scope is confirmed.")
        : snapshot.step < 6
          ? l("A coordenação protege as dez equipes contra trabalho baseado em premissas divergentes.", "Coordination protects ten teams from working from divergent assumptions.")
        : snapshot.step === 6
          ? l("A escolha determina se oito dos dez dias de exposição podem ser recuperados.", "The choice determines whether eight of the ten exposed days can be recovered.")
          : l("A liberação confirma que decisões, revisões e evidências sustentam o marco.", "Release confirms that decisions, reviews, and evidence support the milestone.");

  const queueGroups = [
    { id: "now", label: l("Agora", "Now"), items: workspace.queue.now },
    { id: "next", label: l("Depois", "Next"), items: workspace.queue.next },
    { id: "waiting", label: l("Aguardando equipe", "Waiting on team"), items: workspace.queue.waitingOnTeam },
    { id: "done", label: l("Concluído", "Done"), items: workspace.queue.done },
  ];

  const unlocks = [
    { id: "brain", label: l("Verdade do Brain", "Brain truth"), detail: l("Revisão controlada", "Controlled revision"), activeAt: 1, completeAt: 3 },
    { id: "harness", label: l("Atribuição do Harness", "Harness assignment"), detail: l("Responsáveis e critérios", "Owners and criteria"), activeAt: 3, completeAt: 5 },
    { id: "reviews", label: l("Revisões técnicas e humanas", "Technical / human reviews"), detail: l("Saídas verificadas", "Outputs verified"), activeAt: 5, completeAt: 7 },
    { id: "release", label: l("Liberação do gerente", "Manager release"), detail: l("EXE-02 protegido", "EXE-02 protected"), activeAt: 7, completeAt: 8 },
  ].map((item) => ({
    ...item,
    state: snapshot.step >= item.completeAt ? "complete" : snapshot.step >= item.activeAt ? "active" : "pending" as ProgressState,
  }));
  const scenarioControl = presentation.scenarioControl;
  const runScenarioControl = () => {
    if (!scenarioControl) return;
    if (scenarioControl.kind === "advance") onAdvance();
    else if (scenarioControl.targetView) onNavigate(scenarioControl.targetView);
  };

  return (
    <section className="mf-manager-workspace" aria-label={l("Cockpit do gerente", "Manager cockpit")}>
      <header className="mf-manager-briefing" data-guide-key="project-status">
        <div>
          <span className="mf-eyebrow">{l("Briefing do gerente", "Manager briefing")}</span>
          <h1>{briefing.title}</h1>
          <p>{briefing.detail}</p>
        </div>
        <div className="mf-manager-briefing-actions">
          <span className={`mf-manager-state is-${briefing.tone}`}><ShieldCheck size={15} aria-hidden="true" />{briefing.badge}</span>
          {scenarioControl ? <button type="button" className="mf-scenario-control" data-scenario-control onClick={runScenarioControl} aria-label={localize(scenarioControl.label)}>{scenarioControl.kind === "advance" ? <ArrowRight size={15} /> : <Workflow size={15} />}{localize(scenarioControl.label)}</button> : null}
        </div>
      </header>

      <section className="mf-manager-pulse" aria-label={l("Pulso do projeto", "Project pulse")}>
        <article><small>{l("Decisões que exigem você", "Decisions requiring you")}</small><strong data-pulse-value>{workspace.queue.decisionsRequiringAction.length}</strong><span>{managerDecisionStatus}</span></article>
        <article><small>{l("Equipes afetadas", "Affected teams")}</small><strong data-pulse-value>{affectedTeamValue}</strong><span>{affectedTeamStatus}</span></article>
        <article><small>{l("Exposição do marco", "Milestone exposure")}</small><strong data-pulse-value>{milestoneValue}</strong><span>{milestoneStatus}</span></article>
      </section>

      <div className="mf-manager-layout">
        <article className="mf-primary-decision">
          <header>
            <div><span>{l("Decisão / ação principal", "Primary decision / action")}</span><strong>{primaryAction.actionId}</strong></div>
            <span className={`mf-decision-state is-${primaryStateClass}`}>{snapshot.step === 0 ? <ShieldCheck size={15} aria-hidden="true" /> : snapshot.step === 1 ? <CircleDot size={15} aria-hidden="true" /> : stateIcon(primaryAction.state)}{primaryStateLabel}</span>
          </header>
          <div className="mf-primary-decision-copy">
            <span className="mf-eyebrow">{localize(primaryAction.label)}</span>
            <h2>{primaryTask ? localize(primaryTask.title) : localize(primaryAction.label)}</h2>
            <p>{primaryTask ? localize(primaryTask.detail) : consequence}</p>
          </div>
          <dl>
            <div><dt>{l("Prazo", "Due")}</dt><dd><Clock3 size={14} aria-hidden="true" />{localize(primaryAction.due)}</dd></div>
            <div><dt>{l("Responsável humano", "Human owner")}</dt><dd><UsersRound size={14} aria-hidden="true" />{primaryOwner ? localize(primaryOwner.role) : "—"}</dd></div>
            <div><dt>{l("Evidências", "Evidence")}</dt><dd><FileSearch size={14} aria-hidden="true" />{primaryAction.evidenceCount}</dd></div>
            <div><dt>{l("Equipes afetadas / bloqueando", "Affected / blocking teams")}</dt><dd><Workflow size={14} aria-hidden="true" />{affectedTeamValue} / {primaryAction.blockingTeamCount}</dd></div>
          </dl>
          <aside><strong>{l("Consequência", "Consequence")}</strong><p>{consequence}</p></aside>
          {primaryAction.actionId === "DEC-042" || presentation.primaryManagerAction ? (
            <footer>
              {primaryAction.actionId === "DEC-042" ? <button type="button" className="mf-decision-link" onClick={() => onNavigate("changes")} aria-label={l("Revisar evidências da mudança", "Review change evidence")}><FileSearch size={15} />{l("Revisar evidências", "Review evidence")}</button> : null}
              {presentation.primaryManagerAction ? <button type="button" className="mf-primary-action" data-manager-action-cta onClick={onAdvance} disabled={!presentation.primaryManagerAction} aria-label={localize(presentation.primaryManagerAction.label)}><ArrowRight size={15} />{localize(presentation.primaryManagerAction.label)}</button> : null}
            </footer>
          ) : null}
        </article>

        <section className="mf-manager-queue" aria-labelledby="mf-manager-queue-title">
          <header><div><span className="mf-eyebrow">{l("Minha fila", "My queue")}</span><h2 id="mf-manager-queue-title">{l("Controle sem ruído", "Control without noise")}</h2></div><span>{workspace.queue.done.length}/{workspace.queue.done.length + workspace.queue.now.length + workspace.queue.next.length + workspace.queue.waitingOnTeam.length}</span></header>
          <div>
            {queueGroups.map((group) => (
              <section className="mf-manager-queue-group" key={group.id}>
                <header><h3>{group.label}</h3><span>{group.items.length}</span></header>
                {group.items.length > 0 ? group.items.map((item) => (
                  <article key={item.actionId}>
                    <span className={`mf-queue-state is-${item.state}`}>{stateIcon(item.state)}<em>{stateLabels[item.state]}</em></span>
                    <div><strong>{localize(item.label)}</strong><small>{item.actionId} · {localize(item.due)}</small></div>
                    <span>{item.blockingTeamCount > 0 ? l(`${item.blockingTeamCount} equipes bloqueando`, `${item.blockingTeamCount} blocking teams`) : l(`${item.evidenceCount} evidências`, `${item.evidenceCount} evidence items`)}</span>
                  </article>
                )) : <p>{l("Nenhum item nesta etapa.", "No items in this stage.")}</p>}
              </section>
            ))}
          </div>
        </section>
      </div>

      <section className="mf-decision-unlocks" aria-labelledby="mf-decision-unlocks-title">
        <header><span className="mf-eyebrow">{l("O que acontece depois", "What happens next")}</span><h2 id="mf-decision-unlocks-title">{l("Da verdade protegida à liberação humana", "From protected truth to human release")}</h2></header>
        <ol>
          {unlocks.map((item, index) => (
            <li key={item.id} className={`is-${item.state}`}>
              <i>{progressIcon(item.state)}</i>
              <span><small>{String(index + 1).padStart(2, "0")} · {item.state === "complete" ? l("Concluído", "Complete") : item.state === "active" ? l("Em andamento", "In progress") : l("Aguardando", "Waiting")}</small><strong>{item.label}</strong><em>{item.detail}</em></span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
