"use client";

import { ArrowRight, Workflow } from "lucide-react";
import { roles } from "@/lib/mf-demo/fixtures";
import { useMfLanguage } from "../mf-language";
import { MfTeamCommand } from "../mf-team-command";
import type { ViewProps } from "./view-props";

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

