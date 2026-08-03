"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  LoaderCircle,
  Mic,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { RichText } from "@/components/dashboard/rich-text";
import type { BrainContextReceipt, BrainUIData } from "@/lib/brain/types";
import { project, roles } from "@/lib/mf-demo/fixtures";
import { useMfLanguage } from "./mf-language";

type BrainMode = "map" | "documents" | "ask";
type DocumentCategory = "truth" | "change" | "team" | "governance";
type BrainNodeKind = "project" | "document" | "decision" | "department" | "workflow";
type MfBrainMessage = UIMessage<unknown, BrainUIData>;

type BrainDocument = {
  id: string;
  path: string;
  title: string;
  description: string;
  department_id: string | null;
  project_id: string | null;
  doc_type: "core" | "doc" | "rule";
  visibility: "organization" | "department" | "project" | "restricted";
  tags: string[];
  links: string[];
  content: string;
  origin: "vault" | "brain";
  current_version: number;
  source_updated_at: string;
  review_due_at: string | null;
};

type BrainGraphDocument = Pick<
  BrainDocument,
  "path" | "title" | "department_id" | "project_id" | "doc_type" | "origin" | "links"
>;

type BrainClaim = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  lifecycle: "active" | "superseded" | "retired";
  resolution: "accepted" | "unresolved" | "contested";
  validFrom: string | null;
  validUntil: string | null;
  evidenceDocumentIds: string[];
};

type BrainWorkspacePayload = {
  connected: true;
  scope: {
    name: string;
    title: string;
    departmentId: string;
    role: string;
    permittedDocuments: number;
  };
  departments: { id: string; name: string; blurb: string }[];
  documents: BrainDocument[];
  graph: BrainGraphDocument[];
  claims: BrainClaim[];
  proposals: { id: string; status: string; rationale: string; created_at: string }[];
  audit: { id: number; action: string; resource_type: string; resource_id: string; created_at: string }[];
};

type ThreadSummary = { id: string; title: string; project_id: string; model: string; updated_at: string };

const categoryLabels: Record<DocumentCategory, { pt: string; en: string }> = {
  truth: { pt: "Verdade vigente", en: "Current truth" },
  change: { pt: "Mudança", en: "Change" },
  team: { pt: "Trabalho das equipes", en: "Team work" },
  governance: { pt: "Decisões e controle", en: "Decisions & control" },
};

const graphPriority = [
  "Project Charter",
  "Approved Project Premises",
  "Filling Line Data Sheet — Revision B",
  "Filling Line Data Sheet — Revision C",
  "Revision B-C Material Comparison",
  "Revision C Approval",
  "Coordinated Impact Plan",
  "Executive Design Gate",
  "Baseline Schedule",
  "Recovery Plan",
  "Electrical Work Package",
  "BIM Coordination Work Package",
  "Planning Work Package",
  "Quality Gate Work Package",
  "Concept BIM Scaffold",
  "Release Readiness",
];

const suggestions = {
  pt: [
    "Qual revisão da linha está vigente e por quê?",
    "Quais disciplinas são afetadas pela Revisão C?",
    "O que ainda bloqueia a liberação EXE-02?",
  ],
  en: [
    "Which filling-line revision is current, and why?",
    "Which disciplines are affected by Revision C?",
    "What still blocks the EXE-02 release?",
  ],
};

function documentCategory(document: BrainDocument): DocumentCategory {
  const joined = `${document.title} ${document.tags.join(" ")}`.toLowerCase();
  if (document.doc_type === "rule" || /approval|decision|gate|governance|quality/.test(joined)) return "governance";
  if (/work-package|package|discipline|scaffold/.test(joined)) return "team";
  if (/revision-c|change|comparison|recovery|rfi|event/.test(joined)) return "change";
  return "truth";
}

function nodeKind(document: BrainGraphDocument): BrainNodeKind {
  const value = document.title.toLowerCase();
  if (document.doc_type === "core" || value.includes("project charter")) return "project";
  if (/approval|decision|gate|readiness/.test(value)) return "decision";
  if (/work package/.test(value)) return "department";
  if (/impact plan|recovery plan|scaffold/.test(value)) return "workflow";
  return "document";
}

