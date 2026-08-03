"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  FileText,
  FolderOpen,
  GitBranch,
  Mic,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { askUrsoAnswers, project, roles } from "@/lib/mf-demo/fixtures";
import { useMfLanguage } from "./mf-language";

type BrainMode = "map" | "documents" | "ask";
type DocumentCategory = "truth" | "change" | "team" | "governance";
type BrainNodeKind = "project" | "document" | "decision" | "department" | "workflow";

type ProjectDocument = {
  id: string;
  code: string;
  title: string;
  englishTitle: string;
  category: DocumentCategory;
  kind: BrainNodeKind;
  owner: string;
  englishOwner: string;
  status: string;
  englishStatus: string;
  summary: string;
  englishSummary: string;
  purpose: string;
  englishPurpose: string;
  source: string;
  updated: string;
  availableAt: number;
  links: string[];
};

const documents: ProjectDocument[] = [
  {
    id: "brief",
    code: "BASE-001",
    title: "Brief vigente do projeto",
    englishTitle: "Current project brief",
    category: "truth",
    kind: "project",
    owner: "Coordenação do Projeto",
    englishOwner: "Project Coordination",
    status: "Vigente",
    englishStatus: "Current",
    summary: "Objetivos, limites e premissas aprovadas da Fase 3.",
    englishSummary: "Approved objectives, boundaries, and assumptions for Phase 3.",
    purpose: "É o ponto de partida que todas as equipes devem seguir.",
    englishPurpose: "It is the starting point every team must follow.",
    source: "MF Project Vault",
    updated: "Hoje · 08:20",
    availableAt: 0,
    links: ["schedule", "gate", "decision"],
  },
  {
    id: "datasheet-b",
    code: "SUP-DS-B",
    title: "Data Sheet da linha · Rev. B",
    englishTitle: "Bottling line data sheet · Rev. B",
    category: "truth",
    kind: "document",
    owner: "Engenharia de Processo",
    englishOwner: "Process Engineering",
    status: "Substituída após aprovação",
    englishStatus: "Superseded after approval",
    summary: "Versão anterior da geometria, carga e utilidades da linha.",
    englishSummary: "Previous version of the line geometry, load, and utility requirements.",
    purpose: "Permanece no histórico para explicar de onde cada mudança veio.",
    englishPurpose: "It remains in history to explain where every change came from.",
    source: "Supplier CDE",
    updated: "22 jul · 16:05",
    availableAt: 0,
    links: ["datasheet-c", "decision"],
  },
  {
    id: "datasheet-c",
    code: "SUP-DS-C",
    title: "Data Sheet da linha · Rev. C",
    englishTitle: "Bottling line data sheet · Rev. C",
    category: "change",
    kind: "document",
    owner: "Engenharia de Processo",
    englishOwner: "Process Engineering",
    status: "Proposta",
    englishStatus: "Proposed",
    summary: "Nova revisão: +1,2 m, +15% carga, +18% água gelada e entrega D+10.",
    englishSummary: "New revision: +1.2 m, +15% load, +18% chilled water, and delivery D+10.",
    purpose: "É a evidência que Urso compara antes de pedir uma decisão humana.",
    englishPurpose: "It is the evidence Urso compares before asking for a human decision.",
    source: "Slack · SUP-118",
    updated: "Hoje · 09:42",
    availableAt: 1,
    links: ["datasheet-b", "decision", "impact"],
  },
  {
    id: "decision",
    code: "DEC-042",
    title: "Aprovação da Revisão C",
    englishTitle: "Revision C approval",
    category: "governance",
    kind: "decision",
    owner: "Gerente do Projeto",
    englishOwner: "Project Manager",
    status: "Aguardando aprovação",
    englishStatus: "Awaiting approval",
    summary: "Decisão que torna a Rev. C verdade vigente do projeto.",
    englishSummary: "Decision that makes Revision C the current project truth.",
    purpose: "Impede que uma conversa ou anexo altere o projeto silenciosamente.",
    englishPurpose: "It prevents a conversation or attachment from silently changing the project.",
    source: "Urso Decision Log",
    updated: "Hoje · 09:45",
    availableAt: 2,
    links: ["brief", "datasheet-b", "datasheet-c", "impact", "gate"],
  },
  {
    id: "impact",
    code: "CHG-024",
    title: "Plano coordenado de impacto",
    englishTitle: "Coordinated impact plan",
    category: "change",
    kind: "workflow",
    owner: "Urso Harness + Coordenação",
    englishOwner: "Urso Harness + Coordination",
    status: "Gerado após decisão",
    englishStatus: "Generated after decision",
    summary: "Liga a mudança a dez equipes, seus responsáveis e critérios de fechamento.",
    englishSummary: "Connects the change to ten teams, their owners, and completion criteria.",
    purpose: "Transforma uma decisão aprovada em trabalho que pode ser executado.",
    englishPurpose: "It turns an approved decision into work that can be executed.",
    source: "change-propagation@1.4",
    updated: "Hoje · 09:48",
    availableAt: 4,
    links: ["decision", "electrical", "bim", "schedule", "gate"],
  },
  {
    id: "electrical",
    code: "ELE-08",
    title: "Pacote elétrico · Rev. 8",
    englishTitle: "Electrical package · Rev. 8",
    category: "team",
    kind: "department",
    owner: "Elétrica",
    englishOwner: "Electrical",
    status: "Revisão técnica",
    englishStatus: "Technical review",
    summary: "Lista de cargas, alimentador e unifilar atualizados para a Rev. C.",
    englishSummary: "Load list, feeder, and single-line diagram updated for Revision C.",
    purpose: "Mostra exatamente o trabalho atribuído à equipe elétrica.",
    englishPurpose: "It shows the exact work assigned to the electrical team.",
    source: "Electrical Agent + MF review",
    updated: "Hoje · 09:54",
    availableAt: 6,
    links: ["datasheet-c", "impact", "bim", "gate"],
  },
  {
    id: "bim",
    code: "BIM-SC-06",
    title: "Scaffold BIM de coordenação",
    englishTitle: "BIM coordination scaffold",
    category: "team",
    kind: "department",
    owner: "Metodologia BIM",
    englishOwner: "BIM Methodology",
    status: "Duas interferências abertas",
    englishStatus: "Two clashes open",
    summary: "Modelo conceitual para revisar envelope, conexões e interferências.",
    englishSummary: "Concept model for reviewing envelope, connections, and clashes.",
    purpose: "Dá às equipes uma base visual antes de editar o modelo construtivo.",
    englishPurpose: "It gives teams a visual starting point before editing the construction model.",
    source: "BIM scaffold agent",
    updated: "Hoje · 09:56",
    availableAt: 6,
    links: ["impact", "electrical", "gate"],
  },
  {
    id: "schedule",
    code: "PLN-REC-03",
    title: "Plano de recuperação do prazo",
    englishTitle: "Schedule recovery plan",
    category: "team",
    kind: "department",
    owner: "Planejamento e Controle",
    englishOwner: "Planning & Control",
    status: "Opção recomendada pronta",
    englishStatus: "Recommended option ready",
    summary: "Recupera oito dos dez dias com revisão paralela controlada.",
    englishSummary: "Recovers eight of ten days through controlled parallel review.",
    purpose: "Mostra como a decisão altera datas, dependências e o marco EXE-02.",
    englishPurpose: "It shows how the decision changes dates, dependencies, and milestone EXE-02.",
    source: "Schedule simulation agent",
    updated: "Hoje · 10:02",
    availableAt: 6,
    links: ["brief", "impact", "gate"],
  },
  {
    id: "gate",
    code: "EXE-02",
    title: "Checklist de liberação executiva",
    englishTitle: "Executive release checklist",
    category: "governance",
    kind: "decision",
    owner: "Qualidade",
    englishOwner: "Quality",
    status: "Aguardando evidências",
    englishStatus: "Awaiting evidence",
    summary: "Reúne decisões, revisões técnicas e aprovações necessárias para liberar.",
    englishSummary: "Collects decisions, technical reviews, and approvals needed for release.",
    purpose: "O projeto só avança quando a evidência exigida está completa.",
    englishPurpose: "The project only advances when the required evidence is complete.",
    source: "Quality Gate Register",
    updated: "Hoje · 10:18",
    availableAt: 5,
    links: ["brief", "decision", "impact", "electrical", "bim", "schedule"],
  },
];

