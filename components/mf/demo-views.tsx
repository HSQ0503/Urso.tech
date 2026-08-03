"use client";

import { useState } from "react";
import {
  AtSign,
  ArrowRight,
  Bell,
  Bot,
  Box,
  Check,
  ChevronDown,
  CircleDashed,
  Clock3,
  FileCheck2,
  FileSearch,
  FileText,
  GitCompareArrows,
  Hash,
  Headphones,
  Home,
  LockKeyhole,
  Maximize2,
  MessageSquareText,
  MoreHorizontal,
  Network,
  Paperclip,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  UserCheck,
  UsersRound,
  Workflow,
  Wrench,
} from "lucide-react";
import {
  activityEvents,
  artifacts,
  disciplines,
  roles,
} from "@/lib/mf-demo/fixtures";
import { nextActionLabels } from "@/lib/mf-demo/scenario";
import type {
  ArtifactReviewState,
  DemoView,
  DisciplineGroup,
  ImpactLevel,
} from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";
import { ProjectBrainWorkspace } from "./project-brain-workspace";

export type ViewProps = {
  step: number;
  roleId: string;
  onNavigate: (view: DemoView) => void;
  onAdvance: () => void;
  onOpenArtifact: (artifactId: string) => void;
  artifactReviewStates: Record<string, ArtifactReviewState>;
};

const roleArtifactIds: Record<string, string> = {
  "project-manager": "impact-plan",
  electrical: "electrical-package",
  bim: "bim-scaffold",
  planning: "recovery-plan",
  quality: "gate-checklist",
};

const groupLabels: Record<DisciplineGroup, { pt: string; en: string; detailPt: string; detailEn: string }> = {
  brain: { pt: "Decisão e controle", en: "Decision & control", detailPt: "5 equipes que orientam o projeto", detailEn: "5 teams that direct the project" },
  skeleton: { pt: "Infraestrutura física", en: "Physical infrastructure", detailPt: "4 equipes que formam a base", detailEn: "4 teams that form the base" },
  organs: { pt: "Sistemas da instalação", en: "Facility systems", detailPt: "6 equipes que fazem a fábrica operar", detailEn: "6 teams that make the facility operate" },
};

const impactLabels: Record<ImpactLevel, { pt: string; en: string }> = {
  critical: { pt: "Precisa agir", en: "Action required" },
  watch: { pt: "Precisa revisar", en: "Review required" },
  support: { pt: "Precisa verificar", en: "Check required" },
  none: { pt: "Sem alteração", en: "No change" },
};

const workflowCatalog = [
  {
    roleId: "project-manager",
    namePt: "Coordenar uma mudança de projeto",
    nameEn: "Coordinate a project change",
    triggerPt: "Uma nova revisão chega pelo Slack, Teams ou CDE",
    triggerEn: "A new revision arrives through Slack, Teams, or the CDE",
    actionPt: "Compara, localiza dependências e monta um plano integrado",
    actionEn: "Compares, finds dependencies, and builds an integrated plan",
    approvalPt: "Gerente aprova a nova verdade e os responsáveis",
    approvalEn: "Manager approves the new truth and owners",
    outputPt: "Decisão + plano de impacto",
    outputEn: "Decision + impact plan",
    sourcesPt: ["Slack · #fornecedor-linha", "Data Sheet Rev. C", "Baseline Rev. B"],
    sourcesEn: ["Slack · #supplier-line", "Data Sheet Rev. C", "Baseline Rev. B"],
    agentsPt: [
      ["Agente de mudança", "Compara revisões e extrai os deltas"],
      ["Agente de dependências", "Percorre o grafo das 15 equipes"],
      ["Agente de planejamento", "Monta responsáveis, datas e critérios"],
    ],
    agentsEn: [
      ["Change agent", "Compares revisions and extracts deltas"],
      ["Dependency agent", "Traverses the 15-team graph"],
      ["Planning agent", "Builds owners, dates, and criteria"],
    ],
    toolsPt: ["Comparador de documentos", "Grafo do Brain", "Planejador"],
    toolsEn: ["Document comparison", "Brain graph", "Planner"],
    runCode: "WF-REV-C-001",
  },
  {
    roleId: "electrical",
    namePt: "Atualizar o pacote elétrico",
    nameEn: "Update the electrical package",
    triggerPt: "Uma premissa de carga é alterada",
    triggerEn: "A load assumption changes",
    actionPt: "Puxa fontes, recalcula carga e prepara marcações do unifilar",
    actionEn: "Pulls sources, recalculates load, and prepares single-line markups",
    approvalPt: "Líder de Elétrica valida premissas e resultado",
    approvalEn: "Electrical Lead validates assumptions and result",
    outputPt: "Pacote elétrico Rev. 8",
    outputEn: "Electrical package Rev. 8",
    sourcesPt: ["Data Sheet Rev. C", "Unifilar Rev. 7", "Modelo federado"],
    sourcesEn: ["Data Sheet Rev. C", "Single-line Rev. 7", "Federated model"],
    agentsPt: [
      ["Agente de carga", "Recalcula demanda e reserva"],
      ["Agente de normas", "Verifica premissas e critérios"],
      ["Agente de documentação", "Prepara marcações e memorial"],
    ],
    agentsEn: [
      ["Load agent", "Recalculates demand and spare capacity"],
      ["Standards agent", "Checks assumptions and criteria"],
      ["Documentation agent", "Prepares markups and calculation note"],
    ],
    toolsPt: ["Calculadora de carga", "Revit", "Editor de unifilar"],
    toolsEn: ["Load calculator", "Revit", "Single-line editor"],
    runCode: "WF-ELE-008",
  },
  {
    roleId: "bim",
    namePt: "Preparar coordenação BIM",
    nameEn: "Prepare BIM coordination",
    triggerPt: "Geometria ou conexão muda",
    triggerEn: "Geometry or a connection changes",
    actionPt: "Puxa modelos, cria scaffold básico e identifica interferências",
    actionEn: "Pulls models, creates a basic scaffold, and identifies clashes",
    approvalPt: "Coordenador BIM decide o que entra no modelo federado",
    approvalEn: "BIM Coordinator decides what enters the federated model",
    outputPt: "Scaffold + relatório de interferências",
    outputEn: "Scaffold + clash report",
    sourcesPt: ["Modelo arquitetônico", "Modelo MEP", "Envelope Rev. C"],
    sourcesEn: ["Architectural model", "MEP model", "Envelope Rev. C"],
    agentsPt: [
      ["Agente de modelos", "Localiza e valida as versões corretas"],
      ["Agente de geometria", "Cria um scaffold coordenável"],
      ["Agente de interferências", "Prioriza clashes por impacto"],
    ],
    agentsEn: [
      ["Model agent", "Finds and validates the correct versions"],
      ["Geometry agent", "Creates a coordination-ready scaffold"],
      ["Clash agent", "Prioritizes clashes by impact"],
    ],
    toolsPt: ["CDE", "Revit", "Navisworks"],
    toolsEn: ["CDE", "Revit", "Navisworks"],
    runCode: "WF-BIM-014",
  },
  {
    roleId: "planning",
    namePt: "Recuperar o cronograma",
    nameEn: "Recover the schedule",
    triggerPt: "Uma data afeta o caminho crítico",
    triggerEn: "A date affects the critical path",
    actionPt: "Simula sequências e compara prazo, risco e dependências",
    actionEn: "Simulates sequences and compares time, risk, and dependencies",
    approvalPt: "Planejamento recomenda; gerente escolhe o cenário",
    approvalEn: "Planning recommends; the manager selects the scenario",
    outputPt: "Três cenários de recuperação",
    outputEn: "Three recovery scenarios",
    sourcesPt: ["Cronograma baseline", "Restrições abertas", "Datas dos fornecedores"],
    sourcesEn: ["Baseline schedule", "Open constraints", "Supplier dates"],
    agentsPt: [
      ["Agente de caminho crítico", "Rastreia atividades dependentes"],
      ["Agente de cenários", "Testa sequências e sobreposições"],
      ["Agente de risco", "Compara prazo, custo e exposição"],
    ],
    agentsEn: [
      ["Critical-path agent", "Traces dependent activities"],
      ["Scenario agent", "Tests sequences and overlaps"],
      ["Risk agent", "Compares time, cost, and exposure"],
    ],
    toolsPt: ["Primavera P6", "Simulador de cenários", "Registro de risco"],
    toolsEn: ["Primavera P6", "Scenario simulator", "Risk register"],
    runCode: "WF-PLN-021",
  },
  {
    roleId: "quality",
    namePt: "Verificar prontidão do gate",
    nameEn: "Verify gate readiness",
    triggerPt: "Uma liberação está próxima",
    triggerEn: "A release is approaching",
    actionPt: "Verifica evidências, aprovações e pendências em todas as equipes",
    actionEn: "Checks evidence, approvals, and open items across all teams",
    approvalPt: "Qualidade bloqueia ou libera com evidência",
    approvalEn: "Quality blocks or releases with evidence",
    outputPt: "Checklist EXE-02 auditável",
    outputEn: "Auditable EXE-02 checklist",
    sourcesPt: ["Gate EXE-02", "Registros de aprovação", "Pendências das equipes"],
    sourcesEn: ["EXE-02 gate", "Approval records", "Team open items"],
    agentsPt: [
      ["Agente de evidências", "Confirma arquivos e aprovações"],
      ["Agente de pendências", "Consolida bloqueios das 15 equipes"],
      ["Agente de auditoria", "Monta checklist e recibo rastreável"],
    ],
    agentsEn: [
      ["Evidence agent", "Confirms files and approvals"],
      ["Open-item agent", "Consolidates blockers across 15 teams"],
      ["Audit agent", "Builds the checklist and traceable receipt"],
    ],
    toolsPt: ["Índice de evidências", "Validador de gates", "Gerador de recibos"],
    toolsEn: ["Evidence index", "Gate validator", "Receipt generator"],
    runCode: "WF-QLT-002",
  },
] as const;

