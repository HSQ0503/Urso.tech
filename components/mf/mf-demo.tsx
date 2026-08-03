"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleGauge,
  FileClock,
  FileStack,
  GitPullRequestArrow,
  History,
  Keyboard,
  Languages,
  LogOut,
  Menu,
  PanelRightClose,
  Play,
  Presentation,
  RotateCcw,
  Search,
  ShieldCheck,
  Timer,
  UsersRound,
  WifiOff,
  Workflow,
  X,
} from "lucide-react";
import {
  activityEvents,
  artifacts,
  askUrsoAnswers,
  project,
  roles,
} from "@/lib/mf-demo/fixtures";
import {
  nextActionLabels,
  projectRisk,
  scenarioLabels,
} from "@/lib/mf-demo/scenario";
import type {
  ArtifactReviewState,
  DemoView,
  MfDemoSessionCredentials,
  MfDemoSessionView,
} from "@/lib/mf-demo/types";
import {
  ArtifactsView,
  AuditView,
  BrainView,
  ChangesView,
  ControlTowerView,
  DisciplinesView,
  WorkflowsView,
} from "./demo-views";
import { ArtifactWorkspace } from "./artifact-workspace";
import { MfLogo } from "./mf-logo";
import { MfLanguageProvider, useMfLanguage } from "./mf-language";
import { ExecutiveValueBar, StoryRail } from "./mf-story-panels";

const navigation = [
  { id: "control", label: "Projeto hoje", icon: CircleGauge },
  { id: "changes", label: "Mudança e aprovação", icon: GitPullRequestArrow },
  { id: "brain", label: "Cérebro do projeto", icon: BrainCircuit },
  { id: "disciplines", label: "Minha equipe", icon: UsersRound },
  { id: "workflows", label: "Trabalhar com Urso", icon: Workflow },
  { id: "audit", label: "Decisões e histórico", icon: History },
] as const satisfies ReadonlyArray<{ id: DemoView; label: string; icon: typeof CircleGauge }>;

const viewForStep: DemoView[] = [
  "control",
  "changes",
  "changes",
  "changes",
  "changes",
  "disciplines",
  "artifacts",
  "workflows",
  "control",
];

const guideKeyForStep = [
  "project-status",
  "change-source",
  "change-comparison",
  "human-approval",
  "change-impact",
  "role-work",
  "work-produced",
  "human-review",
  "project-release",
] as const;

const sessionStorageKey = "mf-demo-session-v2";

const presenterCues = {
  pt: [
    { say: "Começamos com um projeto estável e uma única verdade aprovada.", proof: "Baseline coordenada · gate em 14 dias" },
    { say: "Uma mudança chega pelo ambiente em que a equipe já trabalha.", proof: "Mensagem e anexo preservados do Slack" },
    { say: "Urso identifica a diferença, mas não muda o projeto sozinho.", proof: "Quatro deltas materiais · aprovação pendente" },
    { say: "A autoridade humana transforma evidência em verdade vigente.", proof: "DEC-042 · Rev. B preservada como superseded" },
    { say: "O Brain entende quem depende dessa decisão e por quê.", proof: "10 de 15 disciplinas acionadas" },
    { say: "O harness converte impacto em trabalho com dono e critério.", proof: "Pacotes disciplinares e dependências registradas" },
    { say: "Ferramentas produzem rascunhos verificáveis, não respostas soltas.", proof: "Cálculo, BIM, prazo, checklist e comunicação" },
    { say: "Engenheiros validam e aprovam antes de qualquer liberação.", proof: "Receipts de aprovação e trilha auditável" },
    { say: "O marco volta a ficar seguro com evidência completa.", proof: "Gate EXE-02 pronto · risco controlado" },
  ],
  en: [
    { say: "We begin with a stable project and one approved source of truth.", proof: "Coordinated baseline · gate in 14 days" },
    { say: "A change arrives through the environment the team already uses.", proof: "Slack message and attachment preserved" },
    { say: "Urso identifies the difference but does not change the project on its own.", proof: "Four material deltas · approval pending" },
    { say: "Human authority turns evidence into current project truth.", proof: "DEC-042 · Rev. B preserved as superseded" },
    { say: "The Brain understands who depends on that decision and why.", proof: "10 of 15 disciplines activated" },
    { say: "The harness converts impact into work with an owner and completion criterion.", proof: "Discipline packages and dependencies recorded" },
    { say: "Tools produce verifiable drafts, not disconnected answers.", proof: "Calculation, BIM, schedule, checklist, and communication" },
    { say: "Engineers validate and approve before anything is released.", proof: "Approval receipts and auditable history" },
    { say: "The milestone becomes safe again with complete evidence.", proof: "Gate EXE-02 ready · risk controlled" },
  ],
} as const;

