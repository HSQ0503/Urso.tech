"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { artifacts, roles } from "@/lib/mf-demo/fixtures";
import { deriveMfArtifactAccess } from "@/lib/mf-demo/workflow-runtime.mjs";
import type {
  ArtifactReviewState,
  MfDemoSessionCredentials,
  MfDemoSessionView,
} from "@/lib/mf-demo/types";

const sessionStorageKey = "mf-demo-session-v2";

type MfDemoSessionContextValue = {
  sessionCredentials: MfDemoSessionCredentials | null;
  demoSession: MfDemoSessionView | null;
  sessionHydrating: boolean;
  transitioning: boolean;
  transitionError: string | null;
  retrySession: () => void;
  step: number;
  roleId: string;
  selectedRole: (typeof roles)[number];
  snapshot: MfDemoSessionView["snapshot"] | undefined;
  artifactReviewStates: Record<string, ArtifactReviewState>;
  selectedArtifact: (typeof artifacts)[number] | null;
  selectedArtifactId: string | null;
  selectedArtifactReceiptId: string | null;
  managerConfirmationState: MfDemoSessionView["snapshot"]["workItems"][number]["state"] | null;
  managerConfirmationReceiptId: string | null;
  authorizedEvidenceRecordCount: number;
  synchronizeScenarioStep: (nextStep: number, nextRoleId?: string) => Promise<boolean>;
  selectRole: (nextRoleId: string) => Promise<void>;
  advance: () => Promise<boolean>;
  rewind: () => Promise<boolean>;
  reset: () => Promise<boolean>;
  openArtifact: (artifactId: string) => void;
  closeArtifact: () => void;
};

const MfDemoSessionContext = createContext<MfDemoSessionContextValue | null>(null);

export function MfDemoSessionProvider({ children }: { children: ReactNode }) {
  const [sessionCredentials, setSessionCredentials] = useState<MfDemoSessionCredentials | null>(null);
  const [demoSession, setDemoSession] = useState<MfDemoSessionView | null>(null);
  const [sessionHydrating, setSessionHydrating] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [roleId, setRoleId] = useState(roles[0].id);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const step = demoSession?.snapshot.step ?? 0;

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
          }
          return;
        }

        const loaded = (await response.json()) as { session?: MfDemoSessionView; error?: string };
        if (!loaded.session || !credentials) {
          throw new Error(loaded.error ?? "Unable to load the MF demo session.");
        }
        if (!cancelled) {
          setSessionCredentials(credentials);
          setDemoSession(loaded.session);
          setRoleId(loaded.session.selectedRoleId);
        }
      } catch (error) {
        if (!cancelled) {
          setTransitionError(error instanceof Error ? error.message : "MF demo session unavailable.");
        }
      } finally {
        if (!cancelled) setSessionHydrating(false);
      }
    }

    void hydrateSession();
    return () => {
      cancelled = true;
    };
  }, [sessionAttempt]);

  const retrySession = useCallback(() => {
    setSessionAttempt((attempt) => attempt + 1);
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
      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "Scenario transition failed.");
      }
      setDemoSession(payload.session);
      setRoleId(payload.session.selectedRoleId);
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

  const advance = useCallback(() => {
    if (step >= 8 || transitioning) return Promise.resolve(false);
    return synchronizeScenarioStep(step + 1);
  }, [step, synchronizeScenarioStep, transitioning]);

  const rewind = useCallback(() => {
    if (step === 0 || transitioning) return Promise.resolve(false);
    return synchronizeScenarioStep(step - 1);
  }, [step, synchronizeScenarioStep, transitioning]);

  const reset = useCallback(async () => {
    const resetComplete = await synchronizeScenarioStep(0, roles[0].id);
    if (!resetComplete) return false;
    setRoleId(roles[0].id);
    setSelectedArtifactId(null);
    return true;
  }, [synchronizeScenarioStep]);

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
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];

  useEffect(() => {
    if (selectedArtifactId && !selectedArtifact) {
      const frameId = window.requestAnimationFrame(() => setSelectedArtifactId(null));
      return () => window.cancelAnimationFrame(frameId);
    }
  }, [selectedArtifact, selectedArtifactId]);

  const openArtifact = useCallback((artifactId: string) => {
    const artifact = artifacts.find((candidate) => candidate.id === artifactId);
    const access = deriveMfArtifactAccess(roleId);
    const allowed = artifact
      && step >= artifact.availableAt
      && (access.canViewAll || access.artifactIds.includes(artifact.id));
    setSelectedArtifactId(allowed ? artifactId : null);
  }, [roleId, step]);

  const closeArtifact = useCallback(() => setSelectedArtifactId(null), []);

  const value = useMemo<MfDemoSessionContextValue>(() => ({
    sessionCredentials,
    demoSession,
    sessionHydrating,
    transitioning,
    transitionError,
    retrySession,
    step,
    roleId,
    selectedRole,
    snapshot: demoSession?.snapshot,
    artifactReviewStates,
    selectedArtifact,
    selectedArtifactId,
    selectedArtifactReceiptId,
    managerConfirmationState,
    managerConfirmationReceiptId,
    authorizedEvidenceRecordCount,
    synchronizeScenarioStep,
    selectRole,
    advance,
    rewind,
    reset,
    openArtifact,
    closeArtifact,
  }), [
    advance,
    artifactReviewStates,
    authorizedEvidenceRecordCount,
    closeArtifact,
    demoSession,
    managerConfirmationReceiptId,
    managerConfirmationState,
    openArtifact,
    reset,
    rewind,
    retrySession,
    roleId,
    selectedArtifact,
    selectedArtifactId,
    selectedArtifactReceiptId,
    selectedRole,
    selectRole,
    sessionCredentials,
    sessionHydrating,
    step,
    synchronizeScenarioStep,
    transitionError,
    transitioning,
  ]);

  return <MfDemoSessionContext.Provider value={value}>{children}</MfDemoSessionContext.Provider>;
}

export function useMfDemoSession() {
  const context = useContext(MfDemoSessionContext);
  if (!context) throw new Error("useMfDemoSession must be used inside MfDemoSessionProvider.");
  return context;
}
