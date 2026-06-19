// Lightweight i18n for the dashboard. English is the source language and also
// the lookup key, so wrapping a string is just `t("Weekly brief")`; only the
// Portuguese side needs entries here. Missing keys fall back to English.
//
// The active locale lives in a cookie (urso-lang) so it works across server
// components (see i18n.server.ts) and client components (see locale-provider).

export type Locale = "en" | "pt";
export const LOCALES: Locale[] = ["en", "pt"];
export const DEFAULT_LOCALE: Locale = "en";
export const LANG_COOKIE = "urso-lang";

export function isLocale(v?: string | null): v is Locale {
  return v === "en" || v === "pt";
}

// pt-BR. Brand/proper nouns (Urso, store names, people) are intentionally left
// as-is. Keys with {vars} are interpolated by the translator.
const pt: Record<string, string> = {
  // ── Sidebar nav ──
  Today: "Hoje",
  Intelligence: "Inteligência",
  Operations: "Operações",
  Home: "Início",
  "Weekly brief": "Resumo semanal",
  Performance: "Desempenho",
  "Revenue map": "Mapa de receita",
  Compare: "Comparar",
  Products: "Produtos",
  "AI actions": "Ações de IA",
  Events: "Eventos",
  Stores: "Lojas",
  Customers: "Clientes",
  Team: "Equipe",
  Reviews: "Avaliações",

  // ── Shell chrome ──
  Owner: "Proprietário",
  "Store manager": "Gerente da loja",
  Platform: "Plataforma",
  account: "conta",
  "Sign out": "Sair",
  "Pilot · mock data": "Piloto · dados de teste",
  "Shaped like the live FranPOS, Twilio & Google feeds.": "Modelado como os feeds reais do FranPOS, Twilio e Google.",
  "Powered by": "Desenvolvido por",
  Account: "Conta",
  Role: "Função",
  Client: "Cliente",
  Store: "Loja",
  "Member since": "Membro desde",
  "Login streak": "Sequência de acessos",
  "{n} days": "{n} dias",
  "Pilot environment — profile editing and password changes are handled by Urso for now.":
    "Ambiente piloto — edição de perfil e troca de senha são feitas pela Urso por enquanto.",

  // ── Toggles ──
  Light: "Claro",
  Dark: "Escuro",

  // ── Top-bar filter ──
  "Dates set below": "Datas definidas abaixo",
  "The Compare page uses its own period picker below — the global month filter doesn't apply there.":
    "A página Comparar usa seu próprio seletor de período abaixo — o filtro de mês global não se aplica aqui.",
  "All stores": "Todas as lojas",

  // ── Common metric labels (brief + compare) ──
  Revenue: "Receita",
  Bookings: "Agendamentos",
  "Avg visit": "Ticket médio",
  "Return rate": "Taxa de retorno",
  "Retail attach": "Anexo de varejo",
  "Grooming share": "Participação de banho e tosa",

  // ── Weekly brief ──
  "Urso · Weekly Operating Brief": "Urso · Resumo Operacional Semanal",
  Confidential: "Confidencial",
  "This week": "Esta semana",
  "The week in one page": "A semana em uma página",
  "Generated automatically every Monday — what changed, what to watch, and the single thing worth doing next.":
    "Gerado automaticamente toda segunda-feira — o que mudou, o que observar e a única coisa que vale a pena fazer a seguir.",
  Summary: "Resumo",
  "What changed": "O que mudou",
  "vs last week": "vs semana passada",
  "Improved · watch": "Melhorou · observar",
  "What improved": "O que melhorou",
  "What to watch": "O que observar",
  "Biggest opportunity": "Maior oportunidade",
  "Recommended next step": "Próximo passo recomendado",
  completed: "concluídas",
  open: "em aberto",
  "See the detail": "Ver detalhes",
  "Open action center": "Abrir central de ações",
  "Generated {date}": "Gerado em {date}",
  "Page 1 of 1": "Página 1 de 1",
  "Download PDF": "Baixar PDF",
};

export const messages: Record<Locale, Record<string, string>> = { en: {}, pt };

export type T = (key: string, vars?: Record<string, string | number>) => string;

export function translator(locale: Locale): T {
  const table = locale === "en" ? null : messages[locale];
  return (key, vars) => {
    let s = (table && table[key]) || key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

// Locale used by Intl date/number formatting (e.g. month names on the report).
export const intlLocale = (locale: Locale): string => (locale === "pt" ? "pt-BR" : "en-US");
