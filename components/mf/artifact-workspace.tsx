"use client";

import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  FileText,
  GitCompareArrows,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import type { Artifact, ArtifactReviewState } from "@/lib/mf-demo/types";
import { useMfLanguage } from "./mf-language";

type ArtifactWorkspaceProps = {
  artifact: Artifact;
  reviewState: ArtifactReviewState;
  onReviewStateChange: (state: ArtifactReviewState) => void;
  onClose: () => void;
};

const stateLabels: Record<ArtifactReviewState, string> = {
  draft: "Rascunho gerado",
  validated: "Validado · aguarda responsável",
  approved: "Aprovado para o projeto",
};

function RevisionPreview() {
  const { t } = useMfLanguage();
  return (
    <div className="mf-document-preview">
      <div className="mf-document-title">
        <GitCompareArrows size={17} />
        <span>
          <strong>Filling Line Data Sheet</strong>
          <small>{t("Comparação semântica · B → C")}</small>
        </span>
      </div>
      <div className="mf-document-table">
        <div className="mf-document-row is-header"><span>{t("Campo")}</span><span>Rev. B</span><span>Rev. C</span><span>Delta</span></div>
        <div className="mf-document-row"><strong>{t("Comprimento")}</strong><span>18,4 m</span><span>19,6 m</span><em>+1,2 m</em></div>
        <div className="mf-document-row"><strong>{t("Carga instalada")}</strong><span>640 kW</span><span>736 kW</span><em>+15%</em></div>
        <div className="mf-document-row"><strong>{t("Água gelada")}</strong><span>420 kW</span><span>496 kW</span><em>+18%</em></div>
        <div className="mf-document-row"><strong>{t("Entrega")}</strong><span>D+0</span><span>D+10</span><em>+10 {t("dias")}</em></div>
      </div>
      <div className="mf-document-callout">
        <ShieldCheck size={15} /> {t("Quatro mudanças materiais reconciliadas com as seções de origem.")}
      </div>
    </div>
  );
}

function CalculationPreview({ artifact }: { artifact: Artifact }) {
  const { t } = useMfLanguage();
  const electrical = artifact.id === "electrical-package";
  return (
    <div className="mf-calculation-preview">
      <div className="mf-calculation-heading">
        <span>{electrical ? "ELE-CALC-08" : "HVA-CALC-06"}</span>
        <strong>{electrical ? t("Revisão de alimentador") : t("Balanço de água gelada")}</strong>
      </div>
      <div className="mf-formula-block">
        <span>{t("ENTRADA APROVADA")}</span>
        <code>{electrical ? t("P = 736 kW · fp = 0,92 · V = 380 V") : "Q = 496 kW · ΔT = 5 °C"}</code>
      </div>
      <div className="mf-calculation-results">
        {artifact.findings.map((finding, index) => (
          <div key={finding}>
            <span>0{index + 1}</span>
            <strong>{t(finding)}</strong>
            <CheckCircle2 size={14} />
          </div>
        ))}
      </div>
      <p>
        {t("Resultado produzido em ambiente isolado. O responsável técnico deve verificar premissas e selecionar a solução final.")}
      </p>
    </div>
  );
}

function BimPreview() {
  const { t } = useMfLanguage();
  return (
    <div className="mf-workbench-bim">
      <svg viewBox="0 0 660 390" role="img" aria-labelledby="workbench-bim-title">
        <title id="workbench-bim-title">Scaffold BIM da linha revisada</title>
        <defs>
          <pattern id="workbench-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="rgba(255,255,255,.07)" />
          </pattern>
        </defs>
        <rect width="660" height="390" fill="url(#workbench-grid)" />
        <path d="M68 278 288 148l296 74-222 130Z" fill="rgba(255,255,255,.025)" stroke="#3f4d4e" />
        <path d="M176 267 325 180l156 40-150 87Z" fill="none" stroke="#69727d" strokeDasharray="7 6" />
        <path d="M155 258 335 152l186 47-181 106Z" fill="rgba(255,255,255,.18)" stroke="#fff" strokeWidth="2" />
        <path d="M155 258v-58l180-106 186 47v58M335 94v58" fill="none" stroke="#fff" />
        <circle cx="335" cy="258" r="8" fill="#f2b84b" />
        <circle cx="496" cy="165" r="8" fill="#ef6262" />
        <path d="M335 258 268 348M496 165l65-82" stroke="#7f8a8b" strokeDasharray="4 4" />
        <text x="206" y="368" fill="#f2cf84" fontSize="12">CHW · revisar conexão</text>
        <text x="512" y="76" fill="#ef9090" fontSize="12">CLASH-02</text>
      </svg>
      <span>{t("Scaffold conceitual · não construtivo")}</span>
    </div>
  );
}

