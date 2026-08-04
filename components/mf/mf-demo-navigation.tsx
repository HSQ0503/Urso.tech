"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DemoView } from "@/lib/mf-demo/types";

type MfDemoNavigationContextValue = {
  navigate: (view: DemoView) => void;
  advance: () => Promise<void>;
};

const MfDemoNavigationContext = createContext<MfDemoNavigationContextValue | null>(null);

export function MfDemoNavigationProvider(props: MfDemoNavigationContextValue & { children: ReactNode }) {
  const { children, navigate, advance } = props;
  return (
    <MfDemoNavigationContext.Provider value={{ navigate, advance }}>
      {children}
    </MfDemoNavigationContext.Provider>
  );
}

export function useMfDemoNavigation() {
  const context = useContext(MfDemoNavigationContext);
  if (!context) throw new Error("useMfDemoNavigation must be used inside MfDemoNavigationProvider.");
  return context;
}