function currentProjectMessage(step: number, language: "pt" | "en") {
  const messages = language === "pt"
    ? [
        "O projeto está dentro do plano. O Brain monitora as fontes autorizadas.",
        "Uma revisão do fornecedor chegou e precisa ser entendida.",
        "Urso encontrou quatro mudanças materiais. A Rev. B ainda é a verdade vigente.",
        "A Rev. C foi aprovada. Agora dez equipes precisam atualizar seu trabalho.",
        "O impacto está mapeado. O projeto precisa distribuir os pacotes certos.",
        "Cada equipe recebeu fontes, ação, responsável e critério de conclusão.",
        "Os agentes produziram rascunhos. Os engenheiros precisam validá-los.",
        "As revisões técnicas terminaram. Falta confirmar o gate executivo.",
        "O marco EXE-02 está pronto com evidência completa e rastreável.",
      ]
    : [
        "The project is on plan. The Brain is monitoring authorized sources.",
        "A supplier revision arrived and needs to be understood.",
        "Urso found four material changes. Revision B is still the current truth.",
        "Revision C was approved. Ten teams now need to update their work.",
        "The impact is mapped. The project needs to distribute the right work packages.",
        "Every team received sources, an action, an owner, and a completion criterion.",
        "Agents produced drafts. Engineers now need to validate them.",
        "Technical reviews are complete. The executive gate needs final confirmation.",
        "Milestone EXE-02 is ready with complete, traceable evidence.",
      ];
  return messages[step];
}

