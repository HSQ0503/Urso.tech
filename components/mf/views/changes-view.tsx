"use client";

import { useState } from "react";
import {
  AtSign,
  ArrowRight,
  Bell,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  FileSearch,
  FileText,
  GitCompareArrows,
  Hash,
  Headphones,
  Home,
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
} from "lucide-react";
import { mfScenarioManifest } from "@/lib/mf-demo/manifest.mjs";
import { useMfLanguage } from "../mf-language";
import {
  ConnectedSourcesPanel,
  ControlledChangePanel,
} from "../mf-story-panels";
import type { ViewProps } from "./view-props";

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

