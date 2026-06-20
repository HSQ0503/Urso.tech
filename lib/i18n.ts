// Lightweight i18n for the dashboard. English is the source language and also
// the lookup key, so wrapping a string is just `t("Weekly brief")`; only the
// Portuguese side needs entries here. Missing keys fall back to English.
//
// The active locale lives in a cookie (urso-lang) so it works across server
// components (see i18n.server.ts) and client components (see locale-provider).

import { ptGenerated } from "./i18n-pt.generated";

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

  // ── Money / profit page ──
  Money: "Finanças",
  "Profit & margins": "Lucro e margens",
  "QuickBooks · accrual": "QuickBooks · competência",
  "Books not closed — provisional": "Livros não fechados — provisório",
  "Current month excluded (books open)": "Mês atual excluído (livros abertos)",
  "Per-store P&L — excludes company-level unallocated costs": "DRE por loja — exclui custos não alocados da empresa",
  "No QuickBooks data for this period.": "Sem dados do QuickBooks para este período.",
  "Gross margin": "Margem bruta",
  "Net profit": "Lucro líquido",
  "Net margin": "Margem líquida",
  pts: "p.p.",
  "Labor ratio": "Índice de mão de obra",
  "payroll ÷ revenue": "folha ÷ receita",
  "Profit / groom": "Lucro / banho",
  "net ÷ bookings": "líquido ÷ agendamentos",
  "Trend · all closed months": "Tendência · todos os meses fechados",
  "Revenue, profit & margin over time": "Receita, lucro e margem ao longo do tempo",
  "Profit & margin trend": "Tendência de lucro e margem",
  "Is profitability improving or eroding?": "A lucratividade está melhorando ou caindo?",
  "Which months are the most profitable?": "Quais meses são os mais lucrativos?",
  "Where the money goes": "Para onde vai o dinheiro",
  "Revenue to net profit": "Da receita ao lucro líquido",
  "Profit waterfall": "Cascata de lucro",
  "What's my single biggest cost?": "Qual é meu maior custo isolado?",
  "What would lift net profit the most?": "O que mais aumentaria o lucro líquido?",
  "Cost as % of revenue": "Custo como % da receita",
  "Cost breakdown": "Detalhamento de custos",
  "Cross-store benchmark · cost as % of revenue": "Comparativo entre lojas · custo como % da receita",
  "Cross-store cost benchmark": "Comparativo de custos entre lojas",
  "Which store has the worst cost problem?": "Qual loja tem o pior problema de custo?",
  "Why is one store less profitable than another?": "Por que uma loja é menos lucrativa que outra?",
  "Where each store's costs run high": "Onde os custos de cada loja são altos",
  "Every cost is shown as a share of that store's own revenue, so stores of different sizes compare fairly. Hotter cells are higher — they point to the specific line dragging a store's margin.":
    "Cada custo é mostrado como fração da receita da própria loja, para que lojas de tamanhos diferentes se comparem de forma justa. Células mais quentes são maiores — apontam a linha específica que reduz a margem da loja.",
  Note: "Obs.",
  "of Windermere + Lakeside costs aren't tagged to a store in QuickBooks (kept in the consolidated total, not in either store above).":
    "dos custos de Windermere + Lakeside não estão atribuídos a uma loja no QuickBooks (mantidos no total consolidado, não nas lojas acima).",
  "Consolidated P&L": "DRE consolidado",
  "Profit & loss": "Demonstração de resultado",
  "All stores, this period": "Todas as lojas, este período",
  "− Cost of goods": "− Custo dos produtos",
  "Gross profit": "Lucro bruto",
  "Cost of goods": "Custo dos produtos",
  "− Operating expenses": "− Despesas operacionais",
  "Net margin by store": "Margem líquida por loja",
  "Who's carrying the profit": "Quem sustenta o lucro",
  "True margin by service line": "Margem real por linha de serviço",
  "Grooming vs retail margin": "Margem banho e tosa vs varejo",
  "Is grooming or retail more profitable?": "Banho e tosa ou varejo é mais lucrativo?",
  "Does retail attach help or hurt margin?": "A venda de varejo ajuda ou prejudica a margem?",
  "Gross margin only — service-line operating costs aren't split in QuickBooks. Retail is higher-margin at the register, so attach lifts both revenue and blended margin.":
    "Apenas margem bruta — os custos operacionais por linha não são separados no QuickBooks. O varejo tem maior margem no caixa, então a venda casada aumenta receita e margem combinada.",
  "Break-even": "Ponto de equilíbrio",
  "How many more grooms to break even?": "Quantos banhos a mais para o equilíbrio?",
  "What's my contribution margin?": "Qual é minha margem de contribuição?",
  "Break-even · per month": "Ponto de equilíbrio · por mês",
  "What it takes to profit": "O que é preciso para lucrar",
  "Break-even revenue": "Receita de equilíbrio",
  "Monthly revenue": "Receita mensal",
  "Contribution margin": "Margem de contribuição",
  "Fixed costs / mo": "Custos fixos / mês",
  "Costs exceed revenue at every volume this period — fix the cost base before chasing volume.":
    "Os custos superam a receita em qualquer volume neste período — corrija a base de custos antes de buscar volume.",
  "Above break-even by": "Acima do equilíbrio em",
  "grooms/month of cushion.": "banhos/mês de folga.",
  Need: "Faltam",
  "more grooms/month": "banhos/mês a mais",
  at: "a",
  avg: "médio",
  "to break even.": "para o equilíbrio.",
  "Directional model: payroll, COGS, royalty, card fees and supplies treated as variable; rent, insurance, utilities and repairs as fixed.":
    "Modelo direcional: folha, CPV, royalty, taxas de cartão e suprimentos como variáveis; aluguel, seguro, utilidades e reparos como fixos.",
  Margin: "Margem",
  Amount: "Valor",
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

// Curated chrome strings (pt) override the bulk page strings (ptGenerated).
export const messages: Record<Locale, Record<string, string>> = { en: {}, pt: { ...ptGenerated, ...pt } };

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
