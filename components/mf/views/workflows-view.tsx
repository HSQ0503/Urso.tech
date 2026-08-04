"use client";

import { useState } from "react";
import { mfScenarioManifest } from "@/lib/mf-demo/manifest.mjs";
import { MfAgentWorkflow } from "../mf-agent-workflow";
import { useMfLanguage } from "../mf-language";
import type { ViewProps } from "./view-props";

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
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Fluxos de projeto", "Project workflows")}</span><h1>{l("Revise fontes, etapas e aprovações antes da execução.", "Review sources, steps, and approvals before execution.")}</h1><p>{l("Cada fluxo identifica as entradas, a análise autorizada, o ponto de aprovação e os registros emitidos.", "Each workflow identifies its inputs, authorized analysis, approval point, and issued records.")}</p></div></header>
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

