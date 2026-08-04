"use client";

import { WorkflowsView } from "../views/workflows-view";
import { useMfRouteViewProps } from "./use-mf-route-props";

export function MfWorkflowsRoute() {
  return <WorkflowsView {...useMfRouteViewProps()} />;
}
