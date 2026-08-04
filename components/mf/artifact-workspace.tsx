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
  ShieldCheck,
  X,
} from "lucide-react";
import type { Artifact, ArtifactReviewState, MfWorkState } from "@/lib/mf-demo/types";
import { mfScenarioManifest } from "@/lib/mf-demo/manifest.mjs";
import { useMfLanguage } from "./mf-language";

type ArtifactWorkspaceProps = {
  artifact: Artifact;
  reviewState: ArtifactReviewState;
  receiptId: string | null;
  managerConfirmationState: MfWorkState | null;
  managerConfirmationReceiptId: string | null;
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
        <div className="mf-document-row"><strong>{t("Carga instalada")}</strong><span>{mfScenarioManifest.revisions.B.electricalKw} kW</span><span>{mfScenarioManifest.revisions.C.electricalKw} kW</span><em>+15%</em></div>
        <div className="mf-document-row"><strong>{t("Água gelada")}</strong><span>{mfScenarioManifest.revisions.B.chilledWaterKw} kW</span><span>{mfScenarioManifest.revisions.C.chilledWaterKw} kW</span><em>+18%</em></div>
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
        <code>{electrical ? `P = ${mfScenarioManifest.revisions.C.electricalKw} kW · fp = 0,92 · V = 380 V` : `Q = ${mfScenarioManifest.revisions.C.chilledWaterKw} kW · ΔT = 5 °C`}</code>
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
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const recoveredDays = mfScenarioManifest.outcome.recoveredDays;
  const exposureDays = mfScenarioManifest.outcome.exposureDays;
  const recoveredDaysLabel = `${recoveredDays} ${l("dias", "days")}`;
  const exposureDaysLabel = `${exposureDays} ${l("dias", "days")}`;
  const recoveryNote = l(
    `Cenário B protege as aprovações técnicas e recupera ${recoveredDays} dias.`,
    `Scenario B protects technical approvals and recovers ${recoveredDays} days.`,
  );
  return (
    <div className="mf-scenario-preview">
      <div className="mf-scenario-row is-header"><span>{t("Cenário")}</span><span>{t("Recuperação")}</span><span>{t("Risco técnico")}</span><span>{t("Decisão")}</span></div>
      <div className="mf-scenario-row"><strong>{t("A · absorver atraso")}</strong><span>0 {t("dias")}</span><span className="is-critical">{t("Alto")}</span><span>{t("Rejeitar")}</span></div>
      <div className="mf-scenario-row is-selected"><strong>{t("B · revisão paralela")}</strong><span>{recoveredDaysLabel}</span><span className="is-positive">{t("Controlado")}</span><span>{t("Recomendado")}</span></div>
      <div className="mf-scenario-row"><strong>{t("C · compressão total")}</strong><span>{exposureDaysLabel}</span><span className="is-warning">{t("Elevado")}</span><span>{t("Reserva")}</span></div>
      <div className="mf-scenario-note">
        <ShieldCheck size={15} /> {recoveryNote}
      </div>
    </div>
  );
}

function ChecklistPreview({
  artifact,
  reviewState,
  receiptId,
  managerConfirmationState,
  managerConfirmationReceiptId,
}: {
  artifact: Artifact;
  reviewState: ArtifactReviewState;
  receiptId: string | null;
  managerConfirmationState: MfWorkState | null;
  managerConfirmationReceiptId: string | null;
}) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const evidenceApproved = reviewState === "approved" && Boolean(receiptId);
  const evidenceReceiptUnavailable = reviewState === "approved" && !receiptId;
  const evidenceDetail = evidenceApproved
    ? l(`Verificado · ${receiptId}`, `Verified · ${receiptId}`)
    : evidenceReceiptUnavailable
      ? l("Aprovação registrada · recibo indisponível", "Approval recorded · Receipt unavailable")
      : reviewState === "validated"
        ? l("Validado · aguardando aprovação controlada", "Validated · awaiting controlled approval")
        : l("Aguardando verificação · recibo pendente", "Awaiting verification · Receipt pending");
  const evidenceCompletionLabel = evidenceApproved
    ? l("Concluído", "Complete")
    : evidenceReceiptUnavailable
      ? l("Aguardando recibo", "Awaiting receipt")
      : reviewState === "validated"
        ? l("Aguardando aprovação", "Awaiting approval")
        : l("Pendente", "Pending");
  const managerConfirmed = managerConfirmationState === "complete" && Boolean(managerConfirmationReceiptId);
  const managerReceiptUnavailable = managerConfirmationState === "complete" && !managerConfirmationReceiptId;
  const confirmationDetail = managerConfirmed
    ? l(`Verificada · ${managerConfirmationReceiptId}`, `Verified · ${managerConfirmationReceiptId}`)
    : managerReceiptUnavailable
      ? l("Confirmação não verificável · recibo indisponível", "Confirmation unverifiable · Receipt unavailable")
      : l("Aguardando confirmação do Gerente do Projeto · recibo pendente", "Awaiting Project Manager confirmation · Receipt pending");
  const managerCompletionLabel = managerConfirmed
    ? l("Concluído", "Complete")
    : managerReceiptUnavailable
      ? l("Aguardando recibo", "Awaiting receipt")
      : l("Pendente", "Pending");
  return (
    <div className="mf-checklist-preview">
      {artifact.findings.map((finding) => (
        <div key={finding}>
          <span>{evidenceApproved ? <Check size={14} /> : <CircleDashed size={14} />}</span>
          <p><strong>{t(finding)}</strong><small>{evidenceDetail}</small></p>
          <em className={evidenceApproved ? undefined : "is-pending"}>{evidenceCompletionLabel}</em>
        </div>
      ))}
      <div>
        <span>{managerConfirmed ? <Check size={14} /> : <CircleDashed size={14} />}</span>
        <p><strong>{t("Confirmação do Gerente do Projeto")}</strong><small>{confirmationDetail}</small></p>
        <em className={managerConfirmed ? undefined : "is-pending"}>{managerCompletionLabel}</em>
      </div>
    </div>
  );
}

