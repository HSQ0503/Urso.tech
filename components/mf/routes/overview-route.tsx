"use client";

import { ControlTowerView } from "../views/overview-view";
import { useMfRouteViewProps } from "./use-mf-route-props";

export function MfOverviewRoute() {
  return <ControlTowerView {...useMfRouteViewProps()} />;
}
