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
} from "lucide-react";
import {
  activityEvents,
  artifacts,
  roles,
} from "@/lib/mf-demo/fixtures";
import { mfScenarioManifest } from "@/lib/mf-demo/manifest.mjs";
import { deriveMfArtifactAccess } from "@/lib/mf-demo/workflow-runtime.mjs";
import type {
  ArtifactReviewState,
  DemoView,
  MfHarnessSnapshot,
} from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";
import { MfAgentWorkflow } from "./mf-agent-workflow";
import { MfManagerWorkspace } from "./mf-manager-workspace";
import { MfTeamCommand } from "./mf-team-command";
import { ProjectBrainWorkspace } from "./project-brain-workspace";
import {
  ConnectedSourcesPanel,
  ControlledChangePanel,
  OutcomeComparisonPanel,
  PilotProposalPanel,
} from "./mf-story-panels";

export type ViewProps = {
  step: number;
  roleId: string;
  onNavigate: (view: DemoView) => void;
  onAdvance: () => void;
  onOpenArtifact: (artifactId: string) => void;
  artifactReviewStates: Record<string, ArtifactReviewState>;
  sessionId?: string;
  sessionToken?: string;
  snapshot?: MfHarnessSnapshot;
};

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

export function ControlTowerView({ step, onNavigate, onAdvance, snapshot }: ViewProps) {
  if (!snapshot) return <div className="mf-clarity-view mf-manager-loading" aria-busy="true" />;
  return (
    <div className="mf-clarity-view">
      <MfManagerWorkspace snapshot={snapshot} onAdvance={onAdvance} onNavigate={onNavigate} />
      {step >= 8 ? <><OutcomeComparisonPanel snapshot={snapshot} /><PilotProposalPanel /></> : null}
    </div>
  );
}

export function ChangesView({ step, roleId, onNavigate, onAdvance, snapshot }: ViewProps) {
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
        {snapshot ? <ConnectedSourcesPanel snapshot={snapshot} roleId={roleId} /> : null}
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

      {snapshot ? <><ConnectedSourcesPanel snapshot={snapshot} roleId={roleId} /><ControlledChangePanel snapshot={snapshot} /></> : null}

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
            [l("Carga instalada", "Installed load"), `${mfScenarioManifest.revisions.B.electricalKw} kW`, `${mfScenarioManifest.revisions.C.electricalKw} kW`, l("Elétrica e BIM", "Electrical and BIM")],
            [l("Água gelada", "Chilled water"), `${mfScenarioManifest.revisions.B.chilledWaterKw} kW`, `${mfScenarioManifest.revisions.C.chilledWaterKw} kW`, l("HVAC e tubulação", "HVAC and piping")],
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

export function DisciplinesView({ step, roleId, onNavigate, onAdvance, snapshot }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];

  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Minha equipe e o projeto", "My team & the project")}</span><h1>{t(selectedRole.name)}</h1><p>{l("O Brain traduz a mesma decisão para cada equipe, mostrando apenas o contexto e o trabalho relevantes.", "The Brain translates the same decision for every team, showing only the relevant context and work.")}</p></div>{step < 5 ? <button type="button" className="mf-primary-action" onClick={onAdvance} disabled={step < 4}><Workflow size={16} /> {l("Distribuir trabalho", "Distribute work")}</button> : <button type="button" className="mf-secondary-action" onClick={() => onNavigate("workflows")}>{l("Abrir meu workflow", "Open my workflow")} <ArrowRight size={14} /></button>}</header>
      {snapshot ? <MfTeamCommand snapshot={snapshot} selectedRoleId={roleId} onNavigate={onNavigate} /> : <div className="mf-manager-loading" aria-busy="true" />}
    </div>
  );
}