function answerForScenario(step: number, questionIndex: number) {
  const scriptedAnswer = askUrsoAnswers[questionIndex];

  if (questionIndex === 2 && step < 3) {
    return {
      ...scriptedAnswer,
      answer:
        "A Revisão B continua vigente. A Revisão C foi preservada como evidência e comparada, mas permanece proposta até o Gerente do Projeto registrar a decisão.",
      sources: "Histórico de versões · Mudança proposta CHG-024",
    };
  }

  if (questionIndex === 1 && step < 5) {
    return {
      ...scriptedAnswer,
      answer:
        "O aumento de 15% da carga foi identificado, mas o pacote elétrico ainda não existe. Primeiro a mudança precisa ser aprovada e o impacto propagado para Elétrica.",
      sources: "Data Sheet Rev. C §4.2 · Estado atual do WF-REV-C-001",
    };
  }

  if (questionIndex === 3) {
    if (step >= 8) {
      return {
        ...scriptedAnswer,
        answer: "Nada crítico permanece aberto. O gate EXE-02 possui decisões, artefatos, aprovações e evidências completas e está pronto para liberação.",
        sources: "Checklist EXE-02 · Histórico de receipts · WF-REV-C-001",
      };
    }
    if (step < 5) {
      return {
        ...scriptedAnswer,
        answer:
          "Ainda faltam o plano de impacto, os pacotes por disciplina, a execução das ferramentas, as aprovações técnicas e a verificação final do gate.",
        sources: "Gate EXE-02 · Estado atual do WF-REV-C-001",
      };
    }
    if (step < 7) {
      return {
        ...scriptedAnswer,
        answer:
          "Os pacotes já foram distribuídos. Faltam executar ou validar os oito artefatos, fechar duas interferências BIM e confirmar o plano de recuperação.",
        sources: "Pacotes disciplinares · Gate EXE-02 · WF-REV-C-001",
      };
    }
  }

  return scriptedAnswer;
}

function ViewContent({
  view,
  step,
  roleId,
  onNavigate,
  onAdvance,
  onOpenArtifact,
  artifactReviewStates,
  sessionId,
  sessionToken,
  snapshot,
}: {
  view: DemoView;
  step: number;
  roleId: string;
  onNavigate: (view: DemoView) => void;
  onAdvance: () => void;
  onOpenArtifact: (artifactId: string) => void;
  artifactReviewStates: Record<string, ArtifactReviewState>;
  sessionId?: string;
  sessionToken?: string;
  snapshot?: MfDemoSessionView["snapshot"];
}) {
  const props = { step, roleId, onNavigate, onAdvance, onOpenArtifact, artifactReviewStates, sessionId, sessionToken, snapshot };
  if (view === "control") return <ControlTowerView {...props} />;
  if (view === "changes") return <ChangesView {...props} />;
  if (view === "disciplines") return <DisciplinesView {...props} roleId={roleId} />;
  if (view === "workflows") return <WorkflowsView {...props} />;
  if (view === "artifacts") return <ArtifactsView {...props} />;
  if (view === "brain") return <BrainView {...props} />;
  return <AuditView {...props} />;
}

