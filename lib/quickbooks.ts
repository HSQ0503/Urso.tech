import { createAdminClient } from "@/lib/supabase/admin";

// QuickBooks Online client — the layer between the stored OAuth tokens
// (quickbooks_connections, written by /api/quickbooks/callback) and the data
// we actually want (the ProfitAndLoss report → true margin for the Money panel).
//
// The #1 way QBO integrations die: Intuit ROTATES the refresh token (~every
// 24h). Every refresh response carries a NEW refresh token and invalidates the
// old one — so we persist the new pair to Supabase BEFORE using it. See
// refreshConnection().

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "75";

export type QboConnection = {
  client_id: string;
  realm_id: string;
  access_token: string | null;
  refresh_token: string;
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  environment: string; // 'sandbox' | 'production'
};

const apiBase = (env: string) =>
  env === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";

function basicAuth() {
  const id = process.env.QBO_CLIENT_ID;
  const secret = process.env.QBO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("QBO_CLIENT_ID / QBO_CLIENT_SECRET missing from env.");
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function getConnection(clientId = "woof-gang"): Promise<QboConnection> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("quickbooks_connections")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`quickbooks_connections read failed: ${error.message}`);
  if (!data) throw new Error(`No QuickBooks connection for '${clientId}' — run /api/quickbooks/connect first.`);
  return data as QboConnection;
}

// Swap the refresh token for a new access token. Intuit returns a NEW refresh
// token each time — persist both immediately, or the connection silently dies.
async function refreshConnection(conn: QboConnection): Promise<QboConnection> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const tid = res.headers.get("intuit_tid") ?? "n/a"; // Intuit transaction id — capture for support
    console.error(`[qbo] token refresh failed (${res.status}) intuit_tid=${tid}: ${body.slice(0, 200)}`);
    throw new Error(
      `QBO token refresh failed (${res.status}) [intuit_tid=${tid}] — owner may need to reconnect via /api/quickbooks/connect. ${body.slice(0, 200)}`,
    );
  }
  const t = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };

  const now = Date.now();
  const next: QboConnection = {
    ...conn,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    token_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + t.x_refresh_token_expires_in * 1000).toISOString(),
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("quickbooks_connections")
    .update({
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      token_expires_at: next.token_expires_at,
      refresh_token_expires_at: next.refresh_token_expires_at,
      updated_at: new Date(now).toISOString(),
    })
    .eq("client_id", conn.client_id)
    .eq("realm_id", conn.realm_id);
  if (error) throw new Error(`Persisting rotated QBO tokens failed: ${error.message}`);
  return next;
}

// Returns a connection whose access token is valid for at least ~3 minutes.
export async function getFreshConnection(clientId = "woof-gang"): Promise<QboConnection> {
  const conn = await getConnection(clientId);
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  if (!conn.access_token || expiresAt < Date.now() + 3 * 60_000) return refreshConnection(conn);
  return conn;
}

