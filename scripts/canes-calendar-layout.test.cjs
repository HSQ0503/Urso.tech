/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS harness loads transpiled TSX and a configurable browser runtime. */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = path.resolve(__dirname, "..");
const ref = process.env.CALENDAR_TEST_REF;
const read = (file) => ref
  ? execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, file), "utf8");

function source(file) {
  const exports = {};
  const code = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (name === "@/lib/canes/types") return source("packages/types/src/types.ts");
    if (name === "./unscheduled-tray") return { readDrag: () => null, writeDrag: () => {} };
    return require(name);
  }, exports);
  return exports;
}

const { CalendarBoard } = source("app/CanesPressure/components/schedule/calendar-board.tsx");
const css = read("app/CanesPressure/canes.css");
let browser;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
});
after(async () => { await browser?.close(); });

function job(id, minutes = 60) {
  const scheduled = "2026-09-30T13:00:00Z";
  return {
    id,
    scheduled_at: scheduled,
    ends_at: new Date(Date.parse(scheduled) + minutes * 60_000).toISOString(),
    duration_minutes: minutes,
    status: "scheduled",
    customer_name: "Appointment Customer",
    total_cents: 10000,
    crew_id: "crew",
    crew: { id: "crew", name: "Crew one", color: "#008000" },
  };
}

async function measure({ jobs = [], visits = [], selector }) {
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(CalendarBoard, {
    view: "week",
    anchor: new Date("2026-09-29T12:00:00Z"),
    dayAnchor: new Date("2026-09-30T12:00:00Z"),
    jobs, visits, events: [], crews: [], crewFilter: null,
    contentKind: "all", dropActiveYmd: null,
    onOpenJob: noop, onOpenVisit: noop, onOpenEvent: noop,
    onOpenRunSheet: noop, onDropJob: noop, onOpenDay: noop, setDropActive: noop,
  }));
  const page = await browser.newPage();
  try {
    // Match Tailwind's layer ordering so its preflight cannot override component typography.
    await page.setContent(`<style>
      @layer base, components, utilities;
      @layer base { * { box-sizing: border-box; } button { font: inherit; } }
      @layer utilities { .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
      ${css}
      </style><div class="canes" style="width:760px">${html}</div>`);
    return await page.locator(selector).first().evaluate((element) => {
      const card = element.getBoundingClientRect();
      return {
        width: card.width,
        height: card.height,
        title: element.getAttribute("title"),
        rows: [...element.children]
          .filter((child) => getComputedStyle(child).display !== "none")
          .map((child) => {
            const rect = child.getBoundingClientRect();
            return {
              text: child.textContent,
              height: rect.height,
              lineHeight: Number.parseFloat(getComputedStyle(child).lineHeight),
              fits: rect.top >= card.top - 0.1 && rect.bottom <= card.bottom + 0.1,
            };
          }),
      };
    });
  } finally {
    await page.close();
  }
}

function assertReadable(result, rowCount) {
  assert.equal(result.rows.length, rowCount);
  for (const row of result.rows) {
    assert.ok(Math.abs(row.height - row.lineHeight) < 0.1, `${row.text}: ${row.height}px, expected one ${row.lineHeight}px line`);
    assert.ok(row.fits, `${row.text} extends beyond the card`);
  }
}

test("overlapping week jobs retain readable time, customer, and crew rows", async (context) => {
  const result = await measure({ jobs: [job("one"), job("two")], selector: ".cp-timegrid-block" });
  context.diagnostic(JSON.stringify(result));
  assertReadable(result, 3);
});

test("a fifteen-minute job shows one complete customer label", async (context) => {
  const result = await measure({ jobs: [job("short", 15)], selector: ".cp-timegrid-block" });
  context.diagnostic(JSON.stringify(result));
  assertReadable(result, 1);
  assert.match(result.rows[0].text, /Appointment Customer/);
  assert.match(result.title, /9:00 AM.*9:15 AM/);
});

test("a narrow quote keeps its time and name on separate single lines", async (context) => {
  const result = await measure({
    jobs: [job("one"), job("two")],
    visits: [{ id: "visit", name: "Quote Customer", appointment_at: "2026-09-30T13:00:00Z" }],
    selector: ".cp-timegrid-visit",
  });
  context.diagnostic(JSON.stringify(result));
  assertReadable(result, 2);
});
