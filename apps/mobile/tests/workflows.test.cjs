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
  const state = { params: { id: "first" }, estimates: {}, jobs: {}, writes: [], navigation: [], alerts: [], actionData: { estimateId: "created" } };
  const cache = new Map();
  const key = new Proxy(() => [], { get: () => key });
  const queries = {
    keys: key,
    useEstimate: (id) => ({ data: state.estimates[id] ?? null, isPending: false }),
    useJob: (id) => ({ data: state.jobs[id] ?? null, isPending: false, isError: false }),
    useJobs: () => ({ data: [] }),
    useInvoices: () => ({ data: [] }),
    useCustomers: () => ({ data: [] }),
    useCatalog: () => ({ data: [] }),
    useSettings: () => ({ data: { deposit_presets: [0, 25, 50] } }),
  };
  const api = new Proxy({}, { get: (_, action) => async (...args) => {
    state.writes.push({ action, args });
    return { ok: true, data: state.actionData };
  } });
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    function requireSource(name) {
      if (name === "react-native") return { ...native, Alert: { alert: (...args) => state.alerts.push(args) } };
      if (name === "react" || name.startsWith("react/")) return require(name);
      if (name === "expo-router") return { useLocalSearchParams: () => state.params, useFocusEffect: (effect) => React.useEffect(effect, [effect]), router: { back() {}, replace: (href) => state.navigation.push(href), push: (href) => state.navigation.push(href) } };
      if (name === "react-native-safe-area-context") return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (name === "@expo/vector-icons") return { Feather: host("Icon") };
      if (name === "@/queries") return queries;
      if (name === "@/api") return { estimateActions: api, recurringActions: api, customerActions: api };
      if (name === "@/components/toast") return { useToast: () => ({ show() {} }) };
      if (name === "@/query") return { noticeFrom: () => null, usePullToRefresh: () => ({ refreshing: false, onRefresh() {} }), useAction: (fn) => ({ mutateAsync: fn, isPending: false }) };
      if (name === "@/components/ledger") return { Mark: host("Mark"), NextStep: host("NextStep") };
      if (name === "@/components/delivery-sheet") return { DeliverySheet: host("DeliverySheet") };
      if (name === "@/components/address-input") return { AddressInput: host("AddressInput") };
      if (name === "@/components/phone-input") return { PhoneInput: host("PhoneInput"), toPhoneDisplay: (value) => value };
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
  return { id: name, estimate_type: "standard", status: "draft", customer_name: name, customer_phone: "+15555550123", customer_email: `${name}@example.com`, job_address: `${name} address`, job_name: `${name} job`, expires_at: expiry, created_at: "2026-09-09T12:00:00Z", contact_id: name, deposit_percent: 0, deposit_cents: 0, items: [] };
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

test("recurring conversion uses the linked job's Eastern date instead of an ignored first-visit choice", async () => {
  const { state, load } = harness();
  state.jobs.scheduled = { scheduled_at: "2026-09-15T01:00:00Z", plan_id: null };
  const { RecurringSheet } = load("src/components/recurring-sheet.tsx");
  const renderer = await mount(RecurringSheet, {
    source: { kind: "invoice", id: "invoice", jobId: "scheduled" },
    pricePerVisitCents: 15000, customerName: "Test", onClose() {},
  });
  assert.equal(Boolean(button(renderer, "Choose first visit date")), false);
  assert.match(text(renderer.toJSON()), /Mon, Sep 14, 2026/);
  assert.match(text(renderer.toJSON()), /linked work order is visit one/);
  await act(async () => button(renderer, "Create recurring plan").props.onPress());
  assert.deepEqual(state.writes[0].args, ["invoice", "quarterly", "2026-09-14"]);
  await act(async () => renderer.unmount());
});

test("recurring conversion without a scheduled source keeps the chosen first visit", async () => {
  const { state, load } = harness();
  const { RecurringSheet } = load("src/components/recurring-sheet.tsx");
  const renderer = await mount(RecurringSheet, {
    source: { kind: "estimate", id: "draft" },
    pricePerVisitCents: 15000, customerName: "Test", onClose() {},
  });
  await act(async () => button(renderer, "Choose first visit date").props.onPress());
  await act(async () => button(renderer, "Previous month").props.onPress());
  const date = renderer.root.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === "Sun, Sep 20, 2026");
  await act(async () => date.props.onPress());
  await act(async () => button(renderer, "Use selected date").props.onPress());
  await act(async () => button(renderer, "Create recurring plan").props.onPress());
  assert.deepEqual(state.writes[0].args, ["draft", "quarterly", "2026-09-20"]);
  await act(async () => renderer.unmount());
});

