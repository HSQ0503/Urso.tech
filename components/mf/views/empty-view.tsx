"use client";

import { CircleDashed } from "lucide-react";
import type { DemoView } from "@/lib/mf-demo/types";

export function EmptyScenarioView({ onNavigate }: { onNavigate: (view: DemoView) => void }) {
  return <div className="mf-empty-view"><CircleDashed size={32} /><h1>Esta área entra na próxima etapa.</h1><p>Volte para a visão do projeto para continuar o cenário.</p><button type="button" className="mf-primary-action" onClick={() => onNavigate("control")}>Abrir projeto hoje</button></div>;
}

