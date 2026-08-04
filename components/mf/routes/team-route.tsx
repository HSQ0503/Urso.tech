"use client";

import { DisciplinesView } from "../views/team-view";
import { useMfRouteViewProps } from "./use-mf-route-props";

export function MfTeamRoute() {
  return <DisciplinesView {...useMfRouteViewProps()} />;
}
