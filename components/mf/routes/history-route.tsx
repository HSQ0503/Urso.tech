"use client";

import { AuditView } from "../views/history-view";
import { useMfRouteViewProps } from "./use-mf-route-props";

export function MfHistoryRoute() {
  return <AuditView {...useMfRouteViewProps()} />;
}