test("a new plan entry resets a saved hidden-tab form", async () => {
  const { state, load } = harness();
  state.params = { draftKey: "first" };
  const Screen = load("app/(owner)/plan/new.tsx").default;
  const renderer = await mount(Screen);
  const input = (label) => renderer.root.findAllByType("TextInput").find((item) => item.props.accessibilityLabel === label);
  await act(async () => {
    input("Customer name").props.onChangeText("First customer");
    input("Service name").props.onChangeText("Driveway wash");
    input("Unit price in dollars").props.onChangeText("150");
  });
  await act(async () => button(renderer, "Save plan").props.onPress());
  assert.equal(button(renderer, "Save plan").props.disabled, true);
  state.params = { draftKey: "second" };
  await act(async () => renderer.update(React.createElement(Screen)));
  assert.equal(input("Customer name").props.value, "");
  await act(async () => {
    input("Customer name").props.onChangeText("Second customer");
    input("Service name").props.onChangeText("House wash");
    input("Unit price in dollars").props.onChangeText("300");
  });
  assert.equal(button(renderer, "Save plan").props.disabled, false);
  await act(async () => renderer.unmount());
});

test("saving a customer opens the id returned by the server", async () => {
  const { state, load } = harness();
  state.actionData = { id: "new-contact" };
  const Screen = load("app/(owner)/customer/new.tsx").default;
  const renderer = await mount(Screen);
  const name = renderer.root.findAllByType("TextInput").find((item) => item.props.accessibilityLabel === "Customer name");
  await act(async () => name.props.onChangeText("ZZ Codex Test"));
  await act(async () => button(renderer, "Save customer").props.onPress());
  assert.equal(state.navigation.at(-1)?.pathname, "/(owner)/customer/[id]");
  assert.equal(state.navigation.at(-1)?.params.id, "new-contact");
  await act(async () => renderer.unmount());
});

test("changing estimates clears the previous document's cancellation notice", async () => {
  const { state, load } = harness();
  state.estimates.first = estimate("First");
  state.estimates.second = { ...estimate("Second"), status: "approved" };
  state.actionData = { notice: "Estimate canceled." };
  const Screen = load("app/(owner)/estimate/[id].tsx").default;
  const renderer = await mount(Screen);
  await act(async () => button(renderer, "Estimate actions").props.onPress());
  const cancel = renderer.root.findAllByType("Pressable").find((item) => text(item) === "Cancel Estimate");
  await act(async () => cancel.props.onPress());
  await act(async () => state.alerts.at(-1)[2].find((action) => action.text === "Cancel estimate").onPress());
  assert.match(text(renderer.toJSON()), /Estimate canceled\./);
  state.params = { id: "second" };
  await act(async () => renderer.update(React.createElement(Screen)));
  assert.doesNotMatch(text(renderer.toJSON()), /Estimate canceled\./);
  assert.match(text(renderer.toJSON()), /Second/);
  await act(async () => renderer.unmount());
});

test("a deposit percent chosen on the estimate form is saved with the estimate", async () => {
  const { state, load } = harness();
  state.estimates.first = estimate("Angela");
  const Screen = load("app/(owner)/estimate/new.tsx").default;
  const renderer = await mount(Screen);
  await act(async () => button(renderer, "50 percent deposit").props.onPress());
  assert.match(text(renderer.toJSON()), /asks for 50% of the total/);
  await act(async () => button(renderer, "Custom deposit percent").props.onPress());
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Deposit percent" }).props.onChangeText("3o5"));
  await act(async () => button(renderer, "Save estimate").props.onPress());
  const write = state.writes.find((item) => item.action === "update");
  assert.equal(write.args[1].depositPercent, 35);
  await act(async () => renderer.unmount());
});

test("an estimate with no email on file can be sent to an email typed on the sheet", async () => {
  const { load } = harness();
  const { DeliverySheet } = load("src/components/delivery-sheet.tsx");
  const sent = [];
  const renderer = await mount(DeliverySheet, { visible: true, documentLabel: "estimate", phone: "+19546369923", email: null, sending: false, allowAdding: true, onClose() {}, onSend: (channels, overrides) => sent.push({ channels, overrides }) });
  assert.match(text(renderer.toJSON()), /Add an email below/);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Customer email" }).props.onChangeText("osseseugene@gmail.com"));
  await act(async () => renderer.root.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === "Send estimate").props.onPress());
  assert.deepEqual(sent, [{ channels: { text: true, email: false }, overrides: { toEmail: "osseseugene@gmail.com" } }]);
  await act(async () => renderer.root.findAllByType("Pressable").find((item) => item.props.accessibilityRole === "radio" && text(item).startsWith("Both")).props.onPress());
  await act(async () => renderer.root.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === "Send estimate").props.onPress());
  assert.deepEqual(sent[1], { channels: { text: true, email: true }, overrides: { toEmail: "osseseugene@gmail.com" } });
  await act(async () => renderer.unmount());
});

test("without the override the sheet still refuses a document with no destination", async () => {
  const { load } = harness();
  const { DeliverySheet } = load("src/components/delivery-sheet.tsx");
  const renderer = await mount(DeliverySheet, { visible: true, documentLabel: "agreement", phone: null, email: null, sending: false, onClose() {}, onSend() {} });
  assert.match(text(renderer.toJSON()), /Add a phone number or email before sending this agreement/);
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Customer email" }).length, 0);
  await act(async () => renderer.unmount());
});
