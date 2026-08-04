"use client";

import { BrainView } from "../views/brain-view";
import { useMfDemoSession } from "../mf-demo-session";
import { useMfLanguage } from "../mf-language";
import { useMfRouteViewProps } from "./use-mf-route-props";

export function MfBrainRoute() {
  const props = useMfRouteViewProps();
  const { sessionCredentials, sessionHydrating, transitionError, retrySession } = useMfDemoSession();
  const { language } = useMfLanguage();

  if (sessionHydrating) {
    return <div className="mf-clarity-view mf-manager-loading" aria-busy="true" />;
  }

  if (!sessionCredentials) {
    return (
      <section className="mf-clarity-view mf-manager-session-unavailable" role="alert">
        <span>MF BRAIN / SESSION</span>
        <h1>{language === "pt" ? "O Cérebro do Projeto está temporariamente indisponível." : "Project Brain is temporarily unavailable."}</h1>
        <p>{transitionError ?? (language === "pt" ? "A sessão da demonstração não pôde ser criada." : "The demo session could not be created.")}</p>
        <button type="button" onClick={retrySession}>{language === "pt" ? "Tentar novamente" : "Retry session"}</button>
      </section>
    );
  }

  return <BrainView {...props} sessionId={sessionCredentials.sessionId} sessionToken={sessionCredentials.token} />;
}