function SlackSignalCapture({ approved, language }: { approved: boolean; language: "pt" | "en" }) {
  const [captureRun, setCaptureRun] = useState(0);
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);

  return (
    <section className="mf-signal-capture">
      <header>
        <div>
          <span className="mf-eyebrow">{l("Fonte de comunicação · Slack simulado", "Communication source · simulated Slack")}</span>
          <h2>{l("Veja a mudança entrar no projeto", "Watch the change enter the project")}</h2>
          <p>{l("A conversa gera evidência. O Harness a captura e o Brain protege a verdade aprovada.", "The conversation creates evidence. The Harness captures it, and the Brain protects approved truth.")}</p>
        </div>
        <button type="button" onClick={() => setCaptureRun((current) => current + 1)}>
          <Play size={14} /> {l("Repetir captura", "Replay capture")}
        </button>
      </header>

      <div className="mf-slack-clone" data-guide-key="change-source" key={captureRun}>
        <div className="mf-slack-topbar">
          <span className="mf-slack-window-controls"><i /><i /><i /></span>
          <label><Search size={14} /><span>{l("Buscar no projeto MF", "Search MF project")}</span></label>
          <span><Clock3 size={14} /></span>
        </div>

        <aside className="mf-slack-rail" aria-label={l("Navegação do Slack simulado", "Simulated Slack navigation")}>
          <strong>MF</strong>
          <span className="is-active"><Home size={16} /><small>{l("Início", "Home")}</small></span>
          <span><Bell size={16} /><small>{l("Atividade", "Activity")}</small></span>
          <span><AtSign size={16} /><small>DMs</small></span>
          <span><Plus size={17} /></span>
        </aside>

        <aside className="mf-slack-sidebar">
          <header><strong>MF · Uberlândia</strong><ChevronDown size={14} /></header>
          <nav>
            <span><MessageSquareText size={14} /> {l("Não lidas", "Unreads")}</span>
            <span><AtSign size={14} /> Threads</span>
          </nav>
          <section>
            <small>{l("Canais do projeto", "Project channels")}</small>
            <span><Hash size={14} /> projeto-geral</span>
            <span className="is-active"><Hash size={14} /> fornecedor-linha</span>
            <span><Hash size={14} /> coordenação-bim</span>
            <span><Hash size={14} /> elétrica</span>
          </section>
          <section>
            <small>Apps</small>
            <span className="mf-slack-harness-app"><Sparkles size={14} /> Urso Harness <i /></span>
          </section>
        </aside>

        <section className="mf-slack-channel">
          <header>
            <span><strong><Hash size={17} /> fornecedor-linha</strong><small>{l("Revisões, prazos e decisões do fornecedor", "Supplier revisions, dates, and decisions")}</small></span>
            <span><UsersRound size={15} /> 12 <Headphones size={15} /></span>
          </header>
          <div className="mf-slack-thread">
            <div className="mf-slack-day"><span>{l("Hoje", "Today")}</span></div>
            <article>
              <span className="mf-slack-avatar is-cm">CM</span>
              <div><header><strong>Carla Martins</strong><time>08:16</time></header><p>{l("A Rev. B continua sendo a referência aprovada para coordenação.", "Revision B remains the approved coordination reference.")}</p></div>
            </article>
            <article className="mf-slack-new-message">
              <span className="mf-slack-avatar is-lm">LM</span>
              <div>
                <header><strong>Lucas Mendes</strong><time>09:42</time><em>{l("nova", "new")}</em></header>
                <p>{l("Recebemos a revisão final da linha. Ela ficou 1,2 m maior, com aumento de carga, água gelada e entrega em D+10. @urso favor verificar o impacto.", "We received the final line revision. It is 1.2 m longer, with increased load, chilled water, and delivery at D+10. @urso please assess the impact.")}</p>
                <div className="mf-slack-file">
                  <span><FileText size={20} /></span>
                  <div><strong>Filling_Line_Data_Sheet_RevC.pdf</strong><small>PDF · 4.8 MB · {l("Revisão C", "Revision C")}</small></div>
                  <button type="button" aria-label={l("Abrir menu do arquivo", "Open file menu")}><MoreHorizontal size={15} /></button>
                </div>
                <div className="mf-slack-reactions"><span><Check size={12} /> 2</span><span><Smile size={12} /> 1</span></div>
              </div>
            </article>
          </div>
          <div className="mf-slack-composer">
            <div><strong>B</strong><em>I</em><Paperclip size={14} /></div>
            <span>{l("Mensagem para #fornecedor-linha", "Message #supplier-line")}</span>
            <button type="button" aria-label={l("Enviar mensagem", "Send message")}><Send size={14} /></button>
          </div>
        </section>

        <aside className="mf-harness-capture" aria-live="polite">
          <header>
            <span className="mf-harness-mark"><Bot size={17} /></span>
            <span><strong>Urso Harness</strong><small>{l("Observando #fornecedor-linha", "Watching #supplier-line")}</small></span>
            <i />
          </header>
          <div className="mf-harness-event">
            <span>{l("Sinal recebido", "Signal received")}</span>
            <strong>09:42:01</strong>
            <p>{l("Nova mensagem com PDF detectada no canal autorizado.", "New message with a PDF detected in the authorized channel.")}</p>
          </div>
          <ol>
            <li><span><Check size={12} /></span><div><strong>{l("Mensagem preservada", "Message preserved")}</strong><small>Slack event · EVT-771</small></div></li>
            <li><span><Check size={12} /></span><div><strong>{l("Documento indexado", "Document indexed")}</strong><small>SHA-256 · SUP-DS-C</small></div></li>
            <li><span><Check size={12} /></span><div><strong>{l("Revisão reconhecida", "Revision recognized")}</strong><small>Rev. B → Rev. C</small></div></li>
            <li><span><Check size={12} /></span><div><strong>{l("4 mudanças materiais", "4 material changes")}</strong><small>+1,2 m · +15% · +18% · D+10</small></div></li>
          </ol>
          <div className="mf-truth-guard">
            <ShieldCheck size={17} />
            <div><small>{l("Verdade protegida no Brain", "Brain truth protected")}</small><strong>{approved ? "REV. C" : "REV. B"}</strong><p>{approved ? l("Atualizada somente após DEC-042.", "Updated only after DEC-042.") : l("Rev. C é evidência proposta. Aprovação humana ainda necessária.", "Revision C is proposed evidence. Human approval is still required.")}</p></div>
          </div>
          <button type="button" className="mf-harness-review" disabled={approved}><FileSearch size={14} /> {approved ? l("Decisão registrada", "Decision recorded") : l("Abrir comparação B × C", "Open B × C comparison")}</button>
        </aside>
      </div>

      <footer className="mf-signal-meaning">
        <span><strong>1</strong>{l("Slack registra o sinal", "Slack records the signal")}</span>
        <ArrowRight size={14} />
        <span><strong>2</strong>{l("Harness cria evidência", "Harness creates evidence")}</span>
        <ArrowRight size={14} />
        <span><strong>3</strong>{l("Humano aprova", "Human approves")}</span>
        <ArrowRight size={14} />
        <span><strong>4</strong>{l("Brain atualiza a verdade", "Brain updates truth")}</span>
      </footer>
    </section>
  );
}

