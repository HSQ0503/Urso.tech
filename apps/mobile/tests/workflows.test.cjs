const assert = require("node:assert/strict");
const { test, beforeEach, afterEach, mock } = require("node:test");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { create, act } = require("react-test-renderer");
const ts = require("../../../node_modules/typescript");

global.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-10T16:00:00Z") }));
afterEach(() => mock.timers.reset());
const root = path.resolve(__dirname, "..");
const host = (name) => name;
const native = {
  ...Object.fromEntries(["ActivityIndicator", "KeyboardAvoidingView", "Pressable", "ScrollView", "SectionList", "Text", "TextInput", "View"].map((name) => [name, host(name)])),
  Modal: ({ visible, children }) => visible ? React.createElement("Modal", null, children) : null,
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
  Platform: { OS: "ios" },
  Keyboard: { dismiss() {} },
};

// Exercise the real React screens and handlers, replacing only native hosts,
// navigation and network boundaries so tests never touch customer data.
function harness() {
  const state = { params: { id: "first" }, estimates: {}, writes: [] };
  const cache = new Map();
  const key = new Proxy(() => [], { get: () => key });
  const queries = {
    keys: key,
    useEstimate: (id) => ({ data: state.estimates[id] ?? null, isPending: false }),
    useCustomers: () => ({ data: [] }),
    useCatalog: () => ({ data: [] }),
  };
  const api = new Proxy({}, { get: (_, action) => async (...args) => {
    state.writes.push({ action, args });
    return { ok: true, data: { estimateId: "created" } };
  } });
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    function requireSource(name) {
      if (name === "react-native") return native;
      if (name === "react" || name.startsWith("react/")) return require(name);
      if (name === "expo-router") return { useLocalSearchParams: () => state.params, router: { back() {}, replace() {}, push() {} } };
      if (name === "react-native-safe-area-context") return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (name === "@expo/vector-icons") return { Feather: host("Icon") };
      if (name === "@/queries") return queries;
      if (name === "@/api") return { estimateActions: api };
      if (name === "@/query") return { noticeFrom: () => null, useAction: (fn) => ({ mutateAsync: fn, isPending: false }) };
      if (name === "@/components/address-input") return { AddressInput: host("AddressInput") };
      if (name === "@/components/notice") return { Notice: host("Notice") };
      if (name === "@urso/types") return load(path.resolve(root, "../../packages/types/src/types.ts"));
      const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
      if (resolved) return load(resolved);
      throw new Error(`Unmocked dependency: ${name}`);
    }
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: file })(requireSource, module, module.exports);
    return module.exports;
  }
  return { state, load: (file) => load(path.join(root, file)) };
}

function estimate(name, expiry = "2028-07-26T20:00:00.000Z") {
  return { id: name, estimate_type: "standard", status: "draft", customer_name: name, customer_phone: "+15555550123", customer_email: `${name}@example.com`, job_address: `${name} address`, job_name: `${name} job`, expires_at: expiry, created_at: "2026-09-09T12:00:00Z", contact_id: name, items: [] };
}
async function mount(Component, props) {
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component, props)); });
  return renderer;
}
function button(renderer, label) {
  return renderer.root.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === label);
}
const text = (node) => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node ? text(node.children) : "";

test("changing the time preserves a booking date beyond the first week", async () => {
  const { load } = harness();
  const { SlotPicker } = load("src/components/slot-picker.tsx");
  let selected;
  const renderer = await mount(SlotPicker, { value: "2028-07-26T10:15", onChange: (value) => { selected = value; } });
  const nine = renderer.root.findAllByType("Pressable").find((item) => text(item.toJSON?.() ?? { children: item.children }) === "9 AM");
  await act(async () => { nine.props.onPress(); });
  assert.equal(selected, "2028-07-26T09:15");
  await act(async () => renderer.unmount());
});

