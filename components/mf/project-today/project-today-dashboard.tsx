"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileSearch,
  GitBranch,
  LockKeyhole,
  Network,
  ShieldCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import { mfScenarioManifest, mfText } from "@/lib/mf-demo/manifest.mjs";
import type { DemoView, MfHarnessSnapshot, MfWorkState } from "@/lib/mf-demo/types";
import { useMfLanguage } from "../mf-language";
import { deriveProjectTodayModel } from "./project-today-model";

export type ProjectTodayDashboardProps = {
  snapshot: MfHarnessSnapshot;
  roleId: string;
  onAdvance: () => void;
  onNavigate: (view: DemoView) => void;
};

type Tone = "stable" | "attention" | "critical" | "positive";
type MetricTone = "neutral" | "attention" | "positive";

type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
};

function workStateIcon(state: MfWorkState): ReactNode {
  if (state === "complete") return <CheckCircle2 size={14} aria-hidden="true" />;
  if (state === "in_progress") return <CircleDot size={14} aria-hidden="true" />;
  if (state === "ready") return <Clock3 size={14} aria-hidden="true" />;
  return <LockKeyhole size={14} aria-hidden="true" />;
}

function formatProjectDate(value: string, language: "pt" | "en") {
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`)).replace(".", "").toUpperCase();
}

export function ProjectTodayDashboard(props: ProjectTodayDashboardProps) {
  const { snapshot, roleId, onAdvance, onNavigate } = props;
  const { language } = useMfLanguage();
  const model = deriveProjectTodayModel(snapshot, roleId);
  const revisionDetected = snapshot.step >= 1;
  const revisionCompared = snapshot.step >= 2;
  const impactKnown = snapshot.step >= 4;
  const localize = (value: { pt: string; en: string }) => mfText(value, language);
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const stateLabels: Record<MfWorkState, string> = {
    blocked: l("Aguardando dependência", "Waiting on dependency"),
    ready: l("Pronto para iniciar", "Ready to start"),
    in_progress: l("Em andamento", "In progress"),
    complete: l("Concluído", "Complete"),
  };
  const stageLabels = {
    blocked: l("Aguardando", "Waiting"),
    ready: l("Liberado", "Ready"),
    in_progress: l("Em curso", "In progress"),
    complete: l("Fechado", "Closed"),
  } as const;
  const managerBriefings: Array<{ title: string; detail: string; tone: Tone }> = [
    {
      title: l("Nenhuma decisão aberta. O baseline EXE-02 permanece em 16 de agosto.", "No decision is open. The EXE-02 baseline remains August 16."),
      detail: l("A Revisão B continua vigente e as fontes do projeto estão sendo monitoradas.", "Revision B remains current and project sources are being monitored."),
      tone: "stable",
    },
    {
      title: l("A Revisão C chegou. A baseline continua em B durante a análise.", "Revision C arrived. The baseline remains on B during review."),
      detail: l("A mensagem e o PDF foram registrados; a comparação material é o próximo passo.", "The message and PDF were recorded; material comparison is next."),
      tone: "attention",
    },
    {
      title: l("DEC-042 precisa da sua decisão antes que a Rev. C entre no trabalho.", "DEC-042 needs your decision before Revision C enters the work."),
      detail: l("Quatro diferenças materiais afetam geometria, carga, utilidades e prazo.", "Four material differences affect geometry, load, utilities, and schedule."),
      tone: "critical",
    },
    {
      title: l("Revisão C aprovada. Agora confirme o alcance da coordenação.", "Revision C is approved. Now confirm the coordination scope."),
      detail: l("DEC-042 está registrada; responsáveis e critérios ainda precisam ser ativados.", "DEC-042 is recorded; owners and closure criteria still need activation."),
      tone: "attention",
    },
    {
      title: l("Dez disciplinas foram afetadas. Distribua o trabalho sem perder o marco.", "Ten disciplines are affected. Distribute the work without losing the milestone."),
      detail: l("BIM e Planejamento podem iniciar; Elétrica e Qualidade entram na sequência.", "BIM and Planning can start; Electrical and Quality follow."),
      tone: "attention",
    },
    {
      title: l("Os pacotes estão em execução. Acompanhe as dependências críticas.", "Work packages are in execution. Track the critical dependencies."),
      detail: l("BIM e Planejamento trabalham em paralelo antes da revisão elétrica e do gate.", "BIM and Planning are working in parallel ahead of electrical review and the gate."),
      tone: "attention",
    },
    {
      title: l("Planejamento propõe recuperar oito dos dez dias expostos.", "Planning proposes recovering eight of the ten exposed days."),
      detail: l("SCN-003 aguarda escolha; Elétrica conclui o pacote atualizado em paralelo.", "SCN-003 awaits selection while Electrical completes the updated package."),
      tone: "critical",
    },
    {
      title: l("A cadeia modelada terminou. Registre o controle do piloto.", "The modeled chain is complete. Record the pilot control."),
      detail: l("Esta demonstração não substitui a verificação completa das condições oficiais de EXE-02.", "This demonstration does not replace verification of every official EXE-02 condition."),
      tone: "attention",
    },
    {
      title: l("Controle do piloto registrado; a meta coordenada permanece em 18 de agosto.", "Pilot control recorded; the coordinated target remains August 18."),
      detail: l("A liberação oficial ainda exige fechar ou dispensar todas as disciplinas e interfaces do gate.", "Official release still requires every gate discipline and interface to be closed or waived."),
      tone: "attention",
    },
  ];
  const managerBriefing = managerBriefings[snapshot.step] ?? managerBriefings[0];
  const focusTask = model.focusTask;
  const visibleSources = model.roleWorkspace.sources
    .map((source) => {
      const recordCount = source.id === "supplier-communication"
        ? revisionDetected ? source.evidencePaths.length : 0
        : source.id === "rfi-decisions"
          ? revisionCompared ? source.evidencePaths.length : 0
          : source.id === "controlled-documents"
            ? revisionDetected ? source.evidencePaths.length : 1
            : source.id === "bim-models"
              ? impactKnown ? source.evidencePaths.length : 1
              : source.id === "project-schedule"
                ? snapshot.step >= 6 ? source.evidencePaths.length : 1
                : source.evidencePaths.length;
      return { source, recordCount };
    })
    .filter((item) => item.recordCount > 0);
  const visibleEvidenceRecords = visibleSources.reduce((total, item) => total + item.recordCount, 0);
  const dependencyNames = model.dependencyTasks.map((task) => localize(task.title));
  const technicalBriefing = !revisionDetected
    ? {
        title: l("Nenhuma mudança material aberta para este papel.", "No material change is open for this role."),
        detail: l("A Revisão B continua sendo a única base autorizada para o trabalho.", "Revision B remains the only authorized basis for work."),
        tone: "stable" as Tone,
      }
    : !revisionCompared
      ? {
          title: l("A Revisão C foi recebida, mas ainda não foi comparada.", "Revision C was received but has not been compared yet."),
          detail: l("Aguarde a análise controlada antes de alterar o seu pacote.", "Wait for the controlled comparison before changing your package."),
          tone: "attention" as Tone,
        }
      : focusTask?.state === "complete"
    ? {
        title: l(`${localize(model.role.deliverable)} concluído e registrado.`, `${localize(model.role.deliverable)} is complete and recorded.`),
        detail: l("Revise a saída e acompanhe os handoffs que dependem do seu pacote.", "Review the output and track the handoffs that depend on your package."),
        tone: "positive" as Tone,
      }
    : focusTask?.state === "in_progress"
      ? {
          title: l(`${localize(focusTask.title)} está em execução.`, `${localize(focusTask.title)} is in progress.`),
          detail: localize(focusTask.detail),
          tone: "attention" as Tone,
        }
      : focusTask?.state === "ready"
        ? {
            title: l(`${localize(focusTask.title)} está liberado para início.`, `${localize(focusTask.title)} is ready to start.`),
            detail: localize(focusTask.detail),
            tone: "stable" as Tone,
          }
        : {
            title: dependencyNames.length > 0
              ? l(`Seu pacote aguarda ${dependencyNames.join(" e ")}.`, `Your package is waiting on ${dependencyNames.join(" and ")}.`)
              : l("Nenhuma ação técnica está liberada neste momento.", "No technical action is released at this time."),
            detail: l("Acompanhe a decisão e as dependências antes de trabalhar sobre a Revisão C.", "Track the decision and dependencies before working from Revision C."),
            tone: "stable" as Tone,
          };
  const briefing = model.isManager ? managerBriefing : technicalBriefing;
  const baselineDate = formatProjectDate(model.project.baselineDate, language);
  const recoveryTargetDate = formatProjectDate(model.outcome.coordinatedDate, language);
  const recoveryState = model.managerPresentation.milestone.status;
  const recoverySelected = recoveryState === "recovery_selected" || recoveryState === "pilot_complete";
  const recoveryDefined = recoveryState === "recovery_proposed" || recoverySelected;
  const recoveryPosition = recoveryDefined ? model.outcome.recoveredDays : 0;
  const forecastDate = formatProjectDate(
    !impactKnown
      ? model.project.baselineDate
      : recoverySelected
        ? model.outcome.coordinatedDate
        : model.outcome.sequentialDate,
    language,
  );
  const exposedDays = impactKnown ? model.outcome.exposureDays : 0;
  const pilotCompletion = `${model.controlTower.completedActions}/${model.controlTower.totalActions}`;
  const revisionB = mfScenarioManifest.revisions.B;
  const revisionC = mfScenarioManifest.revisions.C;
  const formatNumber = (value: number) => new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(value);
  const comparisonStatus = revisionDetected
    ? l("comparação em andamento", "comparison in progress")
    : l("revisão ainda não recebida", "revision not received yet");
  const impactStatus = revisionCompared
    ? l("impacto ainda não confirmado", "impact not confirmed yet")
    : l("aguardando comparação", "waiting for comparison");
  const packageState = revisionCompared
    ? focusTask ? stateLabels[focusTask.state] : l("Sem ação aberta", "No open action")
    : revisionDetected
      ? l("Ainda não liberado", "Not released yet")
      : l("Sem pacote aberto", "No package open");
  const releaseTask = snapshot.workItems.find((task) => task.id === "release-exe-02");
  const nonManagerMetrics: Record<string, DashboardMetric[]> = {
    electrical: [
      {
        id: "approved-load",
        label: l("Carga vigente", "Current load"),
        value: `${revisionB.electricalKw} kW`,
        detail: l("premissa da Revisão B", "Revision B assumption"),
        tone: "neutral",
      },
      {
        id: "proposed-load",
        label: l("Carga Revisão C", "Revision C load"),
        value: revisionCompared ? `${revisionC.electricalKw} kW` : "—",
        detail: revisionCompared ? `+${revisionC.electricalKw - revisionB.electricalKw} kW / +15%` : comparisonStatus,
        tone: revisionCompared ? "attention" : "neutral",
      },
      {
        id: "package-state",
        label: l("Pacote elétrico", "Electrical package"),
        value: packageState,
        detail: l("Rev. 8 / revisão técnica", "Rev. 8 / technical review"),
        tone: focusTask?.state === "complete" ? "positive" : "neutral",
      },
      {
        id: "pilot-chain",
        label: l("Cadeia do piloto", "Pilot evidence chain"),
        value: pilotCompletion,
        detail: l("controles modelados fechados", "modeled controls closed"),
        tone: model.controlTower.completedActions === model.controlTower.totalActions ? "positive" : "neutral",
      },
    ],
    bim: [
      {
        id: "envelope-b",
        label: l("Envelope vigente", "Current envelope"),
        value: `${formatNumber(revisionB.footprintM[0])} × ${formatNumber(revisionB.footprintM[1])} m`,
        detail: l("layout da Revisão B", "Revision B layout"),
        tone: "neutral",
      },
      {
        id: "envelope-c",
        label: l("Envelope Revisão C", "Revision C envelope"),
        value: revisionCompared ? `${formatNumber(revisionC.footprintM[0])} × ${formatNumber(revisionC.footprintM[1])} m` : "—",
        detail: revisionCompared ? l("nova geometria do fornecedor", "new supplier geometry") : comparisonStatus,
        tone: revisionCompared ? "attention" : "neutral",
      },
      {
        id: "geometry-delta",
        label: l("Variação geométrica", "Geometry change"),
        value: revisionCompared ? `+${formatNumber(revisionC.footprintM[0] - revisionB.footprintM[0])} m` : "—",
        detail: revisionCompared ? l("no comprimento da linha", "in line length") : comparisonStatus,
        tone: revisionCompared ? "attention" : "neutral",
      },
      {
        id: "package-state",
        label: l("Coordenação BIM", "BIM coordination"),
        value: packageState,
        detail: l("scaffold e interferências", "scaffold and clashes"),
        tone: focusTask?.state === "complete" ? "positive" : "neutral",
      },
    ],
    planning: [
      {
        id: "target-date",
        label: l("Baseline original", "Original baseline"),
        value: baselineDate,
        detail: "EXE-02",
        tone: "neutral",
      },
      {
        id: "uncoordinated-date",
        label: l("Sem coordenação", "Uncoordinated"),
        value: impactKnown ? formatProjectDate(model.outcome.sequentialDate, language) : "—",
        detail: impactKnown ? l("10 dias de exposição", "10 days exposed") : impactStatus,
        tone: impactKnown ? "attention" : "neutral",
      },
      {
        id: "recoverable-days",
        label: l("Recuperação possível", "Recoverable time"),
        value: recoveryDefined ? `${model.outcome.recoveredDays}/${model.outcome.exposureDays}` : "—",
        detail: recoveryDefined
          ? l("dias com revisão paralela", "days with parallel review")
          : impactKnown
            ? l("cenário ainda não modelado", "scenario not modeled yet")
            : impactStatus,
        tone: recoveryDefined ? "positive" : "neutral",
      },
      {
        id: "scenario-state",
        label: l("Cenário SCN-003", "Scenario SCN-003"),
        value: recoveryState === "recovery_proposed"
          ? l("Proposto", "Proposed")
          : recoverySelected
            ? l("Selecionado", "Selected")
            : impactKnown
              ? l("Aguardando", "Waiting")
              : l("Não avaliado", "Not assessed"),
        detail: impactKnown
          ? l("gerente aprova o compromisso", "manager approves the commitment")
          : impactStatus,
        tone: recoverySelected ? "positive" : recoveryState === "recovery_proposed" ? "attention" : "neutral",
      },
    ],
    quality: [
      {
        id: "pilot-chain",
        label: l("Cadeia do piloto", "Pilot evidence chain"),
        value: revisionDetected ? pilotCompletion : "—",
        detail: revisionDetected
          ? l("controles modelados fechados", "modeled controls closed")
          : l("nenhuma mudança material aberta", "no material change open"),
        tone: model.controlTower.completedActions === model.controlTower.totalActions ? "positive" : "neutral",
      },
      {
        id: "remaining-actions",
        label: l("Ações restantes", "Remaining actions"),
        value: revisionDetected ? String(model.controlTower.totalActions - model.controlTower.completedActions) : "—",
        detail: revisionDetected
          ? l("no workflow da Revisão C", "in the Revision C workflow")
          : l("workflow ainda não iniciado", "workflow not started"),
        tone: !revisionDetected
          ? "neutral"
          : model.controlTower.completedActions === model.controlTower.totalActions ? "positive" : "attention",
      },
      {
        id: "release-state",
        label: l("Controle do piloto", "Pilot control"),
        value: snapshot.step >= 8
          ? l("Registrado", "Recorded")
          : revisionDetected && releaseTask ? stateLabels[releaseTask.state] : l("Não aberto", "Not open"),
        detail: snapshot.step >= 8
          ? l("gate oficial ainda separado", "official gate remains separate")
          : revisionDetected ? "EXE-02 / PILOT" : l("sem mudança em curso", "no change in progress"),
        tone: releaseTask?.state === "complete" ? "positive" : "neutral",
      },
      {
        id: "evidence-records",
        label: l("Registros disponíveis", "Available records"),
        value: String(visibleEvidenceRecords),
        detail: l("nas fontes deste papel", "in this role's sources"),
        tone: "neutral",
      },
    ],
  };
  const metrics: DashboardMetric[] = model.isManager
    ? [
        {
          id: "decisions",
          label: l("Decisões com você", "Decisions with you"),
          value: String(model.managerWorkspace.queue.decisionsRequiringAction.length),
          detail: model.managerWorkspace.queue.decisionsRequiringAction.length > 0
            ? l("requer ação agora", "requires action now")
            : snapshot.step === 0
              ? l("baseline controlada; nenhuma mudança aberta", "controlled baseline; no change is open")
              : snapshot.step === 1
                ? l("Revisão C em recebimento e triagem", "Revision C is in intake and triage")
                : l("nenhuma pendência", "nothing pending"),
          tone: model.managerWorkspace.queue.decisionsRequiringAction.length > 0 ? "attention" : "neutral",
        },
        {
          id: "pilot-chain",
          label: l("Cadeia do piloto", "Pilot evidence chain"),
          value: pilotCompletion,
          detail: l("controles modelados fechados", "modeled controls closed"),
          tone: model.controlTower.completedActions === model.controlTower.totalActions ? "positive" : "neutral",
        },
        {
          id: "disciplines",
          label: l("Disciplinas afetadas", "Affected disciplines"),
          value: snapshot.step >= 4 ? String(model.controlTower.impactedDisciplines) : "—",
          detail: snapshot.step >= 4
            ? l("de 15 avaliadas", "of 15 assessed")
            : snapshot.step === 0
              ? l("sem mudança aberta", "no change is open")
              : snapshot.step === 1
                ? l("aguardando comparação", "waiting for comparison")
                : l("mapeamento de impacto pendente", "impact mapping pending"),
          tone: "neutral",
        },
        {
          id: "forecast",
          label: l("Previsão atual", "Current forecast"),
          value: forecastDate,
          detail: !impactKnown
            ? l(`baseline ${baselineDate}`, `baseline ${baselineDate}`)
            : recoveryState === "recovery_proposed"
              ? l(`meta ${recoveryTargetDate} aguarda seleção`, `${recoveryTargetDate} target awaits selection`)
              : recoverySelected
                ? l(`meta coordenada do piloto ${recoveryTargetDate}`, `coordinated pilot target ${recoveryTargetDate}`)
                : l("10 dias de exposição identificada", "10 days of exposure identified"),
          tone: impactKnown ? "attention" : "neutral",
        },
      ]
    : nonManagerMetrics[roleId] ?? [];
  const managerAction = model.managerPresentation.featuredManagerAction;
  const managerBaseline = model.isManager && snapshot.step === 0;
  const managerIntake = model.isManager && snapshot.step === 1;
  const managerPilotControl = model.isManager && snapshot.step === 7;
  const managerPilotComplete = model.isManager && snapshot.step === 8;
  const technicalIntake = !model.isManager && !revisionCompared;
  const primaryTask = model.isManager && managerAction
    ? snapshot.workItems.find((task) => task.id === managerAction.taskId) ?? focusTask
    : focusTask;
  const primaryCode = managerBaseline
    ? "CONTROLLED-BASELINE"
    : managerIntake
      ? "REV-C-INTAKE"
    : managerPilotControl
      ? "PILOT-CONTROL"
    : managerPilotComplete
      ? "PILOT-COMPLETE"
    : technicalIntake
      ? revisionDetected ? "REV-C-INTAKE" : "REV-B-BASELINE"
      : model.isManager
    ? managerAction?.actionId ?? model.storyStage.state.toUpperCase()
    : primaryTask?.id.toUpperCase() ?? roleId.toUpperCase();
  const primaryState: MfWorkState = managerBaseline || (!model.isManager && !revisionDetected)
    ? "complete"
    : primaryTask?.state ?? "complete";
  const primaryStateLabel = managerBaseline || (!model.isManager && !revisionDetected)
    ? l("Monitorado", "Monitored")
    : snapshot.step === 1
      ? l("Sinal recebido", "Signal received")
      : stateLabels[primaryState];
  const primaryTitle = managerBaseline
    ? l("Monitorar a baseline controlada", "Monitor the controlled baseline")
    : managerIntake
      ? l("Inspecionar a entrada da Revisão C", "Inspect the Revision C intake")
    : managerPilotControl
      ? l("Registrar o controle do piloto", "Record the pilot control")
    : managerPilotComplete
      ? l("Cadeia de evidências do piloto concluída", "Pilot evidence chain complete")
    : technicalIntake
      ? revisionDetected
        ? l("Aguardar a comparação da Revisão C", "Wait for the Revision C comparison")
        : l("Trabalhar somente sobre a Revisão B", "Work only from Revision B")
      : primaryTask
    ? localize(primaryTask.title)
    : localize(model.role.deliverable);
  const primaryDetail = managerBaseline
    ? l("Nenhuma mudança material foi detectada. As fontes conectadas continuam sob monitoramento.", "No material change has been detected. Connected sources remain monitored.")
    : managerIntake
      ? l("A mensagem e o PDF foram registrados; a comparação material ainda não foi concluída.", "The message and PDF were recorded; the material comparison is not complete yet.")
    : managerPilotControl
      ? l("Confirme os oito controles modelados sem declarar que todas as condições oficiais de EXE-02 foram fechadas.", "Confirm the eight modeled controls without declaring that every official EXE-02 condition is closed.")
    : managerPilotComplete
      ? l("Os oito controles modelados foram registrados. A liberação oficial depende das condições completas do gate.", "All eight modeled controls were recorded. Official release depends on the full gate conditions.")
    : technicalIntake
      ? revisionDetected
        ? l("Nenhum pacote técnico será liberado até que as diferenças materiais sejam registradas.", "No technical package will be released until the material differences are recorded.")
        : l("Não há mudança aberta para este papel; a Revisão B permanece vigente.", "No change is open for this role; Revision B remains current.")
      : primaryTask
    ? localize(primaryTask.detail)
    : l("Nenhuma ação permanece aberta para este papel.", "No action remains open for this role.");
  const primaryOwner = model.managerWorkspace.team.teams.find(
    (team) => team.roleId === primaryTask?.ownerRoleId,
  );
  const managerActionEvidenceCount = managerAction
    ? visibleSources.filter(({ source }) => managerAction.evidenceSourceIds.includes(source.id)).length
    : visibleSources.length;
  const primaryEvidenceCount = model.isManager
    ? managerBaseline ? visibleSources.length : managerActionEvidenceCount
    : visibleSources.length;
  const primaryDependencyCount = model.isManager
    ? managerBaseline ? 0 : managerAction?.blockingTeamCount ?? 0
    : model.dependencyTasks.filter((task) => task.state !== "complete").length;
  const priorityLabel = managerBaseline
    ? l("Controle atual", "Current control")
    : managerIntake
      ? l("Prioridade atual", "Current priority")
      : model.isManager && model.managerPresentation.managerActionPlacement === "upcoming"
        ? l("Próxima ação controlada", "Next controlled action")
        : model.isManager && model.managerPresentation.managerActionPlacement === "completed"
          ? l("Última ação controlada", "Latest controlled action")
          : l("Prioridade atual", "Current priority");
  const displayedStage = snapshot.step >= 8
    ? l("Evidência do piloto concluída", "Pilot evidence complete")
    : localize(model.storyStage.stage);
  const materialChangeStatus = snapshot.step === 0
    ? l("NENHUMA / MONITORADA", "NONE / MONITORED")
    : snapshot.step === 1
      ? l("REV. C / EM TRIAGEM", "REV. C / INTAKE")
      : snapshot.decision.status === "approved"
        ? "DEC-042 / " + l("APROVADA", "APPROVED")
        : "DEC-042 / " + l("PENDENTE", "PENDING");
  const managerPrimaryCtaLabel = managerPilotControl
    ? l("Registrar controle do piloto", "Record pilot control")
    : model.managerPresentation.primaryManagerAction
      ? localize(model.managerPresentation.primaryManagerAction.label)
      : "";
  const scenarioControl = model.isManager ? model.managerPresentation.scenarioControl : null;
  const runScenarioControl = () => {
    if (!scenarioControl) return;
    if (scenarioControl.kind === "advance") onAdvance();
    else if (scenarioControl.targetView) onNavigate(scenarioControl.targetView);
  };
  const technicalPrimaryTarget: DemoView = technicalIntake
    ? "changes"
    : primaryState === "complete"
    ? "artifacts"
    : primaryState === "blocked"
      ? "disciplines"
      : "workflows";
  const technicalPrimaryLabel = technicalIntake
    ? l("Ver estado da mudança", "View change status")
    : primaryState === "complete"
    ? l("Abrir entrega", "Open deliverable")
    : primaryState === "blocked"
      ? l("Ver dependências", "View dependencies")
      : l("Abrir meu workflow", "Open my workflow");
  const visibleManagerQueue = model.managerQueue.filter((item) => {
    const task = snapshot.workItems.find((candidate) => candidate.id === item.taskId);
    return item.state === "complete" || (task?.managerAction?.actionAt ?? Number.POSITIVE_INFINITY) <= snapshot.step;
  });
  const registerRows = model.isManager
    ? snapshot.step === 0
      ? [{
          key: "controlled-baseline",
          state: "complete" as MfWorkState,
          label: l("Baseline controlada monitorada", "Controlled baseline monitored"),
          detail: l("Nenhuma mudança material está aberta.", "No material change is open."),
          reference: "REV-B",
        }]
      : snapshot.step === 1
        ? [{
            key: "revision-c-intake",
            state: "blocked" as MfWorkState,
            label: l("Receber e comparar a Revisão C", "Receive and compare Revision C"),
            detail: l("A baseline continua em B até a decisão controlada.", "The baseline remains on B until the controlled decision."),
            reference: "REV-C / UNRESOLVED",
          }]
        : visibleManagerQueue.map((item) => {
        const task = snapshot.workItems.find((candidate) => candidate.id === item.taskId);
        return {
          key: item.actionId,
          state: item.state,
          label: item.actionId === "EXE-02" ? l("Registrar controle do piloto", "Record pilot control") : localize(item.label),
          detail: item.actionId === "EXE-02"
            ? l("Registra a cadeia modelada; não substitui o gate oficial.", "Records the modeled chain; does not replace the official gate.")
            : task ? localize(task.detail) : "—",
          reference: item.actionId === "EXE-02" ? "EXE-02 / PILOT" : item.actionId,
        };
      })
    : !revisionDetected
      ? [{
          key: `${roleId}-baseline`,
          state: "complete" as MfWorkState,
          label: l("Baseline do papel monitorada", "Role baseline monitored"),
          detail: localize(model.role.objective),
          reference: "REV-B",
        }]
      : !revisionCompared
        ? [{
            key: `${roleId}-intake`,
            state: "blocked" as MfWorkState,
            label: l("Aguardar comparação controlada", "Wait for controlled comparison"),
            detail: l("Nenhum trabalho da Revisão C foi liberado.", "No Revision C work has been released."),
            reference: "REV-C / UNRESOLVED",
          }]
        : model.roleWorkspace.tasks.map((task) => ({
            key: task.id,
            state: task.state,
            label: localize(task.title),
            detail: localize(task.detail),
            reference: task.artifactId,
          }));
  const completionStyle = {
    "--mf-today-completion": `${Math.round((model.controlTower.completedActions / model.controlTower.totalActions) * 100)}%`,
  } as CSSProperties;

  return (
    <section className="mf-project-today" data-role={roleId} aria-label={l("Painel do projeto hoje", "Project today dashboard")}>
      <header className={`mf-today-command is-${briefing.tone}`} data-guide-key="project-status">
        <div className="mf-today-command-copy">
          <span className="mf-today-kicker">{model.project.name.toUpperCase()} / {displayedStage}</span>
          <h1>{l("Projeto hoje", "Project today")}</h1>
          <p>{briefing.title}</p>
          <small>{briefing.detail}</small>
        </div>
        <div className="mf-today-command-side">
          <span className="mf-today-role"><UsersRound size={15} />{localize(model.role.name)}</span>
          <span className="mf-today-state"><i />{displayedStage}</span>
          {scenarioControl ? (
            <button type="button" className="mf-today-scenario" data-scenario-control onClick={runScenarioControl}>
              {scenarioControl.kind === "advance" ? <ArrowRight size={15} /> : <Workflow size={15} />}
              {localize(scenarioControl.label)}
            </button>
          ) : null}
        </div>
        <dl className="mf-today-project-meta">
          <div><dt>{l("Revisão vigente", "Current revision")}</dt><dd>REV. {snapshot.truth.currentRevision}</dd></div>
          <div><dt>{l("Mudança material", "Material change")}</dt><dd>{materialChangeStatus}</dd></div>
          <div><dt>{l("Próximo gate", "Next gate")}</dt><dd>{model.project.milestone} / {forecastDate}</dd></div>
          <div><dt>{l("Objetivo do papel", "Role objective")}</dt><dd>{localize(model.role.objective)}</dd></div>
        </dl>
      </header>

      <section className="mf-today-instruments" aria-label={l("Indicadores do projeto e do papel", "Project and role indicators")}>
        {metrics.map((metric, index) => (
          <article key={metric.id} className={`is-${metric.tone}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <small>{metric.label}</small>
            <strong data-project-metric={metric.id}>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <div className="mf-today-command-grid">
        <article className="mf-today-priority">
          <header>
            <div><span>{priorityLabel}</span><strong>{primaryCode}</strong></div>
            <span className={`mf-today-work-state is-${primaryState}`}>{workStateIcon(primaryState)}{primaryStateLabel}</span>
          </header>
          <div className="mf-today-priority-copy">
            <span>{model.isManager ? l("Controle do projeto", "Project control") : localize(model.role.name)}</span>
            <h2>{primaryTitle}</h2>
            <p>{primaryDetail}</p>
          </div>
          <dl>
            <div><dt>{l("Responsável", "Owner")}</dt><dd><UsersRound size={14} />{primaryOwner ? localize(primaryOwner.role) : localize(model.role.name)}</dd></div>
            <div><dt>{l("Fontes", "Sources")}</dt><dd><FileSearch size={14} />{primaryEvidenceCount}</dd></div>
            <div><dt>{l("Dependências abertas", "Open dependencies")}</dt><dd><GitBranch size={14} />{primaryDependencyCount}</dd></div>
            <div><dt>{l("Entrega", "Deliverable")}</dt><dd><Network size={14} />{localize(model.role.deliverable)}</dd></div>
          </dl>
          <aside>
            <strong>{l("Critério de controle", "Control condition")}</strong>
            <p>{model.isManager
              ? l("Nenhuma premissa, data ou liberação muda sem a ação humana indicada acima.", "No assumption, date, or release changes without the human action shown above.")
              : l("Use apenas as fontes listadas para este papel e registre a revisão técnica antes do handoff.", "Use only the sources listed for this role and record the technical review before handoff.")}</p>
          </aside>
          <footer>
            {model.isManager && managerAction?.actionId === "DEC-042" ? (
              <button type="button" className="mf-today-secondary" onClick={() => onNavigate("changes")} disabled={snapshot.step === 0} data-evidence-status={snapshot.step > 0 ? "available" : "upcoming"}>
                <FileSearch size={15} />{snapshot.step > 0 ? l("Revisar evidências", "Review evidence") : l("Evidência em breve", "Evidence upcoming")}
              </button>
            ) : null}
            {model.isManager && model.managerPresentation.primaryManagerAction ? (
              <button type="button" className="mf-today-primary" data-manager-action-cta onClick={onAdvance}>
                <ArrowRight size={15} />{managerPrimaryCtaLabel}
              </button>
            ) : null}
            {!model.isManager ? (
              <>
                <button type="button" className="mf-today-secondary" onClick={() => onNavigate("brain")}><Network size={15} />{l("Abrir mapa", "Open map")}</button>
                <button type="button" className="mf-today-primary" onClick={() => onNavigate(technicalPrimaryTarget)}>{technicalPrimaryLabel}<ArrowRight size={15} /></button>
              </>
            ) : null}
          </footer>
        </article>

        <aside className="mf-today-gate" style={completionStyle} aria-label={l("Cadeia de evidências do piloto", "Pilot evidence chain")}>
          <header><div><span>{l("Próximo gate", "Next gate")}</span><strong>EXE-02</strong></div><CalendarDays size={20} /></header>
          <div className="mf-today-evidence-progress">
            <div><strong>{model.controlTower.completedActions}</strong><span>/ {model.controlTower.totalActions}</span></div>
            <p>{l("controles modelados fechados", "modeled controls closed")}</p>
            <i aria-hidden="true"><b /></i>
          </div>
          <ol>
            {model.handoffStages.map((stage, index) => (
              <li key={stage.id} className={`is-${stage.state}`}>
                <i>{stage.state === "complete" ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</i>
                <span><strong>{stage.id === "release" ? l("Controle do piloto", "Pilot control") : localize(stage.label)}</strong><small>{stageLabels[stage.state]}</small></span>
              </li>
            ))}
          </ol>
          <footer><ShieldCheck size={14} /><span>{l("Esta cadeia cobre o piloto; o gate oficial ainda exige todas as disciplinas e interfaces fechadas ou dispensadas.", "This chain covers the pilot; the official gate still requires every discipline and interface to be closed or waived.")}</span></footer>
        </aside>
      </div>

      <section className="mf-today-schedule" aria-labelledby="mf-today-schedule-title">
        <header>
          <div><span>{l("Prazo e recuperação", "Schedule and recovery")}</span><h2 id="mf-today-schedule-title">{l("EXE-02 / trajetória até a liberação", "EXE-02 / path to release")}</h2></div>
          <span className={exposedDays > 0 ? "is-attention" : ""}>{snapshot.step >= 8 ? l("PILOTO CONCLUÍDO", "PILOT COMPLETE") : exposedDays > 0 ? l("EXPOSIÇÃO ATIVA", "ACTIVE EXPOSURE") : l("BASELINE VIGENTE", "BASELINE CURRENT")}</span>
        </header>
        <div className="mf-today-schedule-values">
          <article><small>{l("Baseline original", "Original baseline")}</small><strong>{baselineDate}</strong><span>{model.project.milestone}</span></article>
          <article><small>{l("Exposição identificada", "Identified exposure")}</small><strong>{exposedDays}</strong><span>{l("dias", "days")}</span></article>
          <article><small>{l("Posição de recuperação", "Recovery position")}</small><strong>{recoveryPosition}</strong><span>{recoveryState === "recovery_proposed" ? l("dias propostos", "days proposed") : recoverySelected ? l("dias selecionados", "days selected") : l("ainda não calculada", "not yet calculated")}</span></article>
          <article><small>{l("Previsão do cronograma", "Schedule forecast")}</small><strong>{forecastDate}</strong><span>{!impactKnown
            ? l("baseline vigente", "current baseline")
            : recoverySelected
              ? l("meta coordenada do piloto", "coordinated pilot target")
              : recoveryState === "recovery_proposed"
                ? l(`proposta ${recoveryTargetDate} aguarda seleção`, `${recoveryTargetDate} proposal awaits selection`)
                : l("antes da decisão de recuperação", "before recovery decision")}</span></article>
        </div>
        <div className="mf-today-schedule-track" aria-hidden="true">
          <span className="is-target"><i /><strong>{baselineDate}</strong><small>{l("BASELINE", "BASELINE")}</small></span>
          <b className={recoveryDefined ? "has-recovery" : ""} />
          <span className="is-exposed"><i /><strong>{impactKnown ? formatProjectDate(model.outcome.sequentialDate, language) : "—"}</strong><small>{impactKnown ? l("SEM COORDENAÇÃO", "UNCOORDINATED") : l("IMPACTO PENDENTE", "IMPACT PENDING")}</small></span>
          <em className={recoverySelected ? "is-protected" : ""}>{l("PREVISÃO", "FORECAST")} / {forecastDate}</em>
        </div>
      </section>

      <div className="mf-today-detail-grid">
        <section className="mf-today-register" aria-labelledby="mf-today-register-title">
          <header><div><span>{model.isManager ? l("Registro de decisão", "Decision register") : l("Meu trabalho", "My work")}</span><h2 id="mf-today-register-title">{localize(model.role.name)}</h2></div><span>{registerRows.length}</span></header>
          <div className="mf-today-table" role="table">
            <div role="row" className="mf-today-table-head"><span role="columnheader">{l("Estado", "State")}</span><span role="columnheader">{l("Ação", "Action")}</span><span role="columnheader">{l("Referência", "Reference")}</span></div>
            {registerRows.map((item) => (
              <div role="row" key={item.key} className={item.state === "in_progress" || item.state === "ready" ? "is-current" : ""}>
                <span role="cell" className={`mf-today-table-state is-${item.state}`}>{workStateIcon(item.state)}{stateLabels[item.state]}</span>
                <span role="cell"><strong>{item.label}</strong><small>{item.detail}</small></span>
                <span role="cell">{item.reference}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mf-today-sources" aria-labelledby="mf-today-sources-title">
          <header><div><span>{l("Contexto autorizado", "Authorized context")}</span><h2 id="mf-today-sources-title">{l("Fontes deste papel", "Sources for this role")}</h2></div><span>{visibleSources.length}</span></header>
          <ul>
            {visibleSources.map(({ source, recordCount }) => (
              <li key={source.id}>
                <span>{source.system.slice(0, 3).toUpperCase()}</span>
                <div><strong>{localize(source.name)}</strong><small>{source.system} / {localize(source.freshness)}</small></div>
                <em>{recordCount} {l("reg.", "rec.")}</em>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mf-today-team" aria-labelledby="mf-today-team-title">
        <header><div><span>{l("Coordenação do projeto", "Project coordination")}</span><h2 id="mf-today-team-title">{l("Trabalho por papel", "Work by role")}</h2></div><p>{l(`${model.activeTeams.length} papéis com trabalho liberado ou em curso`, `${model.activeTeams.length} roles with ready or active work`)}</p></header>
        <div className="mf-today-team-table" role="table">
          <div role="row" className="mf-today-team-head"><span role="columnheader">{l("Papel", "Role")}</span><span role="columnheader">{l("Trabalho atual", "Current work")}</span><span role="columnheader">{l("Aberto / concluído", "Open / complete")}</span><span role="columnheader">{l("Estado", "State")}</span></div>
          {model.managerWorkspace.team.teams.map((team) => (
            <div role="row" key={team.roleId} className={team.roleId === roleId ? "is-selected" : ""}>
              <span role="cell"><strong>{localize(team.role)}</strong><small>{team.roleId === roleId ? l("papel selecionado", "selected role") : team.roleId.toUpperCase()}</small></span>
              <span role="cell">{!revisionDetected
                ? l("Baseline controlada em monitoramento", "Controlled baseline under monitoring")
                : !revisionCompared
                  ? team.roleId === "project-manager"
                    ? l("Receber e comparar a Revisão C", "Receive and compare Revision C")
                    : l("Aguardar comparação controlada", "Wait for controlled comparison")
                  : team.roleId === "project-manager" && snapshot.step >= 7
                    ? l("Registrar controle do piloto", "Record pilot control")
                    : team.currentTask ? localize(team.currentTask.title) : l("Sem ação aberta", "No open action")}</span>
              <span role="cell">{revisionCompared ? `${team.openActionCount} / ${team.completedActionCount}` : "0 / 0"}</span>
              <span role="cell" className={`mf-today-team-state is-${revisionCompared ? team.state : "blocked"}`}>
                {revisionCompared ? workStateIcon(team.state) : <Clock3 size={14} aria-hidden="true" />}
                {revisionCompared
                  ? stateLabels[team.state]
                  : revisionDetected
                    ? l("Não liberado", "Not released")
                    : l("Monitorado", "Monitored")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