function MfDemoShell() {
  const { language, setLanguage, t } = useMfLanguage();
  const [sessionCredentials, setSessionCredentials] = useState<MfDemoSessionCredentials | null>(null);
  const [demoSession, setDemoSession] = useState<MfDemoSessionView | null>(null);
  const [sessionHydrating, setSessionHydrating] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<DemoView>("control");
  const [roleId, setRoleId] = useState(roles[0].id);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [presenterMode, setPresenterMode] = useState(false);
  const [presentationLobbyOpen, setPresentationLobbyOpen] = useState(true);
  const [presentationSessionActive, setPresentationSessionActive] = useState(false);
  const presentationStartRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const step = demoSession?.snapshot.step ?? 0;
  const artifactReviewStates = useMemo<Record<string, ArtifactReviewState>>(() => Object.fromEntries(
    artifacts.map((artifact) => {
      const workItem = demoSession?.snapshot.workItems.find((task) => task.artifactId === artifact.id);
      const reviewState: ArtifactReviewState = workItem?.state === "complete" || step >= 8
        ? "approved"
        : step >= 7
          ? "validated"
          : "draft";
      return [artifact.id, reviewState];
    }),
  ), [demoSession?.snapshot, step]);
  const risk = projectRisk(step);
  const visibleActivity = activityEvents.filter((event) => step >= event.availableAt).reverse();
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;
  const approvedArtifacts = artifacts.filter((artifact) => artifactReviewStates[artifact.id] === "approved");
  const activeAnswer = answerForScenario(step, selectedQuestion);
  const presenterCue = presenterCues[language][step];
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const activeNavigationItem = navigation.find((item) => item.id === activeView) ?? navigation[0];

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      setSessionHydrating(true);
      setTransitionError(null);
      try {
        let credentials: MfDemoSessionCredentials | null = null;
        const stored = window.sessionStorage.getItem(sessionStorageKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as MfDemoSessionCredentials;
            if (parsed.sessionId && parsed.token) credentials = parsed;
          } catch {
            window.sessionStorage.removeItem(sessionStorageKey);
          }
        }

        let response = credentials
          ? await fetch("/api/mf/brain/scenario", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "load", ...credentials }),
            })
          : null;

        if (!response?.ok) {
          response = await fetch("/api/mf/brain/scenario", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "create" }),
          });
          const created = (await response.json()) as {
            sessionId?: string;
            token?: string;
            session?: MfDemoSessionView;
            error?: string;
          };
          if (!response.ok || !created.sessionId || !created.token || !created.session) {
            throw new Error(created.error ?? "Unable to create the MF demo session.");
          }
          credentials = { sessionId: created.sessionId, token: created.token };
          window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(credentials));
          if (!cancelled) {
            setSessionCredentials(credentials);
            setDemoSession(created.session);
            setRoleId(created.session.selectedRoleId);
            setActiveView(viewForStep[created.session.snapshot.step]);
          }
          return;
        }

        const loaded = (await response.json()) as { session?: MfDemoSessionView; error?: string };
        if (!loaded.session || !credentials) throw new Error(loaded.error ?? "Unable to load the MF demo session.");
        if (!cancelled) {
          setSessionCredentials(credentials);
          setDemoSession(loaded.session);
          setRoleId(loaded.session.selectedRoleId);
          setActiveView(viewForStep[loaded.session.snapshot.step]);
        }
      } catch (error) {
        if (!cancelled) setTransitionError(error instanceof Error ? error.message : "MF demo session unavailable.");
      } finally {
        if (!cancelled) setSessionHydrating(false);
      }
    }

    void hydrateSession();
    return () => { cancelled = true; };
  }, []);

  const synchronizeScenarioStep = useCallback(async (nextStep: number, nextRoleId = roleId) => {
    if (!sessionCredentials || !demoSession || transitioning) return false;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const response = await fetch("/api/mf/brain/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "transition",
          ...sessionCredentials,
          expectedStep: demoSession.snapshot.step,
          targetStep: nextStep,
          idempotencyKey: `${sessionCredentials.sessionId}-${demoSession.version}-${nextStep}-${crypto.randomUUID()}`,
          roleId: nextRoleId,
        }),
      });
      const payload = (await response.json()) as { session?: MfDemoSessionView; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "Scenario transition failed.");
      setDemoSession(payload.session);
      setRoleId(payload.session.selectedRoleId);
      setActiveView(viewForStep[payload.session.snapshot.step]);
      return true;
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : "Scenario transition failed.");
      return false;
    } finally {
      setTransitioning(false);
    }
  }, [demoSession, roleId, sessionCredentials, transitioning]);

  const selectRole = useCallback(async (nextRoleId: string) => {
    if (!sessionCredentials || transitioning) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const response = await fetch("/api/mf/brain/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "select-role", ...sessionCredentials, roleId: nextRoleId }),
      });
      const payload = (await response.json()) as { session?: MfDemoSessionView; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "Role switch failed.");
      setDemoSession(payload.session);
      setRoleId(payload.session.selectedRoleId);
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : "Role switch failed.");
    } finally {
      setTransitioning(false);
    }
  }, [sessionCredentials, transitioning]);

  function navigate(view: DemoView) {
    setActiveView(view);
    setMobileNavigationOpen(false);
  }

  function advance() {
    if (step >= 8 || transitioning) return;
    void synchronizeScenarioStep(step + 1);
  }

  function rewind() {
    if (step === 0 || transitioning) return;
    void synchronizeScenarioStep(step - 1);
  }

  const reset = useCallback(async () => {
    const resetComplete = await synchronizeScenarioStep(0, roles[0].id);
    if (!resetComplete) return false;
    setActiveView("control");
    setRoleId(roles[0].id);
    setMobileNavigationOpen(false);
    setAssistantOpen(false);
    setSelectedArtifactId(null);
    setSelectedQuestion(0);
    setDraftQuestion("");
    return true;
  }, [synchronizeScenarioStep]);

  async function startPresentation() {
    if (!await reset()) return;
    setPresenterMode(true);
    setPresentationSessionActive(true);
    setPresentationLobbyOpen(false);
  }

  function startGuidedTour() {
    setPresenterMode(true);
    setPresentationLobbyOpen(false);
    setActiveView(viewForStep[step]);
  }

  function exploreDemo() {
    setPresenterMode(false);
    setPresentationSessionActive(false);
    setPresentationLobbyOpen(false);
  }

  function restartPresentation() {
    void reset().then((complete) => {
      if (complete) setPresenterMode(true);
    });
  }

  function endPresentation() {
    setPresenterMode(false);
    setPresentationSessionActive(false);
    setPresentationLobbyOpen(true);
  }

  function openArtifact(artifactId: string) {
    setAssistantOpen(false);
    setSelectedArtifactId(artifactId);
  }

  useEffect(() => {
    function handlePresenterShortcut(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAssistantOpen(false);
        setMobileNavigationOpen(false);
        if (!presentationSessionActive) setPresenterMode(false);
        return;
      }

      if (presentationLobbyOpen || assistantOpen || selectedArtifactId || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.key === "ArrowRight" && step < 8) {
        event.preventDefault();
        void synchronizeScenarioStep(step + 1);
      } else if (event.key === "ArrowLeft" && step > 0) {
        event.preventDefault();
        void synchronizeScenarioStep(step - 1);
      } else if (event.key.toLocaleLowerCase("pt-BR") === "r") {
        event.preventDefault();
        void reset();
      } else if (event.key.toLocaleLowerCase("pt-BR") === "g") {
        event.preventDefault();
        setPresenterMode((current) => {
          if (!current) setActiveView(viewForStep[step]);
          return !current;
        });
      }
    }

    window.addEventListener("keydown", handlePresenterShortcut);
    return () => window.removeEventListener("keydown", handlePresenterShortcut);
  }, [assistantOpen, presentationLobbyOpen, presentationSessionActive, reset, selectedArtifactId, step, synchronizeScenarioStep]);

  useEffect(() => {
    if (presentationLobbyOpen) presentationStartRef.current?.focus();
  }, [presentationLobbyOpen]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeView, step]);

  useEffect(() => {
    if (!presenterMode || presentationLobbyOpen) return;

    const frame = window.requestAnimationFrame(() => {
      const main = mainRef.current;
      const target = main?.querySelector<HTMLElement>(`[data-guide-key="${guideKeyForStep[step]}"]`);
      if (!main || !target) return;

      const mainRect = main.getBoundingClientRect();
      const guide = document.querySelector<HTMLElement>(".mf-presenter-guide");
      const guideRect = guide?.getBoundingClientRect();
      const guideOverlap = guideRect ? Math.max(0, mainRect.bottom - guideRect.top + 16) : 0;
      const visibleHeight = Math.max(220, main.clientHeight - guideOverlap - 28);
      const targetRect = target.getBoundingClientRect();
      const targetTop = main.scrollTop + targetRect.top - mainRect.top;
      const centeredOffset = Math.max(24, (visibleHeight - Math.min(targetRect.height, visibleHeight)) / 2);

      main.scrollTo({ top: Math.max(0, targetTop - centeredOffset), behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeView, presentationLobbyOpen, presenterMode, step]);

  function submitScriptedQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = draftQuestion.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedQuestion) return;

    if (normalizedQuestion.includes("elétr") || normalizedQuestion.includes("electr")) setSelectedQuestion(1);
    else if (normalizedQuestion.includes("document") || normalizedQuestion.includes("revis")) setSelectedQuestion(2);
    else if (normalizedQuestion.includes("liber") || normalizedQuestion.includes("falta") || normalizedQuestion.includes("missing")) setSelectedQuestion(3);
    else setSelectedQuestion(0);

    setDraftQuestion("");
  }

  return (
    <div
      className={`mf-app mf-fieldbook mf-clarity ${presentationSessionActive ? "is-presentation-session" : ""}`}
      data-scenario-step={step}
      data-guide-active={presenterMode ? guideKeyForStep[step] : undefined}
      lang={language === "pt" ? "pt-BR" : "en"}
    >
      <a className="mf-skip-link" href="#mf-main">
        {t("Ir para o conteúdo")}
      </a>

      {transitionError ? (
        <div className="mf-session-error" role="alert">
          <WifiOff size={15} />
          <span>{transitionError}</span>
          <button type="button" onClick={() => void synchronizeScenarioStep(step)} disabled={transitioning || sessionHydrating}>
            {language === "pt" ? "Tentar novamente" : "Retry"}
          </button>
        </div>
      ) : null}

      <header className="mf-topbar">
        <button
          type="button"
          className="mf-mobile-menu"
          aria-label={t("Abrir navegação")}
          aria-expanded={mobileNavigationOpen}
          onClick={() => setMobileNavigationOpen(true)}
        >
          <Menu size={20} />
        </button>
        <div className="mf-brand-block">
          <MfLogo />
          <span className="mf-brand-divider" />
          <span className="mf-product-name">
            Project Intelligence
            <small>Powered by Urso</small>
          </span>
        </div>

        <div className="mf-project-selector" aria-label={t("Projeto ativo")}>
          <span className="mf-project-identity">
            <small>{language === "pt" ? "Projeto ativo" : "Active project"}</small>
            <strong>{project.name}</strong>
            <em>MF-UR-F3 · {t(project.phase)} · {project.location}</em>
          </span>
          <span className="mf-current-location">
            <small>{language === "pt" ? "Você está em" : "You are in"}</small>
            <strong>{t(activeNavigationItem.label)}</strong>
          </span>
          <small className="mf-demo-tag">DEMO</small>
        </div>

        <div className="mf-ribbon-stat">
          <span>{t("Etapa")}</span>
          <strong>{t(project.stage)}</strong>
        </div>
        <div className="mf-ribbon-stat mf-milestone-stat">
          <span>{t("Próximo marco")}</span>
          <strong>EXE-02 · {step >= 3 && step < 8 ? t("em risco") : t("14 dias")}</strong>
        </div>
        <div className={`mf-risk-badge is-${risk.tone}`}>
          <span />
          <div>
            <small>{t("Risco")}</small>
            <strong>{t(risk.label)}</strong>
          </div>
        </div>

        <div className="mf-topbar-actions">
          <div className="mf-language-toggle" role="group" aria-label={language === "pt" ? "Idioma" : "Language"}>
            <Languages size={14} aria-hidden="true" />
            <button type="button" aria-pressed={language === "pt"} onClick={() => setLanguage("pt")}>PT</button>
            <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
          </div>

          <button
            type="button"
            className={`mf-guided-entry ${presenterMode ? "is-active" : ""}`}
            aria-pressed={presenterMode}
            aria-label={presenterMode ? (language === "pt" ? "Sair do tour" : "Exit tour") : (language === "pt" ? "Tour guiado" : "Guided tour")}
            onClick={presenterMode ? () => setPresenterMode(false) : startGuidedTour}
          >
            <Presentation size={16} />
            <span>{presenterMode ? (language === "pt" ? "Sair do tour" : "Exit tour") : (language === "pt" ? "Tour guiado" : "Guided tour")}</span>
          </button>

          <button
            type="button"
            className="mf-ask-button"
            aria-label={t("Abrir Brain e chat")}
            onClick={() => navigate("brain")}
          >
            <Bot size={17} />
            <span>{t("Abrir Brain e chat")}</span>
          </button>
        </div>
      </header>

      <div className="mf-shell">
        <aside className={`mf-sidebar ${mobileNavigationOpen ? "is-open" : ""}`}>
          <div className="mf-mobile-sidebar-header">
            <MfLogo compact />
            <button type="button" aria-label={t("Fechar navegação")} onClick={() => setMobileNavigationOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="mf-project-code">
            <span>MF-UR-F3</span>
            <strong>{t("Ambiente do projeto")}</strong>
          </div>
          <section className="mf-role-context" aria-label={t("Seu papel no projeto")}>
            <span className="mf-eyebrow">{t("Você está trabalhando como")}</span>
            <div>
              <i>{t(selectedRole.name).slice(0, 2).toUpperCase()}</i>
              <span>
                <strong>{t(selectedRole.name)}</strong>
                <small>{t(selectedRole.focus)}</small>
              </span>
            </div>
            <label>
              <span>{t("Trocar papel ou equipe")}</span>
              <select value={roleId} onChange={(event) => void selectRole(event.target.value)} disabled={sessionHydrating || transitioning}>
                {roles.map((role) => <option key={role.id} value={role.id}>{t(role.name)}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </section>
          <span className="mf-nav-section-label">{language === "pt" ? "Espaço do projeto" : "Project workspace"}</span>
          <nav aria-label={t("Navegação do projeto")}>
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              const badge =
                item.id === "changes" && step >= 1 && step < 8
                  ? "1"
                  : null;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={active ? "is-active" : ""}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{t(item.label)}</span>
                  {badge ? <small>{badge}</small> : null}
                </button>
              );
            })}
          </nav>
          <div className="mf-system-health">
            <span className="mf-eyebrow">{t("Conexões")}</span>
            <ul>
              <li><span className="is-online" /> Slack / Teams <small>{t("ativo")}</small></li>
              <li><span className="is-online" /> {language === "pt" ? "Documentos" : "Documents"} <small>{t("ativo")}</small></li>
              <li><span className="is-demo" /> BIM / CDE <small>demo</small></li>
              <li><span className="is-demo" /> {t("Cronograma")} <small>demo</small></li>
            </ul>
          </div>
          <div className="mf-presenter-controls">
            <span className="mf-eyebrow">{t("Controles da demo")}</span>
            <div>
              <button type="button" aria-label={t("Voltar uma etapa")} onClick={rewind} disabled={step === 0}>
                <ArrowLeft size={15} />
              </button>
              <button type="button" aria-label={t("Reiniciar demonstração")} onClick={reset}>
                <RotateCcw size={15} />
              </button>
              <button type="button" aria-label={t("Avançar uma etapa")} onClick={advance} disabled={step === 8}>
                <ArrowRight size={15} />
              </button>
            </div>
            <span className="mf-step-counter">{String(step).padStart(2, "0")} / 08</span>
            <button
              type="button"
              className={`mf-presentation-entry ${presentationSessionActive ? "is-active" : ""}`}
              onClick={() => setPresentationLobbyOpen(true)}
              disabled={presentationSessionActive}
            >
              {presentationSessionActive ? <Presentation size={14} /> : <Play size={14} />}
              {presentationSessionActive ? t("Apresentação ao vivo") : t("Iniciar apresentação")}
            </button>
            <button
              type="button"
              className={`mf-guide-toggle ${presenterMode ? "is-active" : ""}`}
              aria-pressed={presenterMode}
              onClick={presenterMode ? () => setPresenterMode(false) : startGuidedTour}
            >
              <Presentation size={14} /> {presenterMode ? t("Ocultar guia") : (language === "pt" ? "Iniciar tour guiado" : "Start guided tour")}
            </button>
            <small className="mf-shortcuts"><kbd>←</kbd><kbd>→</kbd> {t("navegar")} · <kbd>R</kbd> {t("reiniciar")} · <kbd>G</kbd> guide</small>
          </div>
        </aside>

        {mobileNavigationOpen ? (
          <button
            type="button"
            className="mf-sidebar-scrim"
            aria-label={t("Fechar navegação")}
            onClick={() => setMobileNavigationOpen(false)}
          />
        ) : null}

        <main ref={mainRef} id="mf-main" className="mf-main" tabIndex={-1}>
          {demoSession ? <div className="mf-main-story"><ExecutiveValueBar snapshot={demoSession.snapshot} /><StoryRail step={step} /></div> : null}
          <ViewContent
            view={activeView}
            step={step}
            roleId={roleId}
            onNavigate={navigate}
            onAdvance={advance}
            onOpenArtifact={openArtifact}
            artifactReviewStates={artifactReviewStates}
            sessionId={sessionCredentials?.sessionId}
            sessionToken={sessionCredentials?.token}
            snapshot={demoSession?.snapshot}
          />
        </main>

        <aside className="mf-activity-rail" aria-label={t("Atividade do projeto")}>
          <div className="mf-run-card">
            <div className="mf-run-card-topline">
              <span className={step > 0 && step < 8 ? "is-running" : ""} />
              <small>DEMO RUN · WF-REV-C-001</small>
            </div>
            <strong aria-live="polite">{t(scenarioLabels[step])}</strong>
            <div className="mf-run-progress" aria-label={`${t("Etapa")} ${step} / 8`}>
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className={step > index ? "is-complete" : step === index ? "is-current" : ""} />
              ))}
            </div>
            <button type="button" onClick={advance} disabled={step === 8 || sessionHydrating || transitioning}>
              {step === 8 ? <Check size={15} /> : <ArrowRight size={15} />}
              {t(nextActionLabels[step])}
            </button>
          </div>

          <div className="mf-rail-heading">
            <span>{t("Atividade recente")}</span>
            <FileClock size={15} />
          </div>
          <div className="mf-activity-list" aria-live="polite">
            {approvedArtifacts.slice().reverse().map((artifact) => (
              <div className="mf-activity-item" key={`approval-${artifact.id}`}>
                <span className="mf-activity-marker is-positive" />
                <div>
                  <time>{t("AGORA")}</time>
                  <strong>{t("Artefato aprovado")}</strong>
                  <small>{t(artifact.title)} · {t("receipt registrado")}</small>
                </div>
              </div>
            ))}
            {visibleActivity.slice(0, 6).map((event) => (
              <div className="mf-activity-item" key={event.id}>
                <span className={`mf-activity-marker is-${event.tone}`} />
                <div>
                  <time>{event.time}</time>
                  <strong>{t(event.title)}</strong>
                  <small>{t(event.detail)}</small>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="mf-rail-link" onClick={() => navigate("audit")}>
            {t("Ver histórico completo")} <ArrowRight size={14} />
          </button>

          <div className="mf-context-card">
            <Search size={16} />
            <div>
              <span>{t("Contexto carregado")}</span>
              <strong>19 {t("fontes")} · 15 {t("disciplinas")}</strong>
              <small>{t("Escopo")}: {t(roles.find((role) => role.id === roleId)?.name ?? "")}</small>
            </div>
          </div>
        </aside>
      </div>

      {assistantOpen ? (
        <div className="mf-assistant-layer" role="dialog" aria-modal="true" aria-labelledby="mf-assistant-title">
          <button
            type="button"
            className="mf-assistant-scrim"
            aria-label={t("Fechar assistente")}
            onClick={() => setAssistantOpen(false)}
          />
          <section className="mf-assistant-drawer">
            <header>
              <div>
                <span className="mf-assistant-icon"><Bot size={18} /></span>
                <div>
                  <span className="mf-eyebrow">{t("Escopo atual")} · {project.name}</span>
                  <h2 id="mf-assistant-title">{t("Perguntar ao Urso")}</h2>
                </div>
              </div>
              <button type="button" aria-label={t("Fechar assistente")} onClick={() => setAssistantOpen(false)}>
                <PanelRightClose size={19} />
              </button>
            </header>
            <div className="mf-assistant-context">
              <ShieldCheck size={15} /> {t("Respostas usam apenas fontes autorizadas deste projeto.")}
            </div>
            <div className="mf-question-list">
              {askUrsoAnswers.map((item, index) => (
                <button
                  type="button"
                  key={item.question}
                  className={selectedQuestion === index ? "is-active" : ""}
                  onClick={() => setSelectedQuestion(index)}
                >
                  {t(item.question)}
                </button>
              ))}
            </div>
            <div className="mf-answer-card" aria-live="polite">
              <span className="mf-eyebrow">{t("Resposta contextual")}</span>
              <p>{t(activeAnswer.answer)}</p>
              <div>
                <FileStack size={14} />
                <span>
                  <strong>{t("Fontes")}</strong>
                  <small>{t(activeAnswer.sources)}</small>
                </span>
              </div>
            </div>
            <form className="mf-assistant-composer" onSubmit={submitScriptedQuestion}>
              <input
                aria-label={t("Pergunta para o Urso")}
                placeholder={t("Pergunte sobre este projeto…")}
                value={draftQuestion}
                onChange={(event) => setDraftQuestion(event.target.value)}
              />
              <button type="submit" aria-label={t("Enviar pergunta")} disabled={!draftQuestion.trim()}>
                <ArrowRight size={17} />
              </button>
            </form>
            <p className="mf-assistant-note">{t("Respostas pré-configuradas para esta demonstração.")}</p>
          </section>
        </div>
      ) : null}

      {selectedArtifact ? (
        <ArtifactWorkspace
          artifact={selectedArtifact}
          reviewState={
            artifactReviewStates[selectedArtifact.id] ??
            (step >= 8 ? "approved" : step >= 7 ? "validated" : "draft")
          }
          onReviewStateChange={(reviewState) =>
            reviewState !== "draft" && step < 8 ? void synchronizeScenarioStep(step + 1) : undefined
          }
          onClose={() => setSelectedArtifactId(null)}
        />
      ) : null}

      {presenterMode ? (
        <aside className="mf-presenter-guide" aria-label={language === "pt" ? "Tour guiado do sistema" : "Guided system tour"}>
          <div className="mf-presenter-guide-progress">
            <span className="mf-presenter-guide-step">
              {presentationSessionActive ? <i>{t("AO VIVO")}</i> : <i>{language === "pt" ? "TOUR GUIADO" : "GUIDED TOUR"}</i>}
              {String(step).padStart(2, "0")} / 08
            </span>
            <div aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => <span key={index} className={index <= step ? "is-complete" : ""} />)}
            </div>
          </div>
          <div className="mf-presenter-guide-copy">
            <small>{language === "pt" ? "OLHE AQUI" : "LOOK HERE"}</small>
            <strong>{presenterCue.say}</strong>
          </div>
          <div className="mf-presenter-guide-proof">
            <small>{language === "pt" ? "POR QUE IMPORTA" : "WHY IT MATTERS"}</small>
            <span>{presenterCue.proof}</span>
          </div>
          <nav className="mf-presenter-guide-navigation" aria-label={language === "pt" ? "Etapas do tour" : "Tour steps"}>
            <button type="button" onClick={rewind} disabled={step === 0} aria-label={language === "pt" ? "Etapa anterior" : "Previous step"}>
              <ArrowLeft size={16} />
            </button>
            <button type="button" className="is-next" onClick={advance} disabled={step === 8}>
              <span>{step === 8 ? (language === "pt" ? "Concluído" : "Complete") : (language === "pt" ? "Próximo destaque" : "Next highlight")}</span>
              {step === 8 ? <Check size={16} /> : <ArrowRight size={16} />}
            </button>
          </nav>
          <div className="mf-presenter-guide-actions">
            {presentationSessionActive ? (
              <button type="button" aria-label={t("Reiniciar apresentação")} onClick={restartPresentation}>
                <RotateCcw size={15} />
              </button>
            ) : null}
            <button
              type="button"
              aria-label={presentationSessionActive ? t("Encerrar apresentação") : t("Ocultar guia")}
              onClick={presentationSessionActive ? endPresentation : () => setPresenterMode(false)}
            >
              {presentationSessionActive ? <LogOut size={15} /> : <X size={16} />}
            </button>
          </div>
        </aside>
      ) : null}

      {presentationLobbyOpen ? (
        <div className="mf-presentation-lobby" role="dialog" aria-modal="true" aria-labelledby="mf-presentation-title">
          <div className="mf-presentation-lobby-scrim" />
          <section>
            <header>
              <div>
                <MfLogo />
                <span />
                <strong>Project Intelligence</strong>
              </div>
              <div className="mf-lobby-language" role="group" aria-label={language === "pt" ? "Idioma" : "Language"}>
                <Languages size={14} aria-hidden="true" />
                <button type="button" aria-pressed={language === "pt"} onClick={() => setLanguage("pt")}>PT</button>
                <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
              </div>
            </header>

            <div className="mf-presentation-lobby-grid">
              <div className="mf-presentation-intro">
                <span className="mf-eyebrow">{t("Demonstração interativa MF × Urso")}</span>
                <h1 id="mf-presentation-title">{t("Controle a mudança antes que ela controle o projeto.")}</h1>
                <p>{t("Uma apresentação guiada de como o Brain e o harness transformam uma revisão em decisões, trabalho coordenado e liberação segura.")}</p>

                <div className="mf-presentation-route" aria-label={t("Roteiro da apresentação")}>
                  {presenterCues[language].map((cue, index) => (
                    <span key={cue.say} className={index === 0 ? "is-current" : ""}>
                      <i>{String(index).padStart(2, "0")}</i>
                      <small>{t(scenarioLabels[index])}</small>
                    </span>
                  ))}
                </div>

                <div className="mf-presentation-actions">
                  <button ref={presentationStartRef} type="button" className="mf-lobby-primary" onClick={() => void startPresentation()} disabled={sessionHydrating || transitioning || !demoSession}>
                    <Play size={17} fill="currentColor" /> {t("Iniciar apresentação")}
                  </button>
                  <button type="button" className="mf-lobby-secondary" onClick={exploreDemo}>
                    {t("Explorar o sistema")} <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              <aside className="mf-presentation-readiness" aria-label={t("Prontidão da demonstração")}>
                <span className="mf-eyebrow">{t("Prontidão da demonstração")}</span>
                <h2>{t("Tudo pronto para apresentar.")}</h2>
                <ul>
                  <li><ShieldCheck size={17} /><span><small>{t("Fixture do projeto")}</small><strong>{t("Carregado")}</strong></span><i /></li>
                  <li><RotateCcw size={17} /><span><small>{t("Motor do cenário")}</small><strong>{t("Determinístico")}</strong></span><i /></li>
                  <li><Languages size={17} /><span><small>{t("Idiomas")}</small><strong>PT + EN</strong></span><i /></li>
                  <li><WifiOff size={17} /><span><small>{t("Dependências externas")}</small><strong>{t("Nenhuma")}</strong></span><i /></li>
                </ul>
                <div className="mf-presentation-meta">
                  <span><Presentation size={15} /><strong>8 {t("cenas")}</strong></span>
                  <span><Timer size={15} /><strong>12 {t("minutos")}</strong></span>
                  <span><Keyboard size={15} /><strong>{t("Setas para navegar")}</strong></span>
                </div>
              </aside>
            </div>

            <footer>
              <ShieldCheck size={14} />
              {t("Dados operacionais sintéticos. Contexto público verificado.")}
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function MfDemo() {
  return (
    <MfLanguageProvider>
      <MfDemoShell />
    </MfLanguageProvider>
  );
}
