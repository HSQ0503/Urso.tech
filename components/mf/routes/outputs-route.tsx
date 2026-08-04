"use client";

import { ArtifactsView } from "../views/outputs-view";
import { useMfRouteViewProps } from "./use-mf-route-props";

export function MfOutputsRoute() {
  return <ArtifactsView {...useMfRouteViewProps()} />;
}