// Authenticated GET against the QBO API; one forced-refresh retry on 401.
export async function qboGet(
  conn: QboConnection,
  path: string,
  params: Record<string, string> = {},
): Promise<{ json: Record<string, unknown>; conn: QboConnection }> {
  const run = async (c: QboConnection) => {
    const url = new URL(`${apiBase(c.environment)}/v3/company/${c.realm_id}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("minorversion", MINOR_VERSION);
    return fetch(url, {
      headers: { Authorization: `Bearer ${c.access_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  };

  let res = await run(conn);
  if (res.status === 401) {
    conn = await refreshConnection(conn);
    res = await run(conn);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const tid = res.headers.get("intuit_tid") ?? "n/a"; // Intuit transaction id — capture for support
    console.error(`[qbo] ${path} failed (${res.status}) intuit_tid=${tid}: ${body.slice(0, 300)}`);
    throw new Error(`QBO ${path} failed (${res.status}) [intuit_tid=${tid}]: ${body.slice(0, 300)}`);
  }
  return { json: (await res.json()) as Record<string, unknown>, conn };
}

// ---------------------------------------------------------------------------
// ProfitAndLoss report → flat rows
// QBO reports come back as a nested rows/columns matrix (Sections containing
// Rows containing ColData), NOT flat records. We walk it recursively.
// ---------------------------------------------------------------------------

export type PnlRow = {
  month: string; // first day of the month, YYYY-MM-DD
  section: string; // e.g. 'Income', 'Cost of Goods Sold', 'Expenses'
  account: string; // QBO account name
  amount: number;
};

export type PnlTotal = {
  month: string;
  label: string; // QBO summary label, e.g. 'Total Income', 'Net Income'
  amount: number;
  depth: number; // 0 = top-level P&L line; >0 = a nested group subtotal
};

export type PnlSummary = {
  months: string[];
  rows: PnlRow[];
  totals: PnlTotal[]; // Total Income, Gross Profit, Net Income… (all depths)
};

type ReportCol = { ColTitle?: string; ColType?: string; MetaData?: { Name: string; Value: string }[] };
type ColData = { value?: string; id?: string };
type ReportRow = {
  type?: string;
  group?: string;
  Header?: { ColData?: ColData[] };
  Rows?: { Row?: ReportRow[] };
  Summary?: { ColData?: ColData[] };
  ColData?: ColData[];
};

function parsePnl(report: Record<string, unknown>): PnlSummary {
  const columns = ((report.Columns as { Column?: ReportCol[] })?.Column ?? []) as ReportCol[];
  // Map money-column index → month (via the StartDate metadata; the trailing
  // "Total" column has no StartDate and is skipped).
  const monthByCol = new Map<number, string>();
  columns.forEach((col, i) => {
    const start = col.MetaData?.find((m) => m.Name === "StartDate")?.Value;
    if (col.ColType === "Money" && start) monthByCol.set(i, start);
  });
  const months = [...monthByCol.values()];

  const rows: PnlRow[] = [];
  const totals: PnlTotal[] = [];

  const eachMoney = (cd: ColData[] | undefined, fn: (month: string, amount: number) => void) => {
    cd?.forEach((c, i) => {
      const month = monthByCol.get(i);
      if (!month) return;
      const amount = Number(c.value ?? 0) || 0;
      fn(month, amount);
    });
  };

  const walk = (rs: ReportRow[] | undefined, section: string, depth: number) => {
    for (const r of rs ?? []) {
      if (r.type === "Section" || r.Rows) {
        const name = r.Header?.ColData?.[0]?.value || r.group || section;
        walk(r.Rows?.Row, name, depth + 1);
        const label = r.Summary?.ColData?.[0]?.value;
        // depth tags whether this is a top-level P&L line (Total Income, Net
        // Income…) or a nested group subtotal — only the top-level ones are
        // persisted as authoritative totals (see syncQuickbooks).
        if (label) eachMoney(r.Summary?.ColData, (month, amount) => totals.push({ month, label, amount, depth }));
      } else if (r.ColData?.length) {
        const account = r.ColData[0]?.value ?? "";
        if (!account) continue;
        eachMoney(r.ColData, (month, amount) => rows.push({ month, section, account, amount }));
      }
    }
  };
  walk(((report.Rows as { Row?: ReportRow[] })?.Row ?? []) as ReportRow[], "", 0);

  return { months, rows, totals };
}

// Pull the P&L summarized by month and upsert into quickbooks_pnl.
export async function syncQuickbooks(clientId = "woof-gang", monthsBack = 3, accountingMethod: "Accrual" | "Cash" = "Accrual") {
  const started = Date.now();
  let conn = await getFreshConnection(clientId);

  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (monthsBack - 1), 1));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const { json, conn: c2 } = await qboGet(conn, "/reports/ProfitAndLoss", {
    start_date: startDate,
    end_date: endDate,
    summarize_column_by: "Month",
    accounting_method: accountingMethod, // explicit, so numbers match what the owner sees
  });
  conn = c2;

  const pnl = parsePnl(json);

  // QBO can emit the same account line twice (parent accounts with
  // sub-accounts repeat the parent name as its own row). Postgres can't upsert
  // the same primary key twice in one batch — merge duplicates by summing.
  const merged = new Map<string, PnlRow>();
  for (const r of pnl.rows) {
    const key = `${r.month}|${r.section}|${r.account}`;
    const prev = merged.get(key);
    if (prev) prev.amount += r.amount;
    else merged.set(key, { ...r });
  }
  const rows = [...merged.values()];

  const supabase = createAdminClient();
  if (rows.length) {
    const { error } = await supabase.from("quickbooks_pnl").upsert(
      rows.map((r) => ({
        client_id: clientId,
        realm_id: conn.realm_id,
        month: r.month,
        section: r.section,
        account: r.account,
        amount: r.amount,
        accounting_method: accountingMethod,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "client_id,realm_id,month,section,account,accounting_method" },
    );
    if (error) throw new Error(`quickbooks_pnl upsert failed: ${error.message}`);
  }

  // Persist QuickBooks' OWN top-level P&L summary lines (depth 0): Total Income,
  // Total Cost of Goods Sold, Gross Profit, Total Expenses, Net Income, etc.
  // These are authoritative and complete (read straight from the report's
  // Summary rows), unlike the flattened leaf rows above — the dashboard Money
  // panel reads THESE. Dedupe by (month,label) defensively, same as the leaves.
  const totalsMerged = new Map<string, { month: string; label: string; amount: number }>();
  for (const t of pnl.totals) {
    if (t.depth !== 0) continue; // skip nested group subtotals
    const key = `${t.month}|${t.label}`;
    const prev = totalsMerged.get(key);
    if (prev) prev.amount += t.amount;
    else totalsMerged.set(key, { month: t.month, label: t.label, amount: t.amount });
  }
  const totalRows = [...totalsMerged.values()];
  if (totalRows.length) {
    const { error } = await supabase.from("quickbooks_pnl_totals").upsert(
      totalRows.map((t) => ({
        client_id: clientId,
        realm_id: conn.realm_id,
        month: t.month,
        label: t.label,
        amount: t.amount,
        accounting_method: accountingMethod,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "client_id,realm_id,month,label,accounting_method" },
    );
    if (error) throw new Error(`quickbooks_pnl_totals upsert failed: ${error.message}`);
  }

  const netIncome = pnl.totals.filter((t) => t.depth === 0 && /net income/i.test(t.label));
  return {
    environment: conn.environment,
    realm_id: conn.realm_id,
    range: { startDate, endDate },
    accountingMethod,
    months: pnl.months,
    accounts: rows.length,
    totalsStored: totalRows.length,
    netIncome,
    totals: pnl.totals.filter((t) => t.depth === 0),
    ms: Date.now() - started,
  };
}