function RecoveryPreview() {
  const { t } = useMfLanguage();
  return (
    <div className="mf-scenario-preview">
      <div className="mf-scenario-row is-header"><span>{t("Cenário")}</span><span>{t("Recuperação")}</span><span>{t("Risco técnico")}</span><span>{t("Decisão")}</span></div>
      <div className="mf-scenario-row"><strong>{t("A · absorver atraso")}</strong><span>0 {t("dias")}</span><span className="is-critical">{t("Alto")}</span><span>{t("Rejeitar")}</span></div>
      <div className="mf-scenario-row is-selected"><strong>{t("B · revisão paralela")}</strong><span>7 {t("dias")}</span><span className="is-positive">{t("Controlado")}</span><span>{t("Recomendado")}</span></div>
      <div className="mf-scenario-row"><strong>{t("C · compressão total")}</strong><span>10 {t("dias")}</span><span className="is-warning">{t("Elevado")}</span><span>{t("Reserva")}</span></div>
      <div className="mf-scenario-note">
        <ShieldCheck size={15} /> {t("Cenário B protege as aprovações técnicas e recupera 70% do impacto.")}
      </div>
    </div>
  );
}

function ChecklistPreview({ artifact }: { artifact: Artifact }) {
  const { t } = useMfLanguage();
  return (
    <div className="mf-checklist-preview">
      {artifact.findings.map((finding, index) => (
        <div key={finding}>
          <span><Check size={14} /></span>
          <p><strong>{t(finding)}</strong><small>{t("Recebido")} · RCPT-{52 + index}</small></p>
          <em>{t("Conforme")}</em>
        </div>
      ))}
      <div>
        <span><CircleDashed size={14} /></span>
        <p><strong>{t("Confirmação do Gerente do Projeto")}</strong><small>{t("Etapa final do gate")}</small></p>
        <em className="is-pending">{t("Pendente")}</em>
      </div>
    </div>
  );
}

function TeamsPreview() {
  const { t } = useMfLanguage();
  return (
    <div className="mf-teams-preview">
      <div><span>T</span><p><strong>{t("Projeto / Coordenação Geral")}</strong><small>{t("Rascunho · não publicado")}</small></p></div>
      <p>
        <strong>{t("Revisão C aprovada e plano coordenado")}</strong><br />
        {t("A DEC-042 substitui a Rev. B. Dez disciplinas receberam ações; Elétrica, HVAC, BIM, Estruturas de Concreto e Planejamento estão no caminho crítico. Consulte os pacotes vinculados antes de emitir novos documentos.")}
      </p>
      <ul>
        <li>#CHG-024 · Plano de impacto</li>
        <li>#WF-REV-C-001 · Status do harness</li>
        <li>#EXE-02 · Gate executivo</li>
      </ul>
    </div>
  );
}