test("opening expiry selects a date without advancing the saved date", async () => {
  const { state, load } = harness();
  state.estimates.first = estimate("Angela");
  const Screen = load("app/(owner)/estimate/new.tsx").default;
  const renderer = await mount(Screen);
  const before = text(button(renderer, "Change expiry date"));
  await act(async () => button(renderer, "Change expiry date").props.onPress());
  assert.equal(text(button(renderer, "Change expiry date")), before);
  assert.equal(renderer.root.findAllByType("Modal").length, 1);
  await act(async () => renderer.unmount());
});

test("opening another estimate replaces the previous customer's form state", async () => {
  const { state, load } = harness();
  state.estimates.first = estimate("Angela");
  state.estimates.second = estimate("Amy", "2026-10-08T20:00:00Z");
  const Screen = load("app/(owner)/estimate/new.tsx").default;
  const renderer = await mount(Screen);
  assert.match(text(button(renderer, "Select customer")), /Angela/);
  state.params = { id: "second" };
  await act(async () => renderer.update(React.createElement(Screen)));
  assert.match(text(button(renderer, "Select customer")), /Amy/);
  assert.doesNotMatch(text(renderer.toJSON()), /Angela/);
  await act(async () => renderer.unmount());
});

function callAction({ denied = null, eventError = null, callError = null } = {}) {
  const writes = [];
  const source = readFileSync(path.resolve(root, "../../app/CanesPressure/actions.ts"), "utf8");
  const ast = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true);
  const action = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name.text === "logCallOutcome");
  const compiled = ts.transpileModule(action.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = {
    canesConfigured: () => true,
    denyUnlessPermitted: async () => denied,
    getLead: async () => ({ id: "lead", phone: "+15555550123", status: "new" }),
    getAdminSession: async () => ({ email: "owner@example.com" }),
    getTechnicianActor: async () => null,
    canesDb: () => ({ from: (table) => ({
      insert: async (row) => { writes.push({ table, row }); return { error: table === "events" ? eventError : table === "calls" ? callError : null }; },
      update: (row) => ({ eq: () => ({ select: async () => { writes.push({ table, row }); return { data: [{ id: "lead" }], error: null }; } }) }),
    }) }),
    logEvent: async (leadId, kind, detail) => { writes.push({ table: "events", row: { lead_id: leadId, kind, detail } }); },
    touch: async () => {},
    refresh: () => {},
  };
  const exports = {};
  vm.runInThisContext(`(function(exports,${Object.keys(dependencies).join(",")}){${compiled}\n})`)(exports, ...Object.values(dependencies));
  return { run: exports.logCallOutcome, writes };
}

test("call notes persist with author and outcome for the next teammate", async () => {
  const { run, writes } = callAction();
  assert.equal((await run("lead", "follow_up", " Call tomorrow at 5pm about paver sealing. ")).ok, true);
  const event = writes.find((write) => write.table === "events").row;
  assert.equal(event.data.note, "Call tomorrow at 5pm about paver sealing.");
  assert.equal(event.data.recorded_by, "owner@example.com");
  assert.equal(event.data.outcome, "follow_up");
});

test("a failed note write never claims the note was saved", async () => {
  const { run, writes } = callAction({ eventError: { message: "test failure" } });
  assert.equal((await run("lead", "follow_up", "Call tomorrow")).ok, false);
  assert.equal(writes.filter((write) => write.table === "calls").length, 0);
});

test("calendar selects a date months ahead and keeps the chosen quarter hour", async () => {
  const { load } = harness();
  const { SlotPicker } = load("src/components/slot-picker.tsx");
  let selected;
  const renderer = await mount(SlotPicker, { value: "2026-09-30T09:15", onChange: (value) => { selected = value; }, allowPast: true });
  await act(async () => button(renderer, "Choose another date").props.onPress());
  const input = renderer.root.findByProps({ accessibilityLabel: "Date in MM/DD/YYYY" });
  await act(async () => input.props.onChangeText("12/15/2026"));
  await act(async () => button(renderer, "Use selected date").props.onPress());
  assert.equal(selected, "2026-12-15T09:15");
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  await act(async () => renderer.unmount());
});

