"use client";

import { ArrowRight } from "lucide-react";
import { useMfLanguage } from "../mf-language";
import { ProjectBrainWorkspace } from "../project-brain-workspace";
import type { ViewProps } from "./view-props";

export function BrainView({ step, roleId, onNavigate, sessionId, sessionToken }: ViewProps) {
  const { language } = useMfLanguage();
  const l = (pt: string, en: string) => (language === "pt" ? pt : en);
  return (
    <div className="mf-clarity-view is-brain-view">
      <header className="mf-today-header"><div><span className="mf-eyebrow">{l("Urso Brain · registros do projeto", "Urso Brain · project records")}</span><h1>{l("Documentos, decisões e dependências em um único mapa.", "Documents, decisions, and dependencies in one map.")}</h1><p>{l("Inspecione as relações, abra os registros de origem ou consulte o Brain dentro das permissões da sua função.", "Inspect relationships, open source records, or query the Brain within your role permissions.")}</p></div><button type="button" className="mf-secondary-action" onClick={() => onNavigate("audit")}>{l("Ver histórico de decisões", "View decision history")} <ArrowRight size={14} /></button></header>
      <ProjectBrainWorkspace step={step} roleId={roleId} sessionId={sessionId} sessionToken={sessionToken} />
    </div>
  );
}