function TeamsPreview({ reviewState, receiptId }: {
  reviewState: ArtifactReviewState;
  receiptId: string | null;
}) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  const approved = reviewState === "approved" && Boolean(receiptId);
  const receiptUnavailable = reviewState === "approved" && !receiptId;
  const status = approved
    ? l("Aprovado · pronto para publicação controlada", "Approved · ready for controlled publication")
    : receiptUnavailable
      ? l("Aprovação registrada · recibo indisponível", "Approval recorded · Receipt unavailable")
      : reviewState === "validated"
        ? l("Validado · aguardando aprovação controlada", "Validated · awaiting controlled approval")
        : l("Rascunho · não publicado", "Draft · not published");
  const headline = approved
    ? l("Revisão C aprovada e plano coordenado", "Revision C approved and coordinated plan")
    : receiptUnavailable
      ? l("Aprovação aguarda o recibo canônico", "Approval awaits the canonical receipt")
      : reviewState === "validated"
        ? l("Plano coordenado validado e aguardando aprovação", "Coordinated plan validated and awaiting approval")
        : l("Proposta de coordenação da Revisão C", "Proposed Revision C coordination");
  return (
    <div className="mf-teams-preview">
      <div><span>T</span><p><strong>{t("Projeto / Coordenação Geral")}</strong><small>{status}{approved ? ` · ${receiptId}` : ""}</small></p></div>
      <p>
        <strong>{headline}</strong><br />
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

function ArtifactPreview({
  artifact,
  reviewState,
  receiptId,
  managerConfirmationState,
  managerConfirmationReceiptId,
}: {
  artifact: Artifact;
  reviewState: ArtifactReviewState;
  receiptId: string | null;
  managerConfirmationState: MfWorkState | null;
  managerConfirmationReceiptId: string | null;
}) {
  if (artifact.id === "revision-comparison") return <RevisionPreview />;
  if (artifact.id === "electrical-package" || artifact.id === "hvac-package") return <CalculationPreview artifact={artifact} />;
  if (artifact.id === "bim-scaffold") return <BimPreview />;
  if (artifact.id === "recovery-plan") return <RecoveryPreview />;
  if (artifact.id === "gate-checklist") return <ChecklistPreview artifact={artifact} reviewState={reviewState} receiptId={receiptId} managerConfirmationState={managerConfirmationState} managerConfirmationReceiptId={managerConfirmationReceiptId} />;
  if (artifact.id === "teams-update") return <TeamsPreview reviewState={reviewState} receiptId={receiptId} />;
  return <ImpactPreview artifact={artifact} />;
}

export function ArtifactWorkspace({ artifact, reviewState, receiptId, managerConfirmationState, managerConfirmationReceiptId, onClose }: ArtifactWorkspaceProps) {
  const { language, t } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
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
              <strong>{mfScenarioManifest.workflow.id}</strong>
              <small>{t("Execução isolada · demo")}</small>
            </div>
          </aside>

          <main className="mf-workbench-output">
            <div className="mf-workbench-output-header">
              <div><span className="mf-eyebrow">{t("Trabalho produzido")}</span><h3>{t("Prévia do resultado")}</h3></div>
              <span>Rev. {reviewState === "approved" ? "1" : "D1"}</span>
            </div>
            <ArtifactPreview artifact={artifact} reviewState={reviewState} receiptId={receiptId} managerConfirmationState={managerConfirmationState} managerConfirmationReceiptId={managerConfirmationReceiptId} />
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
              {reviewState === "approved" && receiptId ? (
                <div className="mf-approval-receipt">
                  <ShieldCheck size={19} />
                  <span><strong>{l("Aprovação registrada", "Approval recorded")}</strong><small>{receiptId}</small></span>
                </div>
              ) : reviewState === "approved" ? (
                <div className="mf-approval-receipt is-pending">
                  <CircleDashed size={19} />
                  <span><strong>{l("Recibo de aprovação indisponível", "Approval receipt unavailable")}</strong><small>{l("Recibo indisponível", "Receipt unavailable")}</small></span>
                </div>
              ) : (
                <div className="mf-approval-receipt is-pending">
                  <ArrowRight size={19} />
                  <span><strong>{l("Continuar no sistema conectado", "Continue in connected system")}</strong><small>{l("Recibo pendente · use os controles do apresentador para avançar a demonstração.", "Receipt pending · use presenter controls to advance the demonstration.")}</small></span>
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
