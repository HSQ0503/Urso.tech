"use client";

import type { ViewProps } from "../views/view-props";
import { useMfDemoNavigation } from "../mf-demo-navigation";
import { useMfDemoSession } from "../mf-demo-session";

export function useMfRouteViewProps(): ViewProps {
  const navigation = useMfDemoNavigation();
  const {
    sessionCredentials,
    step,
    roleId,
    snapshot,
    artifactReviewStates,
    openArtifact,
  } = useMfDemoSession();

  return {
    step,
    roleId,
    snapshot,
    artifactReviewStates,
    onNavigate: navigation.navigate,
    onAdvance: () => void navigation.advance(),
    onOpenArtifact: openArtifact,
    sessionId: sessionCredentials?.sessionId,
    sessionToken: sessionCredentials?.token,
  };
}