export function ControlTowerView({ step, roleId, onNavigate, onAdvance }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const stage = step === 0 ? "stable" : step < 3 ? "decision" : step < 8 ? "work" : "ready";
  const statusTitle = stage === "stable"
    ? l("Tudo sob controle", "Everything is under control")
    : stage === "decision"
      ? l("Uma mudança precisa de decisão", "One change needs a decision")
      : stage === "work"
        ? l("A mudança está sendo coordenada", "The change is being coordinated")
        : l("Pronto para liberar", "Ready to release");

  const truthSteps = [
    { label: l("Sinal", "Signal"), detail: "Slack", at: 1 },
    { label: l("Entendimento", "Understanding"), detail: l("4 diferenças", "4 differences"), at: 2 },
    { label: l("Decisão", "Decision"), detail: "DEC-042", at: 3 },
    { label: l("Trabalho", "Work"), detail: l("10 equipes", "10 teams"), at: 5 },
    { label: l("Liberação", "Release"), detail: "EXE-02", at: 8 },
  ];

  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header">
        <div>
          <span className="mf-eyebrow">{l("Projeto hoje", "Project today")}</span>
          <h1>{statusTitle}</h1>
          <p>{currentProjectMessage(step, language)}</p>
        </div>
        <button type="button" className="mf-primary-action" onClick={onAdvance} disabled={step === 8}>
          {step === 8 ? <Check size={16} /> : <ArrowRight size={16} />}
          {t(nextActionLabels[step])}
        </button>
      </header>

      <section className={`mf-truth-path is-${stage}`} data-guide-key="project-status" aria-label={l("Caminho da mudança à liberação", "Path from change to release")}>
        <div className="mf-truth-path-intro">
          <span>{l("Como Urso mantém o projeto alinhado", "How Urso keeps the project aligned")}</span>
          <strong>{step === 0 ? l("Aguardando uma mudança", "Waiting for a change") : l("Revisão C · linha de envase", "Revision C · bottling line")}</strong>
        </div>
        <ol>
          {truthSteps.map((item, index) => {
            const complete = step >= item.at;
            const current = step < item.at && (index === 0 || step >= truthSteps[index - 1].at);
            return (
              <li key={item.label} className={`${complete ? "is-complete" : ""} ${current ? "is-current" : ""}`}>
                <i>{complete ? <Check size={14} /> : index + 1}</i>
                <span><strong>{item.label}</strong><small>{complete ? item.detail : l("Aguardando", "Waiting")}</small></span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mf-today-grid">
        <section className="mf-focus-card">
          <header>
            <span className="mf-role-avatar">{t(selectedRole.name).slice(0, 2).toUpperCase()}</span>
            <span><small>{l("Você está trabalhando como", "You are working as")}</small><strong>{t(selectedRole.name)}</strong></span>
            <button type="button" onClick={() => onNavigate("disciplines")}>{l("Ver minha equipe", "View my team")} <ArrowRight size={13} /></button>
          </header>
          <div>
            <span className="mf-eyebrow">{l("O que importa para você agora", "What matters to you now")}</span>
            <h2>{step < 4 ? l("Acompanhar a decisão da Revisão C", "Track the Revision C decision") : t(selectedRole.focus)}</h2>
            <p>{step < 4 ? l("Urso ainda não distribuiu trabalho porque a nova premissa precisa de aprovação.", "Urso has not distributed work yet because the new assumption needs approval.") : t(selectedRole.assignment)}</p>
          </div>
          <footer>
            <span><FileText size={15} /> {step >= 5 ? t(selectedRole.deliverable) : l("Nenhum novo pacote atribuído", "No new package assigned")}</span>
            <button type="button" onClick={() => onNavigate(step < 4 ? "changes" : "workflows")}>{step < 4 ? l("Revisar mudança", "Review change") : l("Abrir meu workflow", "Open my workflow")} <ArrowRight size={14} /></button>
          </footer>
        </section>

        <section className="mf-release-card" data-guide-key="project-release">
          <header>
            <span><small>{l("Próximo marco", "Next milestone")}</small><strong>EXE-02 · {l("Liberação executiva", "Executive release")}</strong></span>
            <span className={`mf-simple-status is-${step >= 8 ? "ready" : step >= 3 ? "risk" : "stable"}`}>{step >= 8 ? l("Pronto", "Ready") : step >= 3 ? l("Em risco", "At risk") : l("No prazo", "On plan")}</span>
          </header>
          <div className="mf-schedule-compare">
            <div><span>{l("Plano original", "Original plan")}</span><strong>{l("16 AGO", "AUG 16")}</strong><small>{l("Baseline Rev. 12", "Baseline Rev. 12")}</small></div>
            <ArrowRight size={17} />
            <div><span>{l("Após Rev. C", "After Rev. C")}</span><strong>{l("26 AGO", "AUG 26")}</strong><small>{l("+10 dias", "+10 days")}</small></div>
            <ArrowRight size={17} />
            <div className={step >= 6 ? "is-recommended" : ""}><span>{l("Plano recomendado", "Recommended plan")}</span><strong>{step >= 6 ? l("18 AGO", "AUG 18") : "—"}</strong><small>{step >= 6 ? l("Recupera 8 dias", "Recovers 8 days") : l("Aguardando simulação", "Awaiting simulation")}</small></div>
          </div>
          <button type="button" onClick={() => onNavigate("changes")}>{l("Entender a mudança e o impacto", "Understand the change and impact")} <ArrowRight size={14} /></button>
        </section>
      </div>

      <section className="mf-what-urso-does">
        <div><Network size={18} /><span><strong>{l("Brain", "Brain")}</strong><small>{l("Mantém verdade, decisões e contexto conectados", "Keeps truth, decisions, and context connected")}</small></span></div>
        <div><Workflow size={18} /><span><strong>Harness</strong><small>{l("Transforma decisões em trabalho executável", "Turns decisions into executable work")}</small></span></div>
        <div><UserCheck size={18} /><span><strong>{l("Controle humano", "Human control")}</strong><small>{l("MF aprova toda mudança material", "MF approves every material change")}</small></span></div>
      </section>
    </div>
  );
}

export function ChangesView({ step, onNavigate, onAdvance }: ViewProps) {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);

  if (step === 0) {
    return (
      <div className="mf-clarity-view">
        <header className="mf-today-header">
          <div><span className="mf-eyebrow">{l("Mudança e aprovação", "Change & approval")}</span><h1>{l("Nenhuma mudança aguardando decisão", "No change is awaiting a decision")}</h1><p>{l("Urso monitora os canais autorizados, mas não transforma conversas em verdade do projeto.", "Urso monitors authorized channels but does not turn conversations into project truth.")}</p></div>
          <button type="button" className="mf-primary-action" onClick={onAdvance}><Play size={16} /> {l("Simular chegada da Revisão C", "Simulate Revision C arrival")}</button>
        </header>
        <section className="mf-empty-change-simple"><MessageSquareText size={24} /><span><strong>Slack · #fornecedor-linha</strong><small>{l("Monitoramento ativo · nenhuma ação necessária", "Active monitoring · no action needed")}</small></span></section>
      </div>
    );
  }

  const approved = step >= 3;
  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header">
        <div><span className="mf-eyebrow">CHG-024 · {l("Mudança detectada", "Change detected")}</span><h1>{l("A linha de envase mudou", "The bottling line changed")}</h1><p>{l("Urso comparou a nova revisão com a verdade vigente e preparou uma decisão explicável.", "Urso compared the new revision with current truth and prepared an explainable decision.")}</p></div>
        {step < 4 ? <button type="button" className="mf-primary-action" onClick={onAdvance}>{step < 2 ? <GitCompareArrows size={16} /> : step === 2 ? <UserCheck size={16} /> : <Network size={16} />}{step < 2 ? l("Comparar B e C", "Compare B and C") : step === 2 ? l("Aprovar Revisão C", "Approve Revision C") : l("Criar plano coordenado", "Create coordinated plan")}</button> : <button type="button" className="mf-secondary-action" onClick={() => onNavigate("workflows")}>{l("Ver trabalho criado", "View created work")} <ArrowRight size={14} /></button>}
      </header>

      <section className="mf-change-explainer">
        <article><span>1</span><div><small>{l("O que aconteceu", "What happened")}</small><h2>{l("Uma nova revisão chegou pelo Slack", "A new revision arrived through Slack")}</h2><p>{l("Mensagem e PDF foram preservados como evidência; ainda não alteraram o projeto.", "The message and PDF were preserved as evidence; they have not changed the project yet.")}</p></div></article>
        <article><span>2</span><div><small>{l("O que Urso sugere", "What Urso suggests")}</small><h2>{l("Adotar Rev. C e coordenar dez equipes", "Adopt Revision C and coordinate ten teams")}</h2><p>{l("A recomendação inclui impacto, responsáveis e um plano para recuperar oito dias.", "The recommendation includes impact, owners, and a plan to recover eight days.")}</p></div></article>
        <article className={approved ? "is-approved" : "is-pending"} data-guide-key="human-approval"><span>{approved ? <Check size={15} /> : "3"}</span><div><small>{l("Quem decide", "Who decides")}</small><h2>{l("Gerente do Projeto", "Project Manager")}</h2><p>{approved ? l("DEC-042 aprovada · Rev. C agora é a verdade vigente.", "DEC-042 approved · Revision C is now current truth.") : l("Urso não altera a baseline até receber aprovação.", "Urso does not change the baseline until approval is received.")}</p></div></article>
      </section>

      <SlackSignalCapture approved={approved} language={language} />

      <section className="mf-before-after" data-guide-key="change-comparison">
        <header><div><span className="mf-eyebrow">{l("Antes e depois", "Before & after")}</span><h2>{l("Quatro diferenças que afetam o projeto", "Four differences that affect the project")}</h2></div><span>{l("Fonte: Data Sheet Rev. B × Rev. C", "Source: Data Sheet Rev. B × Rev. C")}</span></header>
        <div className="mf-comparison-table">
          <div className="mf-comparison-head"><span>{l("Premissa", "Assumption")}</span><span>REV. B</span><span>REV. C</span><span>{l("O que isso afeta", "What it affects")}</span></div>
          {[
            [l("Comprimento", "Length"), "18,4 m", "19,6 m", l("Layout e circulação", "Layout and circulation")],
            [l("Carga instalada", "Installed load"), "640 kW", "736 kW", l("Elétrica e BIM", "Electrical and BIM")],
            [l("Água gelada", "Chilled water"), "420 kW", "496 kW", l("HVAC e tubulação", "HVAC and piping")],
            [l("Entrega", "Delivery"), l("06 AGO", "AUG 06"), l("16 AGO", "AUG 16"), l("Caminho crítico", "Critical path")],
          ].map((row) => <div className="mf-comparison-row" key={row[0]}><strong>{row[0]}</strong><span>{row[1]}</span><span>{row[2]} <em>↑</em></span><small>{row[3]}</small></div>)}
        </div>
      </section>

      <section className="mf-change-outcome" data-guide-key="change-impact">
        <div><span className="mf-eyebrow">{l("Impacto no prazo", "Schedule impact")}</span><h2>{l("Sem resposta: marco em 26 AGO", "Without a response: milestone on AUG 26")}</h2><p>{l("Plano recomendado: revisão paralela controlada para recuperar oito dias e mover o marco para 18 AGO.", "Recommended plan: controlled parallel review to recover eight days and move the milestone to AUG 18.")}</p></div>
        <div className="mf-mini-timeline"><span><i />{l("16 AGO", "AUG 16")}<small>{l("Baseline", "Baseline")}</small></span><span className="is-recovery"><i />{l("18 AGO", "AUG 18")}<small>{l("Recomendado", "Recommended")}</small></span><span className="is-late"><i />{l("26 AGO", "AUG 26")}<small>{l("Sem ação", "No action")}</small></span></div>
      </section>
    </div>
  );
}

export function DisciplinesView({ step, roleId, onNavigate, onAdvance, onOpenArtifact, artifactReviewStates }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const selectedArtifactId = roleArtifactIds[selectedRole.id];
  const reviewState = artifactReviewStates[selectedArtifactId] ?? (step >= 8 ? "approved" : step >= 7 ? "validated" : "draft");

  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Minha equipe e o projeto", "My team & the project")}</span><h1>{t(selectedRole.name)}</h1><p>{l("O Brain traduz a mesma decisão para cada equipe, mostrando apenas o contexto e o trabalho relevantes.", "The Brain translates the same decision for every team, showing only the relevant context and work.")}</p></div>{step < 5 ? <button type="button" className="mf-primary-action" onClick={onAdvance} disabled={step < 4}><Workflow size={16} /> {l("Distribuir trabalho", "Distribute work")}</button> : <button type="button" className="mf-secondary-action" onClick={() => onNavigate("workflows")}>{l("Abrir meu workflow", "Open my workflow")} <ArrowRight size={14} /></button>}</header>

      <section className="mf-role-brief" data-guide-key="role-work">
        <header><span className="mf-role-avatar">{t(selectedRole.name).slice(0, 2).toUpperCase()}</span><div><small>{l("Seu foco nesta mudança", "Your focus in this change")}</small><h2>{t(selectedRole.focus)}</h2></div><span className={`mf-simple-status ${step >= 5 ? "is-ready" : ""}`}>{step >= 5 ? l("Trabalho atribuído", "Work assigned") : l("Aguardando decisão", "Awaiting decision")}</span></header>
        <div className="mf-role-brief-flow">
          <div><small>1 · {l("Por que", "Why")}</small><strong>{step >= 4 ? l("Rev. C altera uma premissa da sua equipe", "Revision C changes one of your team assumptions") : l("Nenhum impacto aprovado ainda", "No approved impact yet")}</strong></div><ArrowRight size={16} /><div><small>2 · {l("Sua ação", "Your action")}</small><strong>{step >= 5 ? t(selectedRole.assignment) : l("Aguardando pacote coordenado", "Awaiting coordinated package")}</strong></div><ArrowRight size={16} /><div><small>3 · {l("Resultado esperado", "Expected result")}</small><strong>{t(selectedRole.deliverable)}</strong></div>
        </div>
        <footer><div>{selectedRole.evidence.map((item) => <span key={item}><FileCheck2 size={13} /> {t(item)}</span>)}</div><button type="button" onClick={() => onOpenArtifact(selectedArtifactId)} disabled={step < 6}><Maximize2 size={14} /> {step < 6 ? l("Disponível após execução", "Available after execution") : reviewState === "approved" ? l("Abrir resultado aprovado", "Open approved result") : l("Revisar resultado", "Review result")}</button></footer>
      </section>

      <section className="mf-team-map">
        <header><div><span className="mf-eyebrow">{l("Como as 15 equipes trabalham juntas", "How the 15 teams work together")}</span><h2>{l("Uma verdade, responsabilidades diferentes", "One truth, different responsibilities")}</h2></div><span>{step >= 4 ? l("10 equipes receberam impacto", "10 teams received an impact") : l("Projeto coordenado", "Coordinated project")}</span></header>
        <div>
          {(Object.keys(groupLabels) as DisciplineGroup[]).map((group) => (
            <article key={group}>
              <header><strong>{language === "pt" ? groupLabels[group].pt : groupLabels[group].en}</strong><small>{language === "pt" ? groupLabels[group].detailPt : groupLabels[group].detailEn}</small></header>
              <ul>{disciplines.filter((discipline) => discipline.group === group).map((discipline) => { const impacted = step >= 4 ? discipline.impact : "none"; return <li key={discipline.id} className={`is-${impacted}`}><span>{discipline.shortName}</span><div><strong>{language === "pt" ? discipline.name : discipline.englishName}</strong><small>{language === "pt" ? impactLabels[impacted].pt : impactLabels[impacted].en}</small></div>{impacted !== "none" ? <i /> : null}</li>; })}</ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function WorkflowsView({ step, roleId, onNavigate, onAdvance }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const [workflowSelection, setWorkflowSelection] = useState({ roleContextId: roleId, workflowRoleId: selectedRole.id });
  const selectedWorkflowRoleId = workflowSelection.roleContextId === roleId ? workflowSelection.workflowRoleId : selectedRole.id;
  const selectedWorkflow = workflowCatalog.find((workflow) => workflow.roleId === selectedWorkflowRoleId) ?? workflowCatalog[0];
  const workflowRole = roles.find((role) => role.id === selectedWorkflow.roleId) ?? roles[0];
  const selectedSources = language === "pt" ? selectedWorkflow.sourcesPt : selectedWorkflow.sourcesEn;
  const selectedAgents = language === "pt" ? selectedWorkflow.agentsPt : selectedWorkflow.agentsEn;
  const selectedTools = language === "pt" ? selectedWorkflow.toolsPt : selectedWorkflow.toolsEn;
  const progressIndex = step < 5 ? -1 : step === 5 ? 2 : step === 6 ? 4 : step === 7 ? 5 : 6;
  const deploymentStatus = step < 5
    ? l("Bloqueado até a aprovação", "Locked until approval")
    : step === 5
      ? l("Pronto para implantar", "Ready to deploy")
      : step === 6
        ? l("Aguardando revisão humana", "Waiting for human review")
        : step === 7
          ? l("Revisão concluída", "Review complete")
          : l("Concluído e registrado", "Completed and recorded");
  const deploymentAction = step < 5
    ? l("Aprovação necessária", "Approval required")
    : step === 5
      ? l("Implantar workflow", "Deploy workflow")
      : step === 6
        ? l("Confirmar revisão", "Confirm review")
        : step === 7
          ? l("Liberar resultado", "Release result")
          : l("Workflow concluído", "Workflow complete");
  const stageClass = (index: number) => {
    if (progressIndex < 0) return "is-locked";
    if (index < progressIndex) return "is-complete";
    if (index === progressIndex && progressIndex < 6) return "is-current";
    return "is-pending";
  };

  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Harness · workflows agentivos", "Harness · agentic workflows")}</span><h1>{l("Escolha o trabalho. Veja exatamente o que os agentes farão.", "Choose the work. See exactly what the agents will do.")}</h1><p>{l("Cada workflow mostra suas fontes, agentes, ferramentas, controle humano e resultado antes de ser implantado.", "Every workflow shows its sources, agents, tools, human control, and outcome before it is deployed.")}</p></div></header>

      <section className="mf-workflow-deployment">
        <header>
          <div><span className="mf-eyebrow">{l("Central de implantação", "Deployment studio")}</span><h2>{l("Workflows disponíveis para as equipes MF", "Workflows available to MF teams")}</h2></div>
          <span className={`mf-deployment-status ${step < 5 ? "is-locked" : step >= 8 ? "is-complete" : "is-active"}`}><i />{deploymentStatus}</span>
        </header>

        <div className="mf-deployment-layout">
          <aside className="mf-workflow-picker" aria-label={l("Escolher workflow", "Choose workflow")}>
            <header><strong>{l("1. Escolha um workflow", "1. Choose a workflow")}</strong><small>{l("Selecione para inspecionar antes de implantar", "Select one to inspect before deployment")}</small></header>
            <nav>
              {workflowCatalog.map((workflow, index) => {
                const role = roles.find((item) => item.id === workflow.roleId) ?? roles[0];
                const isSelected = workflow.roleId === selectedWorkflow.roleId;
                return (
                  <button key={workflow.roleId} type="button" className={isSelected ? "is-selected" : ""} onClick={() => setWorkflowSelection({ roleContextId: roleId, workflowRoleId: workflow.roleId })} aria-pressed={isSelected}>
                    <i>{String(index + 1).padStart(2, "0")}</i>
                    <span><small>{t(role.name)}</small><strong>{language === "pt" ? workflow.namePt : workflow.nameEn}</strong><em>{language === "pt" ? workflow.outputPt : workflow.outputEn}</em></span>
                    <ArrowRight size={14} />
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="mf-workflow-canvas">
            <header>
              <div><span><Workflow size={14} /> {selectedWorkflow.runCode}</span><h3>{language === "pt" ? selectedWorkflow.namePt : selectedWorkflow.nameEn}</h3><p>{t(workflowRole.name)} · {language === "pt" ? selectedWorkflow.actionPt : selectedWorkflow.actionEn}</p></div>
              <button type="button" className="mf-primary-action" onClick={onAdvance} disabled={step < 5 || step >= 8}><Play size={15} />{deploymentAction}</button>
            </header>

            <div className="mf-agentic-map" aria-label={l("Mapa visual do workflow agentivo", "Visual agentic workflow map")}>
              <article className={`mf-agentic-node is-source ${stageClass(0)}`}>
                <header><i><MessageSquareText size={15} /></i><span><small>{l("Entrada", "Input")}</small><strong>{l("Sinal e fontes", "Signal & sources")}</strong></span><b>{stageClass(0) === "is-complete" ? <Check size={12} /> : "01"}</b></header>
                <p>{language === "pt" ? selectedWorkflow.triggerPt : selectedWorkflow.triggerEn}</p>
                <ul>{selectedSources.map((source) => <li key={source}><FileText size={11} />{source}</li>)}</ul>
              </article>

              <div className="mf-agentic-connector"><ArrowRight size={16} /><small>{l("contextualiza", "contextualizes")}</small></div>

              <article className={`mf-agentic-node is-brain ${stageClass(1)}`}>
                <header><i><Network size={15} /></i><span><small>Urso Brain</small><strong>{l("Contexto autorizado", "Authorized context")}</strong></span><b>{stageClass(1) === "is-complete" ? <Check size={12} /> : "02"}</b></header>
                <p>{l("Carrega a verdade vigente, permissões e dependências relevantes para este trabalho.", "Loads current truth, permissions, and dependencies relevant to this work.")}</p>
                <footer><span><ShieldCheck size={12} />{l("Escopo controlado", "Controlled scope")}</span><span>{l("Somente leitura", "Read-only")}</span></footer>
              </article>

              <div className="mf-agentic-connector"><ArrowRight size={16} /><small>{l("delega", "delegates")}</small></div>

              <article className={`mf-agentic-node is-agents ${stageClass(2)}`}>
                <header><i><Bot size={15} /></i><span><small>{l("Execução agentiva", "Agentic execution")}</small><strong>{selectedAgents.length} {l("agentes coordenados", "coordinated agents")}</strong></span><b>{stageClass(2) === "is-complete" ? <Check size={12} /> : "03"}</b></header>
                <div>{selectedAgents.map(([name, task], index) => <section key={name}><i>{index + 1}</i><span><strong>{name}</strong><small>{task}</small></span></section>)}</div>
              </article>

              <div className="mf-agentic-connector"><ArrowRight size={16} /><small>{l("usa", "uses")}</small></div>

              <article className={`mf-agentic-node is-tools ${stageClass(3)}`}>
                <header><i><Wrench size={15} /></i><span><small>{l("Ferramentas", "Tools")}</small><strong>{l("Ações permitidas", "Permitted actions")}</strong></span><b>{stageClass(3) === "is-complete" ? <Check size={12} /> : "04"}</b></header>
                <div>{selectedTools.map((tool) => <span key={tool}><Check size={11} />{tool}</span>)}</div>
                <footer>{l("Rascunhos apenas · nenhuma emissão automática", "Drafts only · no automatic issuance")}</footer>
              </article>

              <div className="mf-agentic-connector"><ArrowRight size={16} /><small>{l("solicita", "requests")}</small></div>

              <article className={`mf-agentic-node is-gate ${stageClass(4)}`} data-guide-key="human-review">
                <header><i><UserCheck size={15} /></i><span><small>{l("Gate humano", "Human gate")}</small><strong>{l("Revisar e decidir", "Review & decide")}</strong></span><b>{stageClass(4) === "is-complete" ? <Check size={12} /> : "05"}</b></header>
                <p>{language === "pt" ? selectedWorkflow.approvalPt : selectedWorkflow.approvalEn}</p>
                <footer><span>{t(workflowRole.name)}</span><span>{l("Obrigatório", "Required")}</span></footer>
              </article>

              <div className="mf-agentic-connector"><ArrowRight size={16} /><small>{l("libera", "releases")}</small></div>

              <article className={`mf-agentic-node is-output ${stageClass(5)}`}>
                <header><i><FileCheck2 size={15} /></i><span><small>{l("Resultado", "Outcome")}</small><strong>{l("Trabalho verificável", "Verifiable work")}</strong></span><b>{stageClass(5) === "is-complete" ? <Check size={12} /> : "06"}</b></header>
                <p>{language === "pt" ? selectedWorkflow.outputPt : selectedWorkflow.outputEn}</p>
                <button type="button" onClick={() => onNavigate("artifacts")}>{l("Abrir resultados", "Open outputs")}<ArrowRight size={13} /></button>
              </article>
            </div>

            <footer className="mf-workflow-receipt">
              <div><ShieldCheck size={16} /><span><strong>{l("Tudo volta ao Brain", "Everything returns to the Brain")}</strong><small>{l("Entradas, chamadas de ferramentas, decisões e resultados formam um recibo auditável.", "Inputs, tool calls, decisions, and outputs form an auditable receipt.")}</small></span></div>
              <code>RCPT-{selectedWorkflow.runCode.slice(3)}</code>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}

function BimScaffold({ active }: { active: boolean }) {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  return (
    <div className={`mf-bim-preview mf-bim-monochrome ${active ? "is-active" : ""}`}>
      <svg viewBox="0 0 620 330" role="img" aria-label={l("Scaffold BIM conceitual", "Concept BIM scaffold")}>
        <defs><pattern id="mf-grid-mono" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" /></pattern></defs>
        <rect width="620" height="330" fill="url(#mf-grid-mono)" />
        <path d="M80 235 272 124l275 70-192 111Z" fill="rgba(255,255,255,.025)" stroke="#555" />
        <path d="M164 226 302 148l140 36-139 80Z" fill="rgba(255,255,255,.04)" stroke="#8c8c8c" strokeDasharray="7 6" />
        <path d="M148 221 313 127l169 43-166 96Z" fill={active ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.07)"} stroke={active ? "#fff" : "#777"} strokeWidth="2" />
        <path d="M148 221v-52l165-93 169 43v51M313 76v51M482 119v51M148 169l165 43 169-93" fill="none" stroke="rgba(255,255,255,.35)" />
        <circle cx="313" cy="212" r="7" fill="#fff" /><circle cx="448" cy="135" r="7" fill="#e44" />
        <path d="M313 212 258 294" stroke="#fff" strokeDasharray="4 4" /><path d="M448 135 506 74" stroke="#e44" strokeDasharray="4 4" />
        <text x="178" y="320" fill="#bbb" fontSize="12">+1,2 m · {l("envelope revisado", "revised envelope")}</text><text x="512" y="70" fill="#ff8888" fontSize="11">{l("Interferência 02", "Clash 02")}</text>
      </svg>
      <span className="mf-demo-watermark">{l("DEMONSTRAÇÃO · NÃO CONSTRUTIVO", "DEMONSTRATION · NOT FOR CONSTRUCTION")}</span>
    </div>
  );
}

export function ArtifactsView({ step, onNavigate, onAdvance, onOpenArtifact, artifactReviewStates }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Trabalho produzido", "Work produced")}</span><h1>{l("O que os workflows entregam às equipes", "What workflows deliver to teams")}</h1><p>{l("Cada item abaixo é um rascunho, análise ou checklist criado para uma pessoa da MF revisar. Nada é emitido automaticamente.", "Each item below is a draft, analysis, or checklist created for an MF employee to review. Nothing is issued automatically.")}</p></div>{step >= 5 && step < 7 ? <button type="button" className="mf-primary-action" onClick={onAdvance}><Bot size={16} />{step < 6 ? l("Gerar resultados", "Generate results") : l("Enviar para revisão", "Send for review")}</button> : null}</header>

      <section className="mf-output-definition" data-guide-key="work-produced"><FileCheck2 size={20} /><div><strong>{l("“Trabalho produzido” significa uma saída verificável", "“Work produced” means a verifiable output")}</strong><p>{l("Ela mostra as fontes usadas, o que Urso fez, quem precisa revisar e qual decisão depende dela.", "It shows the sources used, what Urso did, who must review it, and which decision depends on it.")}</p></div></section>

      <section className="mf-output-list">
        {artifacts.map((artifact) => {
          const unlocked = step >= artifact.availableAt;
          const reviewState = artifactReviewStates[artifact.id] ?? (step >= 8 ? "approved" : step >= 7 ? "validated" : "draft");
          return <article key={artifact.id} className={unlocked ? "is-ready" : "is-locked"}><div className="mf-output-type">{unlocked ? <FileCheck2 size={18} /> : <LockKeyhole size={17} />}<span><small>{t(artifact.type)}</small><strong>{t(artifact.title)}</strong></span></div><div><small>{l("O que é", "What it is")}</small><p>{unlocked ? t(artifact.description) : l(`Disponível quando o workflow chegar à etapa ${artifact.availableAt}.`, `Available when the workflow reaches step ${artifact.availableAt}.`)}</p></div><div><small>{l("Por que importa", "Why it matters")}</small><p>{unlocked ? t(artifact.validation) : l("Ainda não foi gerado.", "It has not been generated yet.")}</p></div><div><small>{l("Quem revisa", "Who reviews")}</small><p>{t(artifact.discipline)}</p></div><div className="mf-output-action"><span className={`mf-simple-status is-${reviewState}`}>{!unlocked ? l("Bloqueado", "Locked") : reviewState === "approved" ? l("Aprovado", "Approved") : reviewState === "validated" ? l("Pronto para aprovar", "Ready to approve") : l("Rascunho", "Draft")}</span><button type="button" onClick={() => onOpenArtifact(artifact.id)} disabled={!unlocked}><Maximize2 size={14} /> {l("Abrir e revisar", "Open and review")}</button></div></article>;
        })}
      </section>

      <section className="mf-bim-output"><header><div><span className="mf-eyebrow">{l("Exemplo visual · workflow BIM", "Visual example · BIM workflow")}</span><h2>{l("Scaffold básico para iniciar coordenação", "Basic scaffold to start coordination")}</h2></div><span>{l("Rascunho · exige revisão BIM", "Draft · requires BIM review")}</span></header><BimScaffold active={step >= 6} /><footer><Box size={17} /><p>{l("Urso organiza geometria, conexões e áreas de interferência para a equipe começar. O Coordenador BIM decide o que entra no modelo oficial.", "Urso organizes geometry, connections, and clash areas so the team can begin. The BIM Coordinator decides what enters the official model.")}</p><button type="button" onClick={() => onNavigate("workflows")}>{l("Ver como o workflow funciona", "See how the workflow works")} <ArrowRight size={14} /></button></footer></section>
    </div>
  );
}

export function BrainView({ step, roleId, onNavigate }: ViewProps) {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  return (
    <div className="mf-clarity-view is-brain-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Urso Brain · verdade do projeto", "Urso Brain · project truth")}</span><h1>{l("Tudo que o projeto sabe, conectado e explicável", "Everything the project knows, connected and explainable")}</h1><p>{l("Explore relações, abra os documentos usados pelo sistema ou converse com o Brain no contexto do seu papel.", "Explore relationships, open the documents used by the system, or talk to the Brain in the context of your role.")}</p></div><button type="button" className="mf-secondary-action" onClick={() => onNavigate("audit")}>{l("Ver histórico de decisões", "View decision history")} <ArrowRight size={14} /></button></header>
      <ProjectBrainWorkspace step={step} roleId={roleId} />
    </div>
  );
}

export function AuditView({ step, onNavigate, artifactReviewStates }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const events = activityEvents.filter((event) => step >= event.availableAt).reverse();
  const approvedArtifacts = artifacts.filter((artifact) => artifactReviewStates[artifact.id] === "approved" || step >= 8);
  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Decisões e histórico", "Decisions & history")}</span><h1>{l("Nada muda sem deixar uma explicação", "Nothing changes without leaving an explanation")}</h1><p>{l("Veja o que mudou, quem aprovou, quais fontes foram usadas e o que o sistema atualizou.", "See what changed, who approved it, which sources were used, and what the system updated.")}</p></div><button type="button" className="mf-secondary-action" onClick={() => onNavigate("brain")}>{l("Abrir relações no Brain", "Open relationships in the Brain")} <Network size={14} /></button></header>
      <section className="mf-audit-summary"><div><Clock3 size={18} /><span><small>{l("Workflow", "Workflow")}</small><strong>change-propagation@1.4</strong></span></div><div><UserCheck size={18} /><span><small>{l("Decisão humana", "Human decision")}</small><strong>{step >= 3 ? "DEC-042 · " + l("Aprovada", "Approved") : l("Aguardando", "Waiting")}</strong></span></div><div><ShieldCheck size={18} /><span><small>{l("Trabalho aprovado", "Approved work")}</small><strong>{approvedArtifacts.length} / {artifacts.length}</strong></span></div></section>
      <section className="mf-history-list"><header><span>{l("Horário", "Time")}</span><span>{l("O que aconteceu", "What happened")}</span><span>{l("Quem / sistema", "Who / system")}</span><span>{l("Evidência", "Evidence")}</span></header>{approvedArtifacts.map((artifact) => <div key={artifact.id}><time>{l("Agora", "Now")}</time><span><strong>{t(artifact.title)}</strong><small>{l("Resultado aprovado e conectado ao Brain", "Result approved and connected to the Brain")}</small></span><span>{t(artifact.discipline)}</span><code>RCPT-{artifact.id.slice(0, 4).toUpperCase()}</code></div>)}{events.map((event) => <div key={event.id}><time>{event.time}</time><span><strong>{t(event.title)}</strong><small>{t(event.detail)}</small></span><span>{event.id === "approved" ? l("Gerente do Projeto", "Project Manager") : "Urso Harness"}</span><code>RCPT-{String(event.availableAt + 41).padStart(3, "0")}</code></div>)}</section>
    </div>
  );
}

export function EmptyScenarioView({ onNavigate }: { onNavigate: (view: DemoView) => void }) {
  return <div className="mf-empty-view"><CircleDashed size={32} /><h1>Esta área entra na próxima etapa.</h1><p>Volte para a visão do projeto para continuar o cenário.</p><button type="button" className="mf-primary-action" onClick={() => onNavigate("control")}>Abrir projeto hoje</button></div>;
}
