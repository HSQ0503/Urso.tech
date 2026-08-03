import { disciplines } from "./fixtures";

export { scenarioStates } from "./types";

export const scenarioLabels = [
  "Baseline aprovado",
  "Evento detectado",
  "Aguardando aprovação",
  "Mudança aprovada",
  "Impacto mapeado",
  "Pacotes prontos",
  "Execução em andamento",
  "Revisões concluídas",
  "Marco pronto",
] as const;

export const nextActionLabels = [
  "Receber Revisão C",
  "Comparar revisões",
  "Aprovar mudança",
  "Mapear impacto",
  "Gerar pacotes de trabalho",
  "Executar ferramentas",
  "Concluir revisões humanas",
  "Liberar marco executivo",
  "Demonstração concluída",
] as const;

export function projectRisk(step: number) {
  if (step === 0) return { label: "Baixo", tone: "positive" as const, detail: "Baseline coordenada" };
  if (step < 3) return { label: "Em análise", tone: "warning" as const, detail: "Mudança não aprovada" };
  if (step < 7) return { label: "Alto", tone: "critical" as const, detail: "Gate executivo ameaçado" };
  if (step < 8) return { label: "Observação", tone: "warning" as const, detail: "Fechamento em verificação" };
  return { label: "Controlado", tone: "positive" as const, detail: "Evidências completas" };
}

export function impactedDisciplineCount(step: number) {
  if (step < 4) return 0;
  return disciplines.filter((discipline) => discipline.impact !== "none").length;
}

export function milestoneReadiness(step: number) {
  const readiness = [84, 78, 72, 59, 46, 55, 68, 91, 100];
  return readiness[Math.min(step, readiness.length - 1)];
}

export function milestoneDays(step: number) {
  if (step < 3) return 14;
  if (step < 6) return 4;
  if (step < 8) return 11;
  return 14;
}