function documentCode(title: string): string {
  if (title.includes("DEC-042")) return "DEC-042";
  if (title.includes("CHG-024")) return "CHG-024";
  if (title.includes("EXE-02")) return "EXE-02";
  if (title.includes("Revision B")) return "SUP-DS-B";
  if (title.includes("Revision C")) return "SUP-DS-C";
  const initials = title
    .replace(/[^A-Za-z0-9À-ÿ ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials || "DOC";
}

function graphPosition(index: number, count: number) {
  if (index === 0) return { x: 450, y: 280 };
  const ring = index <= 7 ? 1 : 2;
  const ringItems = ring === 1 ? Math.min(7, count - 1) : Math.max(1, count - 8);
  const ringIndex = ring === 1 ? index - 1 : index - 8;
  const angle = (ringIndex / ringItems) * Math.PI * 2 - Math.PI / 2;
  const radiusX = ring === 1 ? 235 : 365;
  const radiusY = ring === 1 ? 145 : 225;
  return { x: 450 + Math.cos(angle) * radiusX, y: 280 + Math.sin(angle) * radiusY };
}

const errorText = (message: string): string => {
  try {
    const parsed = JSON.parse(message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // Streaming errors are already plain text.
  }
  return message;
};

function BrainComposer({
  value,
  language,
  busy,
  compact = false,
  onChange,
  onSubmit,
  onOpenDocuments,
}: {
  value: string;
  language: "pt" | "en";
  busy: boolean;
  compact?: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenDocuments: () => void;
}) {
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);

  return (
    <form className={`mf-brain-composer ${compact ? "is-compact" : ""}`} onSubmit={onSubmit}>
      <button
        type="button"
        className="mf-brain-composer-add"
        aria-label={l("Abrir fontes do projeto", "Open project sources")}
        title={l("Abrir documentos do projeto", "Open project documents")}
        onClick={onOpenDocuments}
      >
        <Plus size={19} />
      </button>
      <input
        aria-label={l("Pergunta para o Urso", "Question for Urso")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={l("Pergunte ao Brain deste projeto", "Ask this project Brain")}
        disabled={busy}
      />
      <div className="mf-brain-composer-tools">
        <span className="mf-brain-model"><i /> MF Project Brain <ChevronDown size={13} /></span>
        <button type="button" className="mf-brain-mic" aria-label={l("Entrada de voz indisponível", "Voice input unavailable")} disabled>
          <Mic size={17} />
        </button>
        <button type="submit" className="mf-brain-send" disabled={!value.trim() || busy} aria-label={l("Enviar pergunta", "Send question")}>
          {busy ? <LoaderCircle className="mf-spin" size={18} /> : <ArrowUp size={18} />}
        </button>
      </div>
    </form>
  );
}

export function ProjectBrainWorkspace({
  step,
  roleId,
  sessionId,
  sessionToken,
}: {
  step: number;
  roleId: string;
  sessionId?: string;
  sessionToken?: string;
}) {
  const { language, t } = useMfLanguage();
  const workspaceRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<BrainMode>("map");
  const [workspace, setWorkspace] = useState<BrainWorkspacePayload | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "all">("all");
  const [draftQuestion, setDraftQuestion] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const sessionHeaders = useMemo(() => ({
    "x-mf-demo-session-id": sessionId ?? "",
    "x-mf-demo-session-token": sessionToken ?? "",
  }), [sessionId, sessionToken]);

  const loadWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const response = await fetch(`/api/mf/brain/workspace?roleId=${encodeURIComponent(roleId)}`, {
        cache: "no-store",
        headers: sessionHeaders,
      });
      const payload = (await response.json()) as BrainWorkspacePayload | { error?: string };
      if (!response.ok || !("connected" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "MF Brain unavailable");
      }
      setWorkspace(payload);
      setSelectedDocumentPath((current) =>
        current && payload.documents.some((document) => document.path === current)
          ? current
          : (payload.documents[0]?.path ?? null),
      );
    } catch (error) {
      setWorkspace(null);
      setWorkspaceError(error instanceof Error ? error.message : "MF Brain unavailable");
    } finally {
      setLoadingWorkspace(false);
    }
  }, [roleId, sessionHeaders]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadWorkspace();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadWorkspace, step]);

  const chat = useChat<MfBrainMessage>({
    transport: new DefaultChatTransport({ api: "/api/mf/brain/chat", headers: sessionHeaders }),
  });
  const { messages, status, error, setMessages } = chat;
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setActiveThreadId(null);
      setMessages([]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [roleId, setMessages]);

  useEffect(() => {
    if (mode !== "ask") return;
    const frame = window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  const documents = useMemo(() => workspace?.documents ?? [], [workspace?.documents]);
  const selectedDocument = documents.find((document) => document.path === selectedDocumentPath) ?? documents[0] ?? null;
  const departmentNames = useMemo(
    () => new Map((workspace?.departments ?? []).map((department) => [department.id, department.name])),
    [workspace?.departments],
  );
  const filteredDocuments = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("pt-BR");
    return documents.filter((document) => {
      const documentCategoryValue = documentCategory(document);
      const matchesCategory = category === "all" || documentCategoryValue === category;
      const matchesQuery = !normalized || [documentCode(document.title), document.title, document.description, document.department_id ?? ""]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized));
      return matchesCategory && matchesQuery;
    });
  }, [category, documents, searchQuery]);

  const graphDocuments = useMemo(() => {
    const graph = workspace?.graph ?? [];
    const ranked = [...graph].sort((left, right) => {
      const leftIndex = graphPriority.findIndex((item) => left.title.includes(item));
      const rightIndex = graphPriority.findIndex((item) => right.title.includes(item));
      return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.title.localeCompare(right.title);
    });
    return ranked.slice(0, 16);
  }, [workspace?.graph]);
  const graphPathSet = useMemo(() => new Set(graphDocuments.map((document) => document.path)), [graphDocuments]);
  const positions = useMemo(
    () => new Map(graphDocuments.map((document, index) => [document.path, graphPosition(index, graphDocuments.length)])),
    [graphDocuments],
  );

  const latestReceipt = useMemo<BrainContextReceipt | null>(() => {
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
      for (let partIndex = messages[messageIndex].parts.length - 1; partIndex >= 0; partIndex--) {
        const part = messages[messageIndex].parts[partIndex];
        if (part.type === "data-context-receipt") return part.data;
      }
    }
    return null;
  }, [messages]);

  const createThread = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch("/api/mf/brain/threads", {
        method: "POST",
        headers: { "content-type": "application/json", ...sessionHeaders },
        body: JSON.stringify({ roleId }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { thread: ThreadSummary };
      setActiveThreadId(payload.thread.id);
      return payload.thread.id;
    } catch {
      return null;
    }
  }, [roleId, sessionHeaders]);

  const sendQuestion = useCallback(async (value: string) => {
    const question = value.trim();
    if (!question || busy) return;
    const threadId = activeThreadId ?? await createThread();
    chat.sendMessage(
      { text: question },
      { body: { threadId: threadId ?? undefined, roleId, language } },
    );
    setDraftQuestion("");
  }, [activeThreadId, busy, chat, createThread, language, roleId]);

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(draftQuestion);
  }

  function newConversation() {
    if (busy) chat.stop();
    setActiveThreadId(null);
    setMessages([]);
    setDraftQuestion("");
  }

  const openEvidence = (path: string) => {
    setSelectedDocumentPath(path);
    setMode("documents");
  };

  return (
    <section ref={workspaceRef} className="mf-brain-workspace" aria-label={l("Workspace do cérebro do projeto", "Project Brain workspace")}>
      <header className="mf-brain-workspace-header">
        <div>
          <span className="mf-brain-mark"><Network size={18} /></span>
          <span>
            <strong>{l("Cérebro do projeto", "Project Brain")}</strong>
            <small>
              {project.name} · {loadingWorkspace
                ? l("conectando…", "connecting…")
                : workspace
                  ? `${workspace.scope.permittedDocuments} ${l("fontes autorizadas", "authorized sources")}`
                  : l("configuração necessária", "setup required")}
            </small>
          </span>
        </div>
        <nav aria-label={l("Modos do cérebro", "Brain modes") }>
          <button type="button" className={mode === "map" ? "is-active" : ""} onClick={() => setMode("map")}>
            <GitBranch size={15} /> {l("Mapa", "Map")}
          </button>
          <button type="button" className={mode === "documents" ? "is-active" : ""} onClick={() => setMode("documents")}>
            <FolderOpen size={15} /> {l("Documentos", "Documents")} <span>{documents.length}</span>
          </button>
          <button type="button" className={mode === "ask" ? "is-active" : ""} onClick={() => setMode("ask")}>
            <Bot size={15} /> {l("Perguntar ao Urso", "Ask Urso")}
          </button>
        </nav>
        <div className="mf-brain-trust">
          {workspace ? <><ShieldCheck size={14} /> {l("Brain conectado", "Brain connected")}</> : <><Database size={14} /> {l("Tenant isolado", "Isolated tenant")}</>}
        </div>
      </header>

      {loadingWorkspace ? (
        <div className="mf-brain-loading"><LoaderCircle className="mf-spin" size={24} /><strong>{l("Autorizando e carregando o projeto", "Authorizing and loading the project")}</strong></div>
      ) : workspaceError ? (
        <div className="mf-brain-connection-error">
          <AlertTriangle size={22} />
          <div><strong>{l("O tenant MF Brain ainda não está disponível", "The MF Brain tenant is not available yet")}</strong><p>{workspaceError}</p></div>
          <button type="button" onClick={() => void loadWorkspace()}>{l("Tentar novamente", "Retry")}</button>
        </div>
      ) : null}

      {!loadingWorkspace && workspace && mode === "map" ? (
        <div className="mf-brain-map-layout">
          <div className="mf-brain-canvas">
            <div className="mf-brain-canvas-copy">
              <span>{l("Mapa autorizado do projeto", "Authorized project map")}</span>
              <small>{l("Relações reais do Brain, derivadas dos wikilinks e versões atuais.", "Live Brain relationships derived from wikilinks and current versions.")}</small>
            </div>
            <svg viewBox="0 0 900 560" aria-hidden="true">
              {graphDocuments.flatMap((document) => document.links.map((targetPath) => {
                if (!graphPathSet.has(targetPath) || document.path > targetPath) return [];
                const sourcePosition = positions.get(document.path);
                const targetPosition = positions.get(targetPath);
                if (!sourcePosition || !targetPosition) return [];
                const highlighted = selectedDocumentPath === document.path || selectedDocumentPath === targetPath;
                return [<line key={`${document.path}-${targetPath}`} x1={sourcePosition.x} y1={sourcePosition.y} x2={targetPosition.x} y2={targetPosition.y} className={highlighted ? "is-active" : ""} />];
              }))}
            </svg>
            {graphDocuments.map((document) => {
              const position = positions.get(document.path) ?? { x: 450, y: 280 };
              const selected = selectedDocumentPath === document.path;
              const kind = nodeKind(document);
              return (
                <button
                  type="button"
                  key={document.path}
                  className={`mf-brain-node is-${kind} ${selected ? "is-selected" : ""} is-available`}
                  style={{ left: `${(position.x / 900) * 100}%`, top: `${(position.y / 560) * 100}%` }}
                  onClick={() => setSelectedDocumentPath(document.path)}
                  aria-pressed={selected}
                >
                  <i>{kind === "project" ? <Network size={16} /> : kind === "decision" ? <ShieldCheck size={15} /> : kind === "department" ? <UsersRound size={15} /> : kind === "workflow" ? <Workflow size={15} /> : <FileText size={15} />}</i>
                  <span>{documentCode(document.title)}</span>
                  <strong>{document.title}</strong>
                </button>
              );
            })}
            <div className="mf-brain-legend">
              <span><i className="is-project" />{l("Projeto", "Project")}</span>
              <span><i className="is-document" />{l("Documento", "Document")}</span>
              <span><i className="is-decision" />{l("Decisão", "Decision")}</span>
              <span><i className="is-department" />{l("Equipe", "Team")}</span>
            </div>
          </div>
          {selectedDocument ? (
            <DocumentInspector document={selectedDocument} claims={workspace.claims} departmentName={selectedDocument.department_id ? departmentNames.get(selectedDocument.department_id) ?? selectedDocument.department_id : l("Toda a organização", "Organization-wide")} language={language} onOpenDocuments={() => setMode("documents")} />
          ) : null}
        </div>
      ) : null}

      {!loadingWorkspace && workspace && mode === "documents" ? (
        <div className="mf-document-browser">
          <aside>
            <label>
              <Search size={15} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={l("Buscar título, código ou equipe", "Search title, code, or team")} />
            </label>
            <div className="mf-document-filters">
              <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>{l("Todos", "All")}</button>
              {(Object.keys(categoryLabels) as DocumentCategory[]).map((item) => (
                <button type="button" key={item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>
                  {categoryLabels[item][language]}
                </button>
              ))}
            </div>
            <div className="mf-document-list">
              {filteredDocuments.map((document) => (
                <button type="button" key={document.path} className={selectedDocument?.path === document.path ? "is-active is-available" : "is-available"} onClick={() => setSelectedDocumentPath(document.path)}>
                  <span><FileText size={15} /></span>
                  <span>
                    <small>{documentCode(document.title)} · {document.department_id ? departmentNames.get(document.department_id) ?? document.department_id : l("Empresa", "Company")}</small>
                    <strong>{document.title}</strong>
                    <em>v{document.current_version} · {document.origin === "vault" ? "Obsidian" : "Brain"}</em>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {filteredDocuments.length === 0 ? <p>{l("Nenhum documento encontrado.", "No documents found.")}</p> : null}
            </div>
          </aside>
          {selectedDocument ? <DocumentInspector document={selectedDocument} claims={workspace.claims} departmentName={selectedDocument.department_id ? departmentNames.get(selectedDocument.department_id) ?? selectedDocument.department_id : l("Toda a organização", "Organization-wide")} language={language} /> : null}
        </div>
      ) : null}

      {!loadingWorkspace && workspace && mode === "ask" ? (
        <div className={`mf-gemini-chat ${messages.length ? "has-conversation" : "is-empty"}`}>
          <header className="mf-gemini-chat-header">
            <button type="button" onClick={newConversation}><Plus size={16} /> {l("Nova conversa", "New conversation")}</button>
            <span><ShieldCheck size={14} /> {t(selectedRole.name)} · {workspace.scope.permittedDocuments} {l("fontes autorizadas", "authorized sources")}</span>
          </header>

          {messages.length === 0 ? (
            <div className="mf-gemini-empty">
              <div className="mf-gemini-glow" aria-hidden="true" />
              <div className="mf-gemini-intro">
                <span className="mf-gemini-mark"><Sparkles size={19} /></span>
                <h2>{l("Pergunte ao projeto", "Ask the project")}</h2>
                <p>{l(
                  `Você está falando como ${t(selectedRole.name)}. Antes de responder, o Brain autoriza, recupera e registra exatamente as evidências usadas.`,
                  `You are speaking as ${t(selectedRole.name)}. Before answering, the Brain authorizes, retrieves, and records the exact evidence it used.`,
                )}</p>
              </div>
              <BrainComposer value={draftQuestion} language={language} busy={busy} onChange={setDraftQuestion} onSubmit={submitQuestion} onOpenDocuments={() => setMode("documents")} />
              <div className="mf-gemini-suggestions" aria-label={l("Perguntas sugeridas", "Suggested questions") }>
                {suggestions[language].map((question) => (
                  <button type="button" key={question} onClick={() => void sendQuestion(question)}>{question} <ArrowRight size={13} /></button>
                ))}
              </div>
              <small className="mf-chat-demo-note"><Database size={12} /> {l("Conectado ao Context Compiler, verdade temporal e recibos do Urso Brain.", "Connected to the Urso Brain Context Compiler, temporal truth, and receipts.")}</small>
            </div>
          ) : (
            <div className="mf-gemini-conversation">
              <div className="mf-gemini-thread" aria-live="polite">
                {messages.map((message) => {
                  const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
                  if (!text) return null;
                  return message.role === "user" ? (
                    <div className="mf-gemini-user-message" key={message.id}><span>{text}</span></div>
                  ) : (
                    <article className="mf-gemini-answer" key={message.id}>
                      <header><span className="mf-gemini-mark"><Sparkles size={17} /></span><strong>Urso</strong></header>
                      <div className="mf-gemini-answer-copy"><RichText text={text} /></div>
                    </article>
                  );
                })}
                {busy ? <div className="mf-brain-thinking"><LoaderCircle className="mf-spin" size={16} /> {l("Compilando contexto autorizado…", "Compiling authorized context…")}</div> : null}
                {error ? <div className="mf-brain-chat-error"><AlertTriangle size={15} /> {errorText(error.message)}</div> : null}
                {latestReceipt ? (
                  <ContextReceipt
                    key={latestReceipt.runId}
                    receipt={latestReceipt}
                    language={language}
                    roleId={roleId}
                    sessionHeaders={sessionHeaders}
                    disabled={busy}
                    onOpenEvidence={openEvidence}
                  />
                ) : null}
              </div>
              <div className="mf-gemini-composer-dock">
                <BrainComposer compact value={draftQuestion} language={language} busy={busy} onChange={setDraftQuestion} onSubmit={submitQuestion} onOpenDocuments={() => setMode("documents")} />
                <small className="mf-chat-demo-note">{l("Verifique as fontes e decisões antes de agir.", "Verify sources and decisions before acting.")}</small>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ContextReceipt({
  receipt,
  language,
  roleId,
  sessionHeaders,
  disabled,
  onOpenEvidence,
}: {
  receipt: BrainContextReceipt;
  language: "pt" | "en";
  roleId: string;
  sessionHeaders: Record<string, string>;
  disabled: boolean;
  onOpenEvidence: (path: string) => void;
}) {
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const [learningState, setLearningState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "complete"; candidateCount: number; mode: string; evidenceRejected: boolean }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function reviewForLearning() {
    if (disabled || learningState.status === "running") return;
    setLearningState({ status: "running" });
    try {
      const response = await fetch("/api/mf/brain/learning", {
        method: "POST",
        headers: { "content-type": "application/json", ...sessionHeaders },
        body: JSON.stringify({ roleId, contextRunId: receipt.runId }),
      });
      const payload = (await response.json()) as {
        candidateCount?: number;
        mode?: string;
        status?: "complete" | "failed" | "skipped";
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Learning review failed");
      setLearningState({
        status: "complete",
        candidateCount: payload.candidateCount ?? 0,
        mode: payload.mode ?? "shadow",
        evidenceRejected: payload.status === "failed",
      });
    } catch (error) {
      setLearningState({
        status: "error",
        message: error instanceof Error ? error.message : "Learning review failed",
      });
    }
  }

  return (
    <section className="mf-live-receipt">
      <header>
        <span><ShieldCheck size={15} /><strong>{l("Recibo de contexto", "Context Receipt")}</strong></span>
        <code>{receipt.runId.slice(0, 8)}</code>
      </header>
      <div className="mf-live-receipt-metrics">
        <span><small>{l("Escopo", "Scope")}</small><strong>{receipt.scope.department}</strong></span>
        <span><small>{l("Recuperação", "Retrieval")}</small><strong>{receipt.retrieval.mode}</strong></span>
        <span><small>{l("Evidências", "Evidence")}</small><strong>{receipt.evidence.length}</strong></span>
        <span><small>{l("Verdade", "Truth")}</small><strong>{receipt.temporal?.queryTime.mode === "as_of" ? l("histórica", "historical") : l("atual", "current")}</strong></span>
      </div>
      <div className="mf-live-receipt-sources">
        {receipt.evidence.map((source) => (
          <button type="button" key={source.id} onClick={() => onOpenEvidence(source.path)}>
            <span>{source.id}</span>
            <strong>{source.title}</strong>
            <small>{source.heading || source.path} · v{source.version}</small>
          </button>
        ))}
      </div>
      {receipt.missing.length ? <p><AlertTriangle size={14} /> {receipt.missing.join(" ")}</p> : null}
      <div className="mf-live-learning">
        <span>
          <Sparkles size={14} />
          <span>
            <strong>{l("Aprendizado controlado", "Controlled learning")}</strong>
            <small>{l("Analisa esta conversa sem alterar a verdade automaticamente.", "Reviews this conversation without changing truth automatically.")}</small>
          </span>
        </span>
        {learningState.status === "complete" ? (
          <em>
            {learningState.evidenceRejected ? <ShieldCheck size={13} /> : <Check size={13} />}
            {learningState.evidenceRejected
              ? l("evidência rejeitada", "evidence rejected")
              : `${learningState.candidateCount} ${l("candidatos", "candidates")}`}
            {` · ${learningState.mode}`}
          </em>
        ) : (
          <button type="button" disabled={disabled || learningState.status === "running"} onClick={() => void reviewForLearning()}>
            {learningState.status === "running" ? <LoaderCircle className="mf-spin" size={13} /> : <Sparkles size={13} />}
            {learningState.status === "running" ? l("Analisando…", "Reviewing…") : l("Revisar aprendizado", "Review learning")}
          </button>
        )}
      </div>
      {learningState.status === "error" ? <p><AlertTriangle size={14} /> {learningState.message}</p> : null}
    </section>
  );
}

function DocumentInspector({
  document,
  claims,
  departmentName,
  language,
  onOpenDocuments,
}: {
  document: BrainDocument;
  claims: BrainClaim[];
  departmentName: string;
  language: "pt" | "en";
  onOpenDocuments?: () => void;
}) {
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const linkedClaims = claims.filter((claim) => claim.evidenceDocumentIds.includes(document.id));
  const category = documentCategory(document);
  return (
    <article className="mf-document-inspector">
      <header><span>{documentCode(document.title)}</span><small>{categoryLabels[category][language]}</small></header>
      <div className="mf-document-icon"><FileText size={22} /></div>
      <h2>{document.title}</h2>
      <p>{document.description}</p>
      <div className="mf-document-state"><Check size={14} /> v{document.current_version} · {document.origin === "vault" ? l("Sincronizado do Obsidian", "Synced from Obsidian") : l("Mantido no Brain", "Brain maintained")}</div>
      <dl>
        <div><dt>{l("Responsável", "Owner")}</dt><dd>{departmentName}</dd></div>
        <div><dt>{l("Visibilidade", "Visibility")}</dt><dd>{document.visibility}</dd></div>
        <div><dt>{l("Tipo", "Type")}</dt><dd>{document.doc_type}</dd></div>
      </dl>
      {linkedClaims.length ? (
        <section>
          <span className="mf-eyebrow">{l("Verdade temporal suportada", "Supported temporal truth")}</span>
          <div className="mf-document-claims">
            {linkedClaims.map((claim) => (
              <span key={claim.id} className={`is-${claim.lifecycle}`}><History size={12} /> {claim.subject} · {claim.predicate}: {claim.object}</span>
            ))}
          </div>
        </section>
      ) : null}
      <section className="mf-document-content">
        <span className="mf-eyebrow">{l("Conteúdo autorizado", "Authorized content")}</span>
        <pre>{document.content}</pre>
      </section>
      <section>
        <span className="mf-eyebrow">{l("Conectado a", "Connected to")}</span>
        <div className="mf-document-links">{document.links.slice(0, 6).map((path) => <span key={path}>{documentCode(path.split("/").pop()?.replace(/\.md$/i, "") ?? path)}</span>)}</div>
      </section>
      {onOpenDocuments ? <button type="button" className="mf-document-open" onClick={onOpenDocuments}><FolderOpen size={15} /> {l("Abrir no navegador de documentos", "Open in document browser")}</button> : null}
    </article>
  );
}