const positions: Record<string, { x: number; y: number }> = {
  brief: { x: 450, y: 280 },
  "datasheet-b": { x: 130, y: 100 },
  "datasheet-c": { x: 130, y: 280 },
  decision: { x: 350, y: 110 },
  impact: { x: 640, y: 120 },
  electrical: { x: 760, y: 270 },
  bim: { x: 710, y: 440 },
  schedule: { x: 390, y: 465 },
  gate: { x: 180, y: 455 },
};

const categoryLabels: Record<DocumentCategory, { pt: string; en: string }> = {
  truth: { pt: "Verdade vigente", en: "Current truth" },
  change: { pt: "Mudança", en: "Change" },
  team: { pt: "Trabalho das equipes", en: "Team work" },
  governance: { pt: "Decisões e controle", en: "Decisions & control" },
};

function findAnswer(question: string, step: number) {
  const normalized = question.toLocaleLowerCase("pt-BR");
  let index = 0;
  if (normalized.includes("elétr") || normalized.includes("electr")) index = 1;
  else if (normalized.includes("document") || normalized.includes("revis") || normalized.includes("current")) index = 2;
  else if (normalized.includes("liber") || normalized.includes("falta") || normalized.includes("missing") || normalized.includes("release")) index = 3;

  const answer = askUrsoAnswers[index];
  if (index === 2 && step < 3) {
    return {
      ...answer,
      answer: "A Revisão B continua vigente. A Revisão C foi preservada e comparada, mas permanece proposta até a aprovação do Gerente do Projeto.",
      englishAnswer: "Revision B remains current. Revision C has been preserved and compared, but remains proposed until the Project Manager approves it.",
      sources: "Histórico de versões · CHG-024 · DEC-042",
    };
  }
  return { ...answer, englishAnswer: undefined };
}

