"use client";

import { ChangesView } from "../views/changes-view";
import { useMfRouteViewProps } from "./use-mf-route-props";

export function MfChangesRoute() {
  return <ChangesView {...useMfRouteViewProps()} />;
}
