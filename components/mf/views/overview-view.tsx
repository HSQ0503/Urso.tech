"use client";

import { ProjectTodayDashboard } from "../project-today/project-today-dashboard";
import {
  OutcomeComparisonPanel,
  PilotProposalPanel,
} from "../mf-story-panels";
import type { ViewProps } from "./view-props";

export function ControlTowerView({ step, roleId, onNavigate, onAdvance, snapshot }: ViewProps) {
  if (!snapshot) return <div className="mf-clarity-view mf-manager-loading" aria-busy="true" />;
  return (
    <div className="mf-clarity-view">
      <ProjectTodayDashboard
        snapshot={snapshot}
        roleId={roleId}
        onAdvance={onAdvance}
        onNavigate={onNavigate}
      />
      {step >= 8 ? <><OutcomeComparisonPanel snapshot={snapshot} /><PilotProposalPanel /></> : null}
    </div>
  );
}