function ImpactPreview({ artifact }: { artifact: Artifact }) {
  const { t } = useMfLanguage();
  return (
    <div className="mf-impact-preview">
      <div><strong>5</strong><span>{t("Ações críticas")}</span></div>
      <div><strong>3</strong><span>{t("Revisões")}</span></div>
      <div><strong>2</strong><span>{t("Verificações")}</span></div>
      <div><strong>5</strong><span>{t("Sem impacto")}</span></div>
      <section>
        {artifact.actions.map((action, index) => (
          <p key={action}><span>0{index + 1}</span><strong>{t(action)}</strong><small>{t("Owner e critério vinculados")}</small></p>
        ))}
      </section>
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  if (artifact.id === "revision-comparison") return <RevisionPreview />;
  if (artifact.id === "electrical-package" || artifact.id === "hvac-package") return <CalculationPreview artifact={artifact} />;
  if (artifact.id === "bim-scaffold") return <BimPreview />;
  if (artifact.id === "recovery-plan") return <RecoveryPreview />;
  if (artifact.id === "gate-checklist") return <ChecklistPreview artifact={artifact} />;
  if (artifact.id === "teams-update") return <TeamsPreview />;
  return <ImpactPreview artifact={artifact} />;
}

export function ArtifactWorkspace({ artifact, reviewState, onReviewStateChange, onClose }: ArtifactWorkspaceProps) {
  const { t } = useMfLanguage();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="mf-workbench-layer" role="dialog" aria-modal="true" aria-labelledby="mf-workbench-title">
      <button type="button" className="mf-workbench-scrim" aria-label={t("Fechar resultado")} onClick={onClose} />
      <section className="mf-workbench">
        <header>
          <div>
            <span className="mf-workbench-file-icon"><FileText size={18} /></span>
            <div>
              <span className="mf-eyebrow">{t(artifact.type)} · {t(artifact.discipline)}</span>
              <h2 id="mf-workbench-title" ref={headingRef} tabIndex={-1}>{t(artifact.title)}</h2>
            </div>
          </div>
          <div>
            <span className={`mf-status-pill is-${reviewState === "approved" ? "positive" : reviewState === "validated" ? "warning" : "cyan"}`}>
              {t(stateLabels[reviewState])}
            </span>
            <button type="button" aria-label={t("Fechar resultado")} onClick={onClose}><X size={19} /></button>
          </div>
        </header>

        <div className="mf-workbench-grid">
          <aside className="mf-workbench-evidence">
            <span className="mf-eyebrow">{t("Contexto autorizado")}</span>
            <h3>{t("Fontes carregadas")}</h3>
            <ul>
              {artifact.sources.map((source) => (
                <li key={source}><FileCheck2 size={14} /><span><strong>{t(source)}</strong><small>{t("Vigente · hash verificado")}</small></span></li>
              ))}
            </ul>
            <div className="mf-workbench-method">
              <span>{t("Procedimento")}</span>
              <strong>artifact-review@1.4</strong>
              <small>{t("Execução isolada · demo")}</small>
            </div>
          </aside>

          <main className="mf-workbench-output">
            <div className="mf-workbench-output-header">
              <div><span className="mf-eyebrow">{t("Trabalho produzido")}</span><h3>{t("Prévia do resultado")}</h3></div>
              <span>Rev. {reviewState === "approved" ? "1" : "D1"}</span>
            </div>
            <ArtifactPreview artifact={artifact} />
          </main>

          <aside className="mf-workbench-review">
            <span className="mf-eyebrow">{t("Harness + governança")}</span>
            <h3>{t("Revisão técnica")}</h3>
            <ol>
              <li className="is-done"><span><Check size={13} /></span><p><strong>{t("Fontes autorizadas")}</strong><small>{artifact.sources.length} {t("entradas verificadas")}</small></p></li>
              <li className="is-done"><span><Bot size={13} /></span><p><strong>{t("Rascunho produzido")}</strong><small>{t("Ferramenta isolada concluída")}</small></p></li>
              <li className={reviewState !== "draft" ? "is-done" : ""}><span>{reviewState !== "draft" ? <Check size={13} /> : "03"}</span><p><strong>{t("Validadores")}</strong><small>{t(artifact.validation)}</small></p></li>
              <li className={reviewState === "approved" ? "is-done" : ""}><span>{reviewState === "approved" ? <Check size={13} /> : "04"}</span><p><strong>{t("Aprovação humana")}</strong><small>{t(artifact.owner)}</small></p></li>
            </ol>

            <div className="mf-review-actions">
              {reviewState === "draft" ? (
                <button type="button" className="mf-primary-action" onClick={() => onReviewStateChange("validated")}>
                  <Bot size={15} /> {t("Executar validadores")}
                </button>
              ) : reviewState === "validated" ? (
                <>
                  <button type="button" className="mf-primary-action" onClick={() => onReviewStateChange("approved")}>
                    <UserCheck size={15} /> {t("Aprovar rascunho")}
                  </button>
                  <button type="button" className="mf-secondary-action" onClick={() => onReviewStateChange("draft")}>
                    <RotateCcw size={14} /> {t("Solicitar correção")}
                  </button>
                </>
              ) : (
                <div className="mf-approval-receipt">
                  <ShieldCheck size={19} />
                  <span><strong>{t("Aprovação registrada")}</strong><small>RCPT-ART-{artifact.id.slice(0, 3).toUpperCase()}-01</small></span>
                </div>
              )}
            </div>

            <div className="mf-next-action">
              <span>{t("Próxima ação")}</span>
              <strong>{reviewState === "approved" ? t("Atualizar o Brain e equipes dependentes") : t(artifact.actions[0])}</strong>
              <ArrowRight size={14} />
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
