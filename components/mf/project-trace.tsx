import {
  Boxes,
  CheckCircle2,
  FileInput,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { useMfLanguage } from "./mf-language";

type ProjectTraceProps = {
  step: number;
};

const traceNodes = [
  {
    label: "Evidência",
    detail: "Teams · Rev. C",
    activeAt: 1,
    icon: FileInput,
  },
  {
    label: "Verdade do projeto",
    detail: "Decisão DEC-042",
    activeAt: 3,
    icon: ShieldCheck,
  },
  {
    label: "Dependências",
    detail: "15 disciplinas",
    activeAt: 4,
    icon: GitBranch,
  },
  {
    label: "Execução",
    detail: "Pacotes + ferramentas",
    activeAt: 5,
    icon: Boxes,
  },
  {
    label: "Liberação",
    detail: "Gate EXE-02",
    activeAt: 8,
    icon: CheckCircle2,
  },
] as const;

export function ProjectTrace({ step }: ProjectTraceProps) {
  const { t } = useMfLanguage();
  return (
    <section className="mf-trace" aria-labelledby="project-trace-title">
      <div className="mf-section-heading">
        <div>
          <span className="mf-eyebrow">{t("Fluxo vivo do projeto")}</span>
          <h2 id="project-trace-title">{t("Da mudança à liberação")}</h2>
        </div>
        <span className="mf-live-label">
          <span aria-hidden="true" />
          {step === 0 ? t("Monitorando") : step === 8 ? t("Fechado") : t("Processando")}
        </span>
      </div>

      <div className="mf-trace-grid" role="list" aria-label={t("Etapas da mudança")}>
        {traceNodes.map((node, index) => {
          const active = step >= node.activeAt;
          const Icon = node.icon;
          return (
            <div className="mf-trace-segment" key={node.label} role="listitem">
              {index > 0 ? (
                <span
                  className={`mf-trace-connector ${active ? "is-active" : ""}`}
                  aria-hidden="true"
                >
                  <span />
                </span>
              ) : null}
              <div className={`mf-trace-node ${active ? "is-active" : ""}`}>
                <span className="mf-trace-icon">
                  <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                </span>
                <span>
                  <strong>{t(node.label)}</strong>
                  <small>{active ? t(node.detail) : t("Aguardando")}</small>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`mf-trace-impact ${step >= 4 ? "is-visible" : ""}`}>
        <span className="mf-trace-drop" aria-hidden="true" />
        <div>
          <strong>{step >= 4 ? t("10 disciplinas acionadas") : t("Mapa de impacto aguardando decisão")}</strong>
          <span>
            {step >= 4
              ? t("5 críticas · 3 em observação · 2 de suporte")
              : t("A conversa ainda não altera o plano aprovado")}
          </span>
        </div>
        <div className="mf-trace-mini-map" aria-hidden="true">
          {Array.from({ length: 15 }, (_, index) => (
            <span
              key={index}
              className={
                step >= 4
                  ? index < 5
                    ? "is-critical"
                    : index < 8
                      ? "is-watch"
                      : index < 10
                        ? "is-support"
                        : ""
                  : ""
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
