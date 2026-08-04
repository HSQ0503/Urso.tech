"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleGauge,
  GitPullRequestArrow,
  History,
  Keyboard,
  Languages,
  LogOut,
  Menu,
  Play,
  Presentation,
  RotateCcw,
  ShieldCheck,
  Timer,
  UsersRound,
  WifiOff,
  Workflow,
  X,
} from "lucide-react";
import {
  artifacts,
  project,
  roles,
} from "@/lib/mf-demo/fixtures";
import { scenarioLabels } from "@/lib/mf-demo/scenario";
import { deriveMfArtifactAccess } from "@/lib/mf-demo/workflow-runtime.mjs";
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
  "pilot-proposal",
] as const;

const sessionStorageKey = "mf-demo-session-v2";
const focusableElementSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function trapTabFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return false;

  const focusableElements = Array.from(container.querySelectorAll<HTMLElement>(focusableElementSelector))
    .filter((element) => element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
  if (focusableElements.length === 0) {
    event.preventDefault();
    container.focus();
    return true;
  }

  const activeIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
  const movingBeforeStart = event.shiftKey && activeIndex <= 0;
  const movingPastEnd = !event.shiftKey && (activeIndex === -1 || activeIndex === focusableElements.length - 1);
  if (movingBeforeStart || movingPastEnd) {
    event.preventDefault();
    focusableElements[movingBeforeStart ? focusableElements.length - 1 : 0]?.focus();
  }
  return true;
}

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
    { say: "Agora a decisão é simples: provar esse resultado em um projeto real.", proof: "Piloto · 1 projeto · múltiplas disciplinas · 1 workflow integrado" },
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
    { say: "Now the decision is simple: prove this outcome on one real project.", proof: "Pilot · 1 project · multiple disciplines · 1 integrated workflow" },
  ],
} as const;

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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [presenterMode, setPresenterMode] = useState(false);
  const [presentationLobbyOpen, setPresentationLobbyOpen] = useState(true);
  const [presentationSessionActive, setPresentationSessionActive] = useState(false);
  const presentationStartRef = useRef<HTMLButtonElement>(null);
  const presentationDialogRef = useRef<HTMLDivElement>(null);
  const presentationOpenerRef = useRef<HTMLElement | null>(null);
  const presentationWasOpenRef = useRef(true);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const mobileNavigationCloseRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationWasOpenRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const step = demoSession?.snapshot.step ?? 0;
  const artifactReviewStates = useMemo<Record<string, ArtifactReviewState>>(() => Object.fromEntries(
    artifacts.map((artifact) => {
      const workItems = demoSession?.snapshot.workItems.filter((task) => task.artifactId === artifact.id) ?? [];
      const reviewState: ArtifactReviewState = workItems.length > 0 && workItems.every((task) => task.state === "complete")
        ? "approved"
        : workItems.some((task) => task.state === "in_progress" || task.state === "complete")
          ? "validated"
          : "draft";
      return [artifact.id, reviewState];
    }),
  ), [demoSession?.snapshot]);
  const artifactAccess = deriveMfArtifactAccess(roleId);
  const selectedArtifact = artifacts.find((artifact) =>
    artifact.id === selectedArtifactId
    && step >= artifact.availableAt
    && (artifactAccess.canViewAll || artifactAccess.artifactIds.includes(artifact.id))) ?? null;
  const selectedArtifactWorkItems = selectedArtifact
    ? demoSession?.snapshot.workItems.filter((task) => task.artifactId === selectedArtifact.id) ?? []
    : [];
  const terminalArtifactWorkItem = [...selectedArtifactWorkItems]
    .sort((left, right) => right.completeAt - left.completeAt)[0] ?? null;
  const selectedArtifactReceiptId = selectedArtifactWorkItems.length > 0
    && selectedArtifactWorkItems.every((task) => task.state === "complete")
    ? terminalArtifactWorkItem?.receiptId ?? null
    : null;
  const managerConfirmationWorkItem = demoSession?.snapshot.workItems
    .find((task) => task.id === "release-exe-02") ?? null;
  const managerConfirmationState = managerConfirmationWorkItem?.state ?? null;
  const managerConfirmationReceiptId = managerConfirmationState === "complete"
    ? managerConfirmationWorkItem?.receiptId ?? null
    : null;
  const authorizedEvidenceRecordCount = demoSession?.snapshot.sources
    .filter((source) => source.authorizedRoleIds.includes(roleId))
    .reduce((count, source) => count + source.evidencePaths.length, 0) ?? 0;
  const presenterCue = presenterCues[language][step];
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const activeNavigationItem = navigation.find((item) => item.id === activeView) ?? navigation[0];

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 980px)");
    const synchronizeViewport = () => {
      setIsMobileViewport(mobileViewport.matches);
      if (!mobileViewport.matches) setMobileNavigationOpen(false);
    };
    synchronizeViewport();
    mobileViewport.addEventListener("change", synchronizeViewport);
    return () => mobileViewport.removeEventListener("change", synchronizeViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      mobileNavigationWasOpenRef.current = false;
      return;
    }

    if (mobileNavigationOpen) {
      mobileNavigationWasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => mobileNavigationCloseRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }

    if (!mobileNavigationWasOpenRef.current) return;
    mobileNavigationWasOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileViewport, mobileNavigationOpen]);

  useEffect(() => {
    if (presentationLobbyOpen) {
      presentationWasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => presentationDialogRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }

    if (!presentationWasOpenRef.current) return;
    presentationWasOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const opener = presentationOpenerRef.current;
      const openerIsDisabled = opener instanceof HTMLButtonElement && opener.disabled;
      if (opener?.isConnected && !openerIsDisabled) opener.focus();
      else mainRef.current?.focus();
      presentationOpenerRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [presentationLobbyOpen]);

  useEffect(() => {
    if (selectedArtifactId && !selectedArtifact) {
      const frameId = window.requestAnimationFrame(() => setSelectedArtifactId(null));
      return () => window.cancelAnimationFrame(frameId);
    }
  }, [selectedArtifact, selectedArtifactId]);

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
    setSelectedArtifactId(null);
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

  function openPresentationLobby() {
    presentationOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPresentationLobbyOpen(true);
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
    setSelectedArtifactId(null);
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
    const artifact = artifacts.find((candidate) => candidate.id === artifactId);
    const allowed = artifact
      && step >= artifact.availableAt
      && (artifactAccess.canViewAll || artifactAccess.artifactIds.includes(artifact.id));
    if (!allowed) {
      setSelectedArtifactId(null);
      return;
    }
    setSelectedArtifactId(artifactId);
  }

  useEffect(() => {
    function handlePresenterShortcut(event: KeyboardEvent) {
      if (presentationLobbyOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setPresentationLobbyOpen(false);
          return;
        }
        trapTabFocus(event, presentationDialogRef.current);
        return;
      }

      if (selectedArtifactId) {
        if (event.key === "Escape") {
          event.preventDefault();
          setSelectedArtifactId(null);
        }
        return;
      }

      if (mobileNavigationOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setMobileNavigationOpen(false);
          return;
        }
        trapTabFocus(event, mobileNavigationRef.current);
        return;
      }

      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
        if (!presentationSessionActive) setPresenterMode(false);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role]')) return;

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
  }, [mobileNavigationOpen, presentationLobbyOpen, presentationSessionActive, reset, selectedArtifactId, step, synchronizeScenarioStep]);

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

      <header
        className="mf-topbar"
        inert={presentationLobbyOpen || (isMobileViewport && mobileNavigationOpen) ? true : undefined}
      >
        <button
          ref={mobileMenuRef}
          type="button"
          className="mf-mobile-menu"
          aria-controls="mf-project-navigation"
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
            <small>MF / URSO CONTROL LAYER</small>
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
        <aside
          ref={mobileNavigationRef}
          id="mf-project-navigation"
          className={`mf-sidebar ${mobileNavigationOpen ? "is-open" : ""}`}
          inert={presentationLobbyOpen || (isMobileViewport && !mobileNavigationOpen) ? true : undefined}
        >
          <div className="mf-mobile-sidebar-header">
            <MfLogo compact />
            <button ref={mobileNavigationCloseRef} type="button" aria-label={t("Fechar navegação")} onClick={() => setMobileNavigationOpen(false)}>
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
              onClick={openPresentationLobby}
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
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMobileNavigationOpen(false)}
          />
        ) : null}

        <main
          ref={mainRef}
          id="mf-main"
          className="mf-main"
          tabIndex={-1}
          inert={presentationLobbyOpen || (isMobileViewport && mobileNavigationOpen) ? true : undefined}
        >
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
      </div>

      {selectedArtifact ? (
        <ArtifactWorkspace
          artifact={selectedArtifact}
          reviewState={
            artifactReviewStates[selectedArtifact.id] ??
            "draft"
          }
          receiptId={selectedArtifactReceiptId}
          managerConfirmationState={managerConfirmationState}
          managerConfirmationReceiptId={managerConfirmationReceiptId}
          onClose={() => setSelectedArtifactId(null)}
        />
      ) : null}

      {presenterMode && !presentationLobbyOpen && !selectedArtifactId && !(isMobileViewport && mobileNavigationOpen) ? (
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
        <div
          ref={presentationDialogRef}
          className="mf-presentation-lobby"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mf-presentation-title"
          tabIndex={-1}
        >
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
                <span className="mf-eyebrow">{t("Cenário de projeto MF × Urso")}</span>
                <h1 id="mf-presentation-title">{t("Aprovar a Revisão C sem perder o marco EXE-02.")}</h1>
                <p>{t("Acompanhe a revisão desde as fontes autorizadas até a decisão do PM, os pacotes de trabalho e o registro de auditoria.")}</p>

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
                  <li><BrainCircuit size={17} /><span><small>{t("Contexto autorizado")}</small><strong>{authorizedEvidenceRecordCount} {language === "pt" ? "registros autorizados" : "authorized records"}</strong></span><i /></li>
                </ul>
                <div className="mf-presentation-meta">
                  <span><Presentation size={15} /><strong>9 {t("cenas")}</strong></span>
                  <span><Timer size={15} /><strong>15 {t("minutos")}</strong></span>
                  <span><Keyboard size={15} /><strong>{t("Setas para navegar")}</strong></span>
                </div>
              </aside>
            </div>

            <footer>
              <ShieldCheck size={14} />
              {t("Dados operacionais sintéticos. Contexto controlado conectado.")}
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