export function WorkflowsView({ roleId, onNavigate, onAdvance, snapshot }: ViewProps) {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const defaultWorkflow = mfScenarioManifest.workflow.catalog.find((workflow) => workflow.ownerRoleId === roleId)
    ?? mfScenarioManifest.workflow.catalog[0];
  const [workflowSelection, setWorkflowSelection] = useState({
    roleContextId: roleId,
    workflowId: defaultWorkflow.id,
  });
  const selectedWorkflowId = workflowSelection.roleContextId === roleId
    && mfScenarioManifest.workflow.catalog.some((workflow) => workflow.id === workflowSelection.workflowId)
    ? workflowSelection.workflowId
    : defaultWorkflow.id;

  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Harness · workflows agentivos", "Harness · agentic workflows")}</span><h1>{l("Escolha o trabalho. Veja exatamente o que os agentes farão.", "Choose the work. See exactly what the agents will do.")}</h1><p>{l("Cada workflow mostra suas fontes, agentes, ferramentas, controle humano e resultado antes de ser implantado.", "Every workflow shows its sources, agents, tools, human control, and outcome before it is deployed.")}</p></div></header>
      {snapshot ? (
        <MfAgentWorkflow
          snapshot={snapshot}
          viewerRoleId={roleId}
          selectedWorkflowId={selectedWorkflowId}
          onSelectWorkflow={(workflowId) => setWorkflowSelection({ roleContextId: roleId, workflowId })}
          onAdvance={onAdvance}
          onOpenOutputs={() => onNavigate("artifacts")}
        />
      ) : <div className="mf-manager-loading" aria-busy="true" />}
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

export function ArtifactsView({ step, roleId, onNavigate, onOpenArtifact, artifactReviewStates }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const artifactAccess = deriveMfArtifactAccess(roleId);
  const visibleArtifacts = artifacts.filter((artifact) =>
    artifactAccess.canViewAll || artifactAccess.artifactIds.includes(artifact.id));
  const canViewBimScaffold = artifactAccess.canViewAll
    || artifactAccess.artifactIds.includes("bim-scaffold");
  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Trabalho produzido", "Work produced")}</span><h1>{l("O que os workflows entregam às equipes", "What workflows deliver to teams")}</h1><p>{l("Cada item abaixo é um rascunho, análise ou checklist criado para uma pessoa da MF revisar. Nada é emitido automaticamente.", "Each item below is a draft, analysis, or checklist created for an MF employee to review. Nothing is issued automatically.")}</p></div></header>

      <section className="mf-output-definition" data-guide-key="work-produced"><FileCheck2 size={20} /><div><strong>{l("“Trabalho produzido” significa uma saída verificável", "“Work produced” means a verifiable output")}</strong><p>{l("Ela mostra as fontes usadas, o que Urso fez, quem precisa revisar e qual decisão depende dela.", "It shows the sources used, what Urso did, who must review it, and which decision depends on it.")}</p></div></section>

      <section className="mf-output-list">
        {visibleArtifacts.map((artifact) => {
          const unlocked = step >= artifact.availableAt;
          const reviewState = artifactReviewStates[artifact.id] ?? (step >= 8 ? "approved" : step >= 7 ? "validated" : "draft");
          return <article key={artifact.id} className={unlocked ? "is-ready" : "is-locked"}><div className="mf-output-type">{unlocked ? <FileCheck2 size={18} /> : <LockKeyhole size={17} />}<span><small>{t(artifact.type)}</small><strong>{t(artifact.title)}</strong></span></div><div><small>{l("O que é", "What it is")}</small><p>{unlocked ? t(artifact.description) : l(`Disponível quando o workflow chegar à etapa ${artifact.availableAt}.`, `Available when the workflow reaches step ${artifact.availableAt}.`)}</p></div><div><small>{l("Por que importa", "Why it matters")}</small><p>{unlocked ? t(artifact.validation) : l("Ainda não foi gerado.", "It has not been generated yet.")}</p></div><div><small>{l("Quem revisa", "Who reviews")}</small><p>{t(artifact.discipline)}</p></div><div className="mf-output-action"><span className={`mf-simple-status is-${reviewState}`}>{!unlocked ? l("Bloqueado", "Locked") : reviewState === "approved" ? l("Aprovado", "Approved") : reviewState === "validated" ? l("Pronto para aprovar", "Ready to approve") : l("Rascunho", "Draft")}</span><button type="button" onClick={() => onOpenArtifact(artifact.id)} disabled={!unlocked}><Maximize2 size={14} /> {l("Abrir e revisar", "Open and review")}</button></div></article>;
        })}
      </section>

      {canViewBimScaffold ? <section className="mf-bim-output"><header><div><span className="mf-eyebrow">{l("Exemplo visual · workflow BIM", "Visual example · BIM workflow")}</span><h2>{l("Scaffold básico para iniciar coordenação", "Basic scaffold to start coordination")}</h2></div><span>{l("Rascunho · exige revisão BIM", "Draft · requires BIM review")}</span></header><BimScaffold active={step >= 6} /><footer><Box size={17} /><p>{l("Urso organiza geometria, conexões e áreas de interferência para a equipe começar. O Coordenador BIM decide o que entra no modelo oficial.", "Urso organizes geometry, connections, and clash areas so the team can begin. The BIM Coordinator decides what enters the official model.")}</p><button type="button" onClick={() => onNavigate("workflows")}>{l("Ver como o workflow funciona", "See how the workflow works")} <ArrowRight size={14} /></button></footer></section> : null}
    </div>
  );
}

export function BrainView({ step, roleId, onNavigate, sessionId, sessionToken }: ViewProps) {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  return (
    <div className="mf-clarity-view is-brain-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Urso Brain · verdade do projeto", "Urso Brain · project truth")}</span><h1>{l("Tudo que o projeto sabe, conectado e explicável", "Everything the project knows, connected and explainable")}</h1><p>{l("Explore relações, abra os documentos usados pelo sistema ou converse com o Brain no contexto do seu papel.", "Explore relationships, open the documents used by the system, or talk to the Brain in the context of your role.")}</p></div><button type="button" className="mf-secondary-action" onClick={() => onNavigate("audit")}>{l("Ver histórico de decisões", "View decision history")} <ArrowRight size={14} /></button></header>
      <ProjectBrainWorkspace step={step} roleId={roleId} sessionId={sessionId} sessionToken={sessionToken} />
    </div>
  );
}