test("expiry can move from 2028 back to a chosen date and saves as end of day ET", async () => {
  const { state, load } = harness();
  state.estimates.first = estimate("Angela");
  const Screen = load("app/(owner)/estimate/new.tsx").default;
  const renderer = await mount(Screen);
  await act(async () => button(renderer, "Change expiry date").props.onPress());
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Date in MM/DD/YYYY" }).props.onChangeText("09/30/2026"));
  await act(async () => button(renderer, "Use selected date").props.onPress());
  assert.match(text(button(renderer, "Change expiry date")), /Sep 30, 2026/);
  await act(async () => button(renderer, "Save estimate").props.onPress());
  const write = state.writes.find((item) => item.action === "update");
  assert.equal(write.args[0], "first");
  assert.equal(write.args[1].expiresAtIso, "2026-10-01T03:59:59.000Z");
  await act(async () => renderer.unmount());
});

test("canceling date selection leaves the document unchanged", async () => {
  const { state, load } = harness();
  state.estimates.first = estimate("Angela");
  const renderer = await mount(load("app/(owner)/estimate/new.tsx").default);
  const before = text(button(renderer, "Change expiry date"));
  await act(async () => button(renderer, "Change expiry date").props.onPress());
  await act(async () => button(renderer, "In 14 days").props.onPress());
  await act(async () => button(renderer, "Cancel date selection").props.onPress());
  assert.equal(text(button(renderer, "Change expiry date")), before);
  assert.equal(state.writes.length, 0);
  await act(async () => renderer.unmount());
});

test("calendar rejects impossible dates and navigates backward across a year", async () => {
  const { load } = harness();
  const { DatePicker } = load("src/components/date-picker.tsx");
  const renderer = await mount(DatePicker, { visible: true, value: "2028-01-26", onChange() {}, onClose() {} });
  await act(async () => button(renderer, "Previous month").props.onPress());
  assert.match(text(renderer.toJSON()), /December 2027/);
  await act(async () => button(renderer, "Next month").props.onPress());
  assert.match(text(renderer.toJSON()), /January 2028/);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Date in MM/DD/YYYY" }).props.onChangeText("02/30/2028"));
  assert.equal(button(renderer, "Use selected date").props.disabled, true);
  await act(async () => renderer.unmount());
});

test("new draft sessions do not reuse an earlier estimate", async () => {
  const { state, load } = harness();
  state.estimates.first = estimate("Angela");
  const Screen = load("app/(owner)/estimate/new.tsx").default;
  const renderer = await mount(Screen);
  state.params = { type: "standard", draftKey: "new-draft" };
  await act(async () => renderer.update(React.createElement(Screen)));
  assert.match(text(button(renderer, "Select customer")), /Select Customer/);
  assert.doesNotMatch(text(renderer.toJSON()), /Angela/);
  assert.equal(button(renderer, "Save estimate").props.disabled, true);
  await act(async () => renderer.unmount());
});

test("date arithmetic follows calendar days through DST and leap years", () => {
  const { load } = harness();
  const dates = load("src/dates.ts");
  assert.equal(dates.expiryForDate("2026-11-01"), "2026-11-02T04:59:59.000Z");
  assert.equal(dates.expiryForDate("2026-03-08"), "2026-03-09T03:59:59.000Z");
  assert.equal(dates.addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(dates.parseDateInput("02/29/2027"), null);
});

test("unauthorized and oversized call notes never write", async () => {
  const blocked = callAction({ denied: { ok: false, notice: "Not allowed" } });
  assert.equal((await blocked.run("lead", "follow_up", "Note")).ok, false);
  assert.equal(blocked.writes.length, 0);
  const oversized = callAction();
  assert.equal((await oversized.run("lead", "follow_up", "x".repeat(4001))).ok, false);
  assert.equal(oversized.writes.length, 0);
});

test("a secondary history failure reports that the note was saved", async () => {
  const { run, writes } = callAction({ callError: { message: "history unavailable" } });
  const result = await run("lead", "follow_up", "Call at 5pm");
  assert.equal(result.ok, true);
  assert.match(result.notice, /Call note saved in Activity/);
  assert.equal(writes.find((write) => write.table === "events").row.data.note, "Call at 5pm");
});
