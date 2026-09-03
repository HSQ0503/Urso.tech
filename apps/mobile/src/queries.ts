import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { owner } from "./api";
import { unwrap } from "./query";

// One hook per owner read, one key per hook, all in one place — a screen never
// invents a key inline, and a mutation (O1+) invalidates by importing the same
// factory it was fetched under. Keys are hierarchical so invalidating
// keys.leads.all() also refreshes every lead detail under it.

export const keys = {
  overview: () => ["owner", "overview"] as const,
  agenda: () => ["owner", "agenda"] as const,
  todayReport: () => ["owner", "today-report"] as const,
  threads: {
    all: () => ["owner", "threads"] as const,
    messages: (phone: string) => ["owner", "threads", phone, "messages"] as const,
    calls: (phone: string) => ["owner", "threads", phone, "calls"] as const,
  },
  leads: {
    all: () => ["owner", "leads"] as const,
    one: (id: string) => ["owner", "leads", id] as const,
    events: (id: string) => ["owner", "leads", id, "events"] as const,
    calls: (id: string) => ["owner", "leads", id, "calls"] as const,
  },
  customers: {
    all: () => ["owner", "customers"] as const,
    one: (id: string) => ["owner", "customers", id] as const,
  },
  estimates: () => ["owner", "estimates"] as const,
  estimateOne: (id: string) => ["owner", "estimates", id] as const,
  invoices: () => ["owner", "invoices"] as const,
  invoiceOne: (id: string) => ["owner", "invoices", id] as const,
  invoiceRewards: (id: string) => ["owner", "invoices", id, "rewards"] as const,
  schedule: {
    all: () => ["owner", "schedule"] as const,
    board: (fromIso: string, toIso: string) => ["owner", "schedule", fromIso, toIso] as const,
    unscheduled: () => ["owner", "unscheduled"] as const,
  },
  crews: () => ["owner", "crews"] as const,
  catalog: () => ["owner", "catalog"] as const,
  expenses: () => ["owner", "expenses"] as const,
  payouts: (range: string) => ["owner", "payouts", range] as const,
  insights: (range: string) => ["owner", "insights", range] as const,
  settings: () => ["owner", "settings"] as const,
  jobs: {
    all: () => ["owner", "jobs"] as const,
    one: (id: string) => ["owner", "jobs", id] as const,
  },
};

export const useOverview = () =>
  useQuery({ queryKey: keys.overview(), queryFn: () => owner.overview().then(unwrap) });

export const useAgenda = () =>
  useQuery({ queryKey: keys.agenda(), queryFn: () => owner.agenda().then(unwrap) });

export const useTodayReport = () =>
  useQuery({ queryKey: keys.todayReport(), queryFn: () => owner.todayReport().then(unwrap) });

export const useThreads = () =>
  useQuery({ queryKey: keys.threads.all(), queryFn: () => owner.threads().then(unwrap) });

export const useThreadMessages = (phone: string) =>
  useQuery({
    queryKey: keys.threads.messages(phone),
    queryFn: () => owner.threadMessages(phone).then(unwrap),
  });

export const useThreadCalls = (phone: string) =>
  useQuery({
    queryKey: keys.threads.calls(phone),
    queryFn: () => owner.threadCalls(phone).then(unwrap),
  });

export const useLeads = () =>
  useQuery({ queryKey: keys.leads.all(), queryFn: () => owner.leads().then(unwrap) });

export const useLead = (id: string) =>
  useQuery({ queryKey: keys.leads.one(id), queryFn: () => owner.lead(id).then(unwrap) });

export const useLeadEvents = (id: string) =>
  useQuery({ queryKey: keys.leads.events(id), queryFn: () => owner.leadEvents(id).then(unwrap) });

export const useLeadCalls = (id: string) =>
  useQuery({ queryKey: keys.leads.calls(id), queryFn: () => owner.leadCalls(id).then(unwrap) });

export const useCustomers = () =>
  useQuery({ queryKey: keys.customers.all(), queryFn: () => owner.customers().then(unwrap) });

export const useCustomer = (id: string) =>
  useQuery({ queryKey: keys.customers.one(id), queryFn: () => owner.customer(id).then(unwrap) });

export const useEstimates = () =>
  useQuery({ queryKey: keys.estimates(), queryFn: () => owner.estimates().then(unwrap) });

export const useInvoices = () =>
  useQuery({ queryKey: keys.invoices(), queryFn: () => owner.invoices().then(unwrap) });

// Typed `unknown` upstream in api.ts; the schedule screen owns the cast today
// and keeps owning it — this layer adds caching, not shape claims.
//
// keepPreviousData because the KEY MOVES: the window is derived from the ET
// clock, so the first focus after midnight re-keys this query into a cache
// miss. Without a bridge the board drops to undefined for the whole round trip
// and the day view renders with today's jobs simply gone — the hand-rolled
// version kept the previous window (which still contained today) on screen
// until the new one landed. Placeholder data restores exactly that.
export const useScheduleBoard = (fromIso: string, toIso: string) =>
  useQuery({
    queryKey: keys.schedule.board(fromIso, toIso),
    queryFn: () => owner.scheduleBoard(fromIso, toIso).then(unwrap),
    placeholderData: keepPreviousData,
  });

export const useUnscheduled = () =>
  useQuery({
    queryKey: keys.schedule.unscheduled(),
    queryFn: () => owner.unscheduled().then(unwrap),
  });

export const useCrews = () =>
  useQuery({ queryKey: keys.crews(), queryFn: () => owner.crews().then(unwrap) });

export const useJobs = () =>
  useQuery({ queryKey: keys.jobs.all(), queryFn: () => owner.jobs().then(unwrap) });

export const useJob = (id: string) =>
  useQuery({ queryKey: keys.jobs.one(id), queryFn: () => owner.job(id).then(unwrap) });

export const useEstimate = (id: string | null) =>
  useQuery({
    queryKey: keys.estimateOne(id ?? "new"),
    queryFn: () => owner.estimate(id ?? "").then(unwrap),
    enabled: id !== null,
  });

export const useInvoice = (id: string | null) =>
  useQuery({
    queryKey: keys.invoiceOne(id ?? "new"),
    queryFn: () => owner.invoice(id ?? "").then(unwrap),
    enabled: id !== null,
  });

export const useInvoiceRewards = (id: string) =>
  useQuery({
    queryKey: keys.invoiceRewards(id),
    queryFn: () => owner.invoiceRewards(id).then(unwrap),
  });

export const useCatalog = () =>
  useQuery({ queryKey: keys.catalog(), queryFn: () => owner.catalog().then(unwrap) });

export const useExpenses = () =>
  useQuery({ queryKey: keys.expenses(), queryFn: () => owner.expenses().then(unwrap) });

export const usePayouts = (range: "day" | "week" | "month" | "year") =>
  useQuery({ queryKey: keys.payouts(range), queryFn: () => owner.payouts(range).then(unwrap) });

export const useInsights = (range: "7d" | "30d" | "90d" | "12m") =>
  useQuery({ queryKey: keys.insights(range), queryFn: () => owner.insights(range).then(unwrap) });

export const useSettings = () =>
  useQuery({ queryKey: keys.settings(), queryFn: () => owner.settings().then(unwrap) });