export function AuditView({ step, roleId, onNavigate, artifactReviewStates, snapshot }: ViewProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const events = activityEvents.filter((event) => step >= event.availableAt).reverse();
  const artifactAccess = deriveMfArtifactAccess(roleId);
  const visibleArtifacts = artifacts.filter((artifact) =>
    artifactAccess.canViewAll || artifactAccess.artifactIds.includes(artifact.id));
  const approvedArtifacts = visibleArtifacts.flatMap((artifact) => {
    const workItems = snapshot?.workItems.filter((task) => task.artifactId === artifact.id) ?? [];
    if (artifactReviewStates[artifact.id] !== "approved"
      || workItems.length === 0
      || workItems.some((task) => task.state !== "complete")) return [];
    const workItem = [...workItems].sort((left, right) => right.completeAt - left.completeAt)[0];
    return [{ artifact, workItem }];
  });
  const transitionReceipts = snapshot?.receipts ?? [];
  const decisionApproved = snapshot?.decision.status === "approved";

  return (
    <div className="mf-clarity-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Decisões e histórico", "Decisions & history")}</span><h1>{l("Nada muda sem deixar uma explicação", "Nothing changes without leaving an explanation")}</h1><p>{l("Veja o que mudou, quem aprovou, quais fontes foram usadas e o que o sistema atualizou.", "See what changed, who approved it, which sources were used, and what the system updated.")}</p></div><button type="button" className="mf-secondary-action" onClick={() => onNavigate("brain")}>{l("Abrir relações no Brain", "Open relationships in the Brain")} <Network size={14} /></button></header>
      <section className="mf-audit-summary"><div><Clock3 size={18} /><span><small>{l("Workflow", "Workflow")}</small><strong>{mfScenarioManifest.workflow.id}</strong></span></div><div><UserCheck size={18} /><span><small>{l("Decisão humana", "Human decision")}</small><strong>{decisionApproved ? `${snapshot?.decision.id} · ${l("Aprovada", "Approved")}` : l("Aguardando", "Waiting")}</strong></span></div><div><ShieldCheck size={18} /><span><small>{l("Trabalho aprovado", "Approved work")}</small><strong>{approvedArtifacts.length} / {visibleArtifacts.length}</strong></span></div></section>

      <section className="mf-history-list">
        <header><span>{l("Horário", "Time")}</span><span>{l("Evidência canônica", "Canonical evidence")}</span><span>{l("Quem / sistema", "Who / system")}</span><span>{l("Recibo", "Receipt")}</span></header>
        {approvedArtifacts.map(({ artifact, workItem }) => <div key={`artifact-${artifact.id}`}><time>{l("Agora", "Now")}</time><span><strong>{t(artifact.title)}</strong><small>{l("Resultado aprovado e conectado ao Brain", "Approved result connected to the Brain")}</small></span><span>{t(artifact.discipline)}</span>{workItem.receiptId ? <code>{workItem.receiptId}</code> : <span className="mf-simple-status is-draft">{l("Recibo pendente", "Receipt pending")}</span>}</div>)}
        {transitionReceipts.map((receipt) => <div key={`transition-${receipt.id}`}><time>{l("Agora", "Now")}</time><span><strong>{l("Transição canônica do cenário", "Canonical scenario transition")} {receipt.fromStep} → {receipt.toStep}</strong><small>{receipt.action}</small></span><span>{receipt.actorRoleId}</span><code>{receipt.id}</code></div>)}
        {approvedArtifacts.length === 0 && transitionReceipts.length === 0 ? <div><time>—</time><span><strong>{l("Nenhum recibo canônico registrado", "No canonical receipt recorded")}</strong><small>{l("A trilha permanece sem evidência emitida.", "The trail remains without issued evidence.")}</small></span><span>Urso Harness</span><span className="mf-simple-status is-draft">{l("Recibo pendente", "Receipt pending")}</span></div> : null}
      </section>

      <section className="mf-history-list">
        <header><span>{l("Horário", "Time")}</span><span>{l("Atividade do cenário", "Scenario activity")}</span><span>{l("Quem / sistema", "Who / system")}</span><span>{l("Evidência", "Evidence")}</span></header>
        {events.map((event) => <div key={`event-${event.id}`}><time>{event.time}</time><span><strong>{t(event.title)}</strong><small>{t(event.detail)}</small></span><span>{event.id === "approved" ? l("Gerente do Projeto", "Project Manager") : "Urso Harness"}</span><span className="mf-simple-status is-draft">{l("Recibo indisponível", "Receipt unavailable")}</span></div>)}
      </section>
    </div>
  );
}

export function EmptyScenarioView({ onNavigate }: { onNavigate: (view: DemoView) => void }) {
  return <div className="mf-empty-view"><CircleDashed size={32} /><h1>Esta área entra na próxima etapa.</h1><p>Volte para a visão do projeto para continuar o cenário.</p><button type="button" className="mf-primary-action" onClick={() => onNavigate("control")}>Abrir projeto hoje</button></div>;
}