function BrainComposer({
  value,
  language,
  compact = false,
  onChange,
  onSubmit,
  onOpenDocuments,
}: {
  value: string;
  language: "pt" | "en";
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
        aria-label={l("Adicionar uma fonte do projeto", "Add a project source")}
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
      />
      <div className="mf-brain-composer-tools">
        <span className="mf-brain-model"><i /> MF Project Brain <ChevronDown size={13} /></span>
        <button type="button" className="mf-brain-mic" aria-label={l("Entrada de voz (demonstração)", "Voice input (demonstration)")}>
          <Mic size={17} />
        </button>
        <button type="submit" className="mf-brain-send" disabled={!value.trim()} aria-label={l("Enviar pergunta", "Send question")}>
          <ArrowUp size={18} />
        </button>
      </div>
    </form>
  );
}

export function ProjectBrainWorkspace({ step, roleId }: { step: number; roleId: string }) {
  const { language, t } = useMfLanguage();
  const workspaceRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<BrainMode>("map");
  const [selectedDocumentId, setSelectedDocumentId] = useState("brief");
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "all">("all");
  const [draftQuestion, setDraftQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);

  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const availableDocuments = documents.filter((document) => step >= document.availableAt);
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];
  const filteredDocuments = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("pt-BR");
    return documents.filter((document) => {
      const matchesCategory = category === "all" || document.category === category;
      const matchesQuery = !normalized || [document.code, document.title, document.englishTitle, document.owner, document.englishOwner]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized));
      return matchesCategory && matchesQuery;
    });
  }, [category, searchQuery]);
  const activeAnswer = askedQuestion ? findAnswer(askedQuestion, step) : null;

  useEffect(() => {
    if (mode !== "ask") return;

    const frame = window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  function selectDocument(id: string) {
    setSelectedDocumentId(id);
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftQuestion.trim()) return;
    setAskedQuestion(draftQuestion.trim());
    setDraftQuestion("");
  }

  return (
    <section ref={workspaceRef} className="mf-brain-workspace" aria-label={l("Workspace do cérebro do projeto", "Project Brain workspace")}>
      <header className="mf-brain-workspace-header">
        <div>
          <span className="mf-brain-mark"><Network size={18} /></span>
          <span>
            <strong>{l("Cérebro do projeto", "Project Brain")}</strong>
            <small>{project.name} · {availableDocuments.length}/{documents.length} {l("registros disponíveis", "records available")}</small>
          </span>
        </div>
        <nav aria-label={l("Modos do cérebro", "Brain modes")}>
          <button type="button" className={mode === "map" ? "is-active" : ""} onClick={() => setMode("map")}>
            <GitBranch size={15} /> {l("Mapa", "Map")}
          </button>
          <button type="button" className={mode === "documents" ? "is-active" : ""} onClick={() => setMode("documents")}>
            <FolderOpen size={15} /> {l("Documentos", "Documents")} <span>{availableDocuments.length}/{documents.length}</span>
          </button>
          <button type="button" className={mode === "ask" ? "is-active" : ""} onClick={() => setMode("ask")}>
            <Bot size={15} /> {l("Perguntar ao Urso", "Ask Urso")}
          </button>
        </nav>
        <div className="mf-brain-trust"><ShieldCheck size={14} /> {l("Somente fontes autorizadas", "Authorized sources only")}</div>
      </header>

      {mode === "map" ? (
        <div className="mf-brain-map-layout">
          <div className="mf-brain-canvas">
            <div className="mf-brain-canvas-copy">
              <span>{l("Selecione um nó", "Select a node")}</span>
              <small>{l("Veja por que cada documento, decisão e equipe está conectado.", "See why every document, decision, and team is connected.")}</small>
            </div>
            <svg viewBox="0 0 900 560" aria-hidden="true">
              {documents.flatMap((document) => document.links.map((targetId) => {
                const target = documents.find((item) => item.id === targetId);
                const sourcePosition = positions[document.id];
                const targetPosition = target ? positions[target.id] : null;
                if (!targetPosition || document.id > targetId) return [];
                const highlighted = selectedDocument && (selectedDocument.id === document.id || selectedDocument.id === targetId);
                return [
                  <line
                    key={`${document.id}-${targetId}`}
                    x1={sourcePosition.x}
                    y1={sourcePosition.y}
                    x2={targetPosition.x}
                    y2={targetPosition.y}
                    className={highlighted ? "is-active" : ""}
                  />,
                ];
              }))}
            </svg>
            {documents.map((document) => {
              const position = positions[document.id];
              const selected = selectedDocument?.id === document.id;
              const available = step >= document.availableAt;
              return (
                <button
                  type="button"
                  key={document.id}
                  className={`mf-brain-node is-${document.kind} ${selected ? "is-selected" : ""} ${available ? "is-available" : "is-planned"}`}
                  data-planned-label={l("futuro", "planned")}
                  style={{ left: `${(position.x / 900) * 100}%`, top: `${(position.y / 560) * 100}%` }}
                  onClick={() => selectDocument(document.id)}
                  aria-pressed={selected}
                >
                  <i>{document.kind === "project" ? <Network size={16} /> : document.kind === "decision" ? <ShieldCheck size={15} /> : document.kind === "department" ? <UsersRound size={15} /> : document.kind === "workflow" ? <Workflow size={15} /> : <FileText size={15} />}</i>
                  <span>{document.code}</span>
                  <strong>{language === "pt" ? document.title : document.englishTitle}</strong>
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
            <DocumentInspector document={selectedDocument} language={language} onOpenDocuments={() => setMode("documents")} />
          ) : null}
        </div>
      ) : null}

      {mode === "documents" ? (
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
                <button type="button" key={document.id} className={`${selectedDocument?.id === document.id ? "is-active" : ""} ${step >= document.availableAt ? "is-available" : "is-planned"}`} onClick={() => selectDocument(document.id)}>
                  <span><FileText size={15} /></span>
                  <span>
                    <small>{document.code} · {language === "pt" ? document.owner : document.englishOwner}</small>
                    <strong>{language === "pt" ? document.title : document.englishTitle}</strong>
                    <em>{document.updated}</em>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {filteredDocuments.length === 0 ? <p>{l("Nenhum documento encontrado.", "No documents found.")}</p> : null}
            </div>
          </aside>
          {selectedDocument ? <DocumentInspector document={selectedDocument} language={language} /> : null}
        </div>
      ) : null}

      {mode === "ask" ? (
        <div className={`mf-gemini-chat ${askedQuestion ? "has-conversation" : "is-empty"}`}>
          <header className="mf-gemini-chat-header">
            <button type="button" onClick={() => setAskedQuestion(null)}>
              <Plus size={16} /> {l("Nova conversa", "New conversation")}
            </button>
            <span><ShieldCheck size={14} /> {t(selectedRole.name)} · {availableDocuments.length} {l("fontes autorizadas", "authorized sources")}</span>
          </header>

          {!askedQuestion ? (
            <div className="mf-gemini-empty">
              <div className="mf-gemini-glow" aria-hidden="true" />
              <div className="mf-gemini-intro">
                <span className="mf-gemini-mark"><Sparkles size={19} /></span>
                <h2>{l("Pronto quando você estiver", "Ready when you are")}</h2>
                <p>{l(
                  `Converse com o projeto como ${t(selectedRole.name)}. O Brain responde com a verdade vigente e mostra as fontes usadas.`,
                  `Talk to the project as ${t(selectedRole.name)}. The Brain answers from current truth and shows the sources it used.`,
                )}</p>
              </div>
              <BrainComposer
                value={draftQuestion}
                language={language}
                onChange={setDraftQuestion}
                onSubmit={submitQuestion}
                onOpenDocuments={() => setMode("documents")}
              />
              <div className="mf-gemini-suggestions" aria-label={l("Perguntas sugeridas", "Suggested questions")}>
                {askUrsoAnswers.slice(0, 3).map((item) => (
                  <button type="button" key={item.question} onClick={() => setAskedQuestion(item.question)}>
                    {t(item.question)} <ArrowRight size={13} />
                  </button>
                ))}
              </div>
              <small className="mf-chat-demo-note">{l("Demonstração com respostas determinísticas e rastreáveis.", "Demonstration with deterministic, traceable answers.")}</small>
            </div>
          ) : (
            <div className="mf-gemini-conversation">
              <div className="mf-gemini-thread" aria-live="polite">
                <div className="mf-gemini-user-message"><span>{t(askedQuestion)}</span></div>
                <article className="mf-gemini-answer">
                  <header><span className="mf-gemini-mark"><Sparkles size={17} /></span><strong>Urso</strong></header>
                  <p>{language === "en" && activeAnswer?.englishAnswer ? activeAnswer.englishAnswer : t(activeAnswer?.answer ?? "")}</p>
                  <section className="mf-gemini-sources">
                    <header><FileCheck2 size={15} /><strong>{l("Fontes verificadas", "Verified sources")}</strong><span>{availableDocuments.length} {l("disponíveis", "available")}</span></header>
                    <p>{t(activeAnswer?.sources ?? "")}</p>
                    <button type="button" onClick={() => setMode("documents")}>{l("Abrir documentos usados", "Open documents used")} <ArrowRight size={13} /></button>
                  </section>
                  <div className="mf-gemini-answer-actions">
                    <span><Check size={14} /> {l(`Verdade atual: ${step >= 3 ? "Rev. C" : "Rev. B"}`, `Current truth: ${step >= 3 ? "Rev. C" : "Rev. B"}`)}</span>
                    <button type="button" onClick={() => setAskedQuestion(null)}><Plus size={14} /> {l("Nova pergunta", "New question")}</button>
                  </div>
                </article>
              </div>
              <div className="mf-gemini-composer-dock">
                <BrainComposer
                  compact
                  value={draftQuestion}
                  language={language}
                  onChange={setDraftQuestion}
                  onSubmit={submitQuestion}
                  onOpenDocuments={() => setMode("documents")}
                />
                <small className="mf-chat-demo-note">{l("Urso pode cometer erros. Verifique as fontes e decisões antes de agir.", "Urso can make mistakes. Verify sources and decisions before acting.")}</small>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function DocumentInspector({
  document,
  language,
  onOpenDocuments,
}: {
  document: ProjectDocument;
  language: "pt" | "en";
  onOpenDocuments?: () => void;
}) {
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  return (
    <article className="mf-document-inspector">
      <header>
        <span>{document.code}</span>
        <small>{categoryLabels[document.category][language]}</small>
      </header>
      <div className="mf-document-icon"><FileText size={22} /></div>
      <h2>{language === "pt" ? document.title : document.englishTitle}</h2>
      <p>{language === "pt" ? document.summary : document.englishSummary}</p>
      <div className="mf-document-state"><Check size={14} /> {language === "pt" ? document.status : document.englishStatus}</div>
      <dl>
        <div><dt>{l("Responsável", "Owner")}</dt><dd>{language === "pt" ? document.owner : document.englishOwner}</dd></div>
        <div><dt>{l("Última atualização", "Last updated")}</dt><dd>{document.updated}</dd></div>
        <div><dt>{l("Origem", "Source")}</dt><dd>{document.source}</dd></div>
      </dl>
      <section>
        <span className="mf-eyebrow">{l("Por que o Brain usa isto", "Why the Brain uses this")}</span>
        <p>{language === "pt" ? document.purpose : document.englishPurpose}</p>
      </section>
      <section>
        <span className="mf-eyebrow">{l("Conectado a", "Connected to")}</span>
        <div className="mf-document-links">
          {document.links.slice(0, 4).map((id) => {
            const linked = documents.find((item) => item.id === id);
            return linked ? <span key={id}>{linked.code}</span> : null;
          })}
        </div>
      </section>
      {onOpenDocuments ? <button type="button" className="mf-document-open" onClick={onOpenDocuments}><FolderOpen size={15} /> {l("Abrir no navegador de documentos", "Open in document browser")}</button> : null}
    </article>
  );
}
