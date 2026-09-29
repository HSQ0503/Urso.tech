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
  ...Object.fromEntries(["ActivityIndicator", "Image", "KeyboardAvoidingView", "Pressable", "RefreshControl", "ScrollView", "SectionList", "Text", "TextInput", "View"].map((name) => [name, host(name)])),
  AppState: { currentState: "active" },
  Modal: ({ visible, children }) => visible ? React.createElement("Modal", null, children) : null,
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
  Platform: { OS: "ios" },
  Keyboard: { dismiss() {} },
};

// Exercise the real React screens and handlers, replacing only native hosts,
// navigation and network boundaries so tests never touch customer data.
function harness() {
  const state = { params: { id: "first" }, estimates: {}, invoices: {}, jobs: {}, writes: [], navigation: [], alerts: [], actionData: { estimateId: "created" }, permissionGranted: true, pickerCalls: 0, photo: { uri: "file:///original.png", width: 4000, height: 3000, mimeType: "image/png", fileSize: 6_000_000 }, photoExports: [] };
  const cache = new Map();
  const key = new Proxy(() => [], { get: () => key });
  const queries = {
    keys: key,
    useEstimate: (id) => ({ data: state.estimates[id] ?? null, isPending: false }),
    useInvoice: (id) => ({ data: state.invoices[id] ?? null, isPending: false }),
    useJob: (id) => ({ data: state.jobs[id] ?? null, isPending: false, isError: false }),
    useJobs: () => ({ data: [] }),
    useInvoices: () => ({ data: [] }),
    useCustomers: () => ({ data: [] }),
    useCatalog: () => ({ data: [] }),
    useSettings: () => ({ data: { deposit_presets: [0, 25, 50] } }),
    useThreads: () => ({ data: [], isPending: false }),
    useThreadMessages: () => ({ data: [], isPending: false }),
    useThreadCalls: () => ({ data: [], isPending: false }),
  };
  const api = new Proxy({}, { get: (_, action) => async (...args) => {
    state.writes.push({ action, args });
    return state.actionResult ?? { ok: true, data: state.actionData };
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
      if (name === "react-native-svg") return { __esModule: true, default: host("Svg"), Polyline: host("Polyline") };
      if (name === "@expo/vector-icons") return { Feather: host("Icon") };
      if (name === "lucide-react") return new Proxy({}, { get: (_, name) => host(name) });
      if (name === "next/image") return { __esModule: true, default: host("img") };
      if (name === "@/lib/canes/message-photo-client") return { prepareMessagePhoto: async () => new File(["photo"], "photo.jpg", { type: "image/jpeg" }) };
      if (name === "expo-image-picker") return {
        requestMediaLibraryPermissionsAsync: async () => ({ granted: state.permissionGranted }),
        launchImageLibraryAsync: async () => { state.pickerCalls++; return { canceled: false, assets: [state.photo] }; },
        UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
      };
      if (name === "expo-image-manipulator") return {
        SaveFormat: { JPEG: "jpeg" },
        ImageManipulator: { manipulate: () => ({ resize() {}, release() {}, renderAsync: async () => ({ release() {}, saveAsync: async (options) => { state.photoExports.push(options); return { uri: "file:///prepared.jpg", width: 1600, height: 1200, base64: "aW1hZ2U=" }; } }) }) },
      };
      if (name === "@/queries") return queries;
      if (name === "@/api") return { documentActions: api, estimateActions: api, invoiceActions: api, recurringActions: api, customerActions: api, threadActions: api, leadActions: api, callActions: api };
      if (name === "@/components/message-content") return { MessageContent: host("MessageContent") };
      if (name === "@/app/CanesPressure/actions") return api;
      if (name === "./sheet-shell") return { SheetShell: host("SheetShell") };
      if (name === "@/components/payment-corrections") return { PaymentCorrections: host("PaymentCorrections") };
      if (name === "@/components/document-revision") return { DocumentRevisionSheet: host("DocumentRevisionSheet") };
      if (name === "@/components/toast") return { useToast: () => ({ show() {} }) };
      if (name === "@/query") return { noticeFrom: () => null, usePullToRefresh: () => ({ refreshing: false, onRefresh() {} }), useAction: (fn) => ({ mutateAsync: fn, isPending: false }) };
      if (name === "@/components/ledger") return { Mark: host("Mark"), NextStep: host("NextStep") };
      if (name === "@/components/delivery-sheet") return { DeliverySheet: host("DeliverySheet") };
      if (name === "@/components/address-input") return { AddressInput: host("AddressInput") };
      if (name === "@/components/phone-input") return { PhoneInput: host("PhoneInput"), toPhoneDisplay: (value) => value };
      if (name === "@/components/notice") return { Notice: host("Notice") };
      if (name === "@urso/types" || name === "@/lib/canes/types") return load(path.resolve(root, "../../packages/types/src/types.ts"));
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

test("photo picker remains usable when full library access is denied", async (t) => {
  const { state, load } = harness();
  state.params = { phone: "+15615550188" };
  state.permissionGranted = false;
  const renderer = await mount(load("app/(owner)/thread/[phone].tsx").default);
  t.after(async () => act(async () => renderer.unmount()));
  await act(async () => button(renderer, "Attach a photo").props.onPress());
  assert.equal(state.pickerCalls, 1);
  assert.match(text(renderer.toJSON()), /Photo ready/);
});

test("a large photo is prepared as JPEG and can be sent without a caption", async (t) => {
  const { state, load } = harness();
  state.params = { phone: "+15615550188" };
  const renderer = await mount(load("app/(owner)/thread/[phone].tsx").default);
  t.after(async () => act(async () => renderer.unmount()));
  await act(async () => button(renderer, "Attach a photo").props.onPress());
  assert.match(text(renderer.toJSON()), /Photo ready/);
  assert.equal(button(renderer, "Send message").props.disabled, false);
  await act(async () => button(renderer, "Send message").props.onPress());
  const send = state.writes.find((write) => write.action === "sendMedia");
  assert.equal(send.args[0], "+15615550188");
  assert.equal(send.args[2], "");
  assert.equal(send.args[3].mimeType, "image/jpeg");
  assert.equal(send.args[3].uri, "file:///prepared.jpg");
  assert.equal(state.photoExports[0].format, "jpeg");
});

test("changing conversations clears the previous recipient's photo", async (t) => {
  const { state, load } = harness();
  state.params = { phone: "+15615550188" };
  const Screen = load("app/(owner)/thread/[phone].tsx").default;
  const renderer = await mount(Screen);
  t.after(async () => act(async () => renderer.unmount()));
  await act(async () => button(renderer, "Attach a photo").props.onPress());
  assert.match(text(renderer.toJSON()), /Photo ready/);
  state.params = { phone: "+15555550123" };
  await act(async () => renderer.update(React.createElement(Screen)));
  assert.doesNotMatch(text(renderer.toJSON()), /Photo ready/);
  assert.equal(button(renderer, "Send message").props.disabled, true);
});

test("browser composer sends a photo without text and retains it after a refusal", async (t) => {
  const { state, load } = harness();
  const { Composer } = load("../../app/CanesPressure/components/inbox/composer.tsx");
  const renderer = await mount(Composer, { peerPhone: "+15615550188", leadId: null });
  t.after(async () => act(async () => renderer.unmount()));
  const inputs = renderer.root.findAllByType("input").filter((input) => input.props.type === "file");
  assert.equal(inputs.length, 1);
  await act(async () => inputs[0].props.onChange({ target: { files: [new File(["photo"], "source.png", { type: "image/png" })], value: "source.png" } }));
  assert.equal(renderer.root.findAllByType("img").length, 1);
  state.actionResult = { ok: false, notice: "That photo could not be sent." };
  const send = renderer.root.findAllByType("button").find((item) => item.props["aria-label"] === "Send message");
  assert.equal(send.props.disabled, false);
  await act(async () => send.props.onClick());
  const write = state.writes.find((item) => item.action === "sendPhotoMessage");
  assert.equal(write.args[0], "+15615550188");
  assert.equal(write.args[1].get("file").type, "image/jpeg");
  assert.equal(write.args[1].get("message"), "");
  assert.equal(renderer.root.findAllByType("img").length, 1);
  assert.match(text(renderer.toJSON()), /That photo could not be sent/);
});

function serverFunction(file, name, dependencies) {
  const source = readFileSync(path.resolve(root, "../..", file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const compiled = ts.transpileModule(fn.getText(ast), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return vm.runInThisContext(`(function(exports,${Object.keys(dependencies).join(",")}){${compiled}\nreturn ${name};})`)({}, ...Object.values(dependencies));
}

test("paused automations block even forced SMS while explicit sends remain usable", async () => {
  const sent = [];
  const send = serverFunction("lib/canes/twilio.ts", "sendCanesSms", {
    canesAutomationsEnabled: async () => false,
    twilioConfigured: () => true, canesConfigured: () => false,
    checkSmsConsent: async () => null, getSettings: async () => ({}),
    nextAllowedSendTime: () => new Date(), canesTwilioCreds: () => ({}),
    toE164: (phone) => phone, statusCallbackUrl: () => "https://example.com/status",
    twilioSend: async (input) => { sent.push(input); return { ok: true, sid: "manual" }; },
  });
  const input = { to: "+15615550188", body: "test", automated: true };
  assert.equal((await send({ ...input, force: true })).skipped, "Automations are paused.");
  assert.equal(sent.length, 0);
  assert.equal((await send({ ...input, userInitiated: true })).ok, true);
  assert.equal((await send({ ...input, automated: false })).ok, true);
  assert.equal(sent.length, 2);
});

test("automation switch fails closed on missing, disabled, and unreadable settings", async () => {
  for (const [value, error, expected] of [[true, null, true], [false, null, false], [undefined, null, false], [true, { message: "offline" }, false]]) {
    const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: value === undefined ? null : { value }, error }) };
    const enabled = serverFunction("lib/canes/automations.ts", "canesAutomationsEnabled", {
      canesConfigured: () => true, canesDb: () => ({ from: () => query }),
    });
    assert.equal(await enabled(), expected);
  }
});

test("paused email and push paths never reach a delivery provider", async () => {
  const deps = { canesAutomationsEnabled: async () => false };
  for (const name of ["sendCustomerEmail", "sendOwnerNotificationEmail"]) {
    const send = serverFunction("lib/canes/notify.tsx", name, deps);
    assert.equal((await send({})).skipped, "Automations are paused.");
  }
  const push = serverFunction("lib/canes/push.ts", "sendCanesPush", deps);
  assert.equal((await push({})).accepted, 0);
  const drain = serverFunction("lib/canes/push.ts", "drainCanesPushOutbox", deps);
  assert.equal((await drain()).skipped, "Automations are paused.");
});

test("estimate pause is independent of other automations and still honors the global pause", async () => {
  for (const [global, estimate, expected] of [[true, false, false], [true, undefined, false], [true, true, true], [false, true, false]]) {
    const enabled = serverFunction("lib/canes/automations.ts", "canesAutomationsEnabled", {
      canesConfigured: () => true,
      canesDb: () => ({ from: () => ({
        select() { return this; }, eq(_column, key) { this.key = key; return this; },
        async maybeSingle() { return { data: { value: this.key === "automations_enabled" ? global : estimate }, error: null }; },
      }) }),
    });
    assert.equal(await enabled(), global);
    assert.equal(await enabled("estimate"), expected);
  }
});

test("disabled estimates cannot queue texts or send automatic email, but manual email remains available", async () => {
  const deps = { canesConfigured: () => true, canesAutomationsEnabled: async (scope) => scope !== "estimate" };
  const enqueue = serverFunction("lib/canes/estimates.ts", "enqueueEstimateSend", deps);
  const reminders = serverFunction("lib/canes/estimates.ts", "enqueueEstimateReminders", deps);
  assert.equal(await enqueue({}), false);
  await reminders({});
  const deliveries = [];
  const email = serverFunction("lib/canes/notify.tsx", "notifyEstimateSent", {
    ...deps, React: { createElement: () => ({}) }, EstimateEmail: () => null,
    render: async () => "email", fmtMoney: () => "$100", APP_URL: "https://example.com",
    sendCustomerEmail: async (input) => { deliveries.push(input); return { ok: true }; },
  });
  assert.equal((await email({ id: "estimate" })).skipped, "Estimate automations are paused.");
  assert.equal((await email({ id: "estimate", customer_email: "test@example.com" }, "manual", true)).ok, true);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].userInitiated, true);
});

test("outbox cancels estimate messages while invoice reminders and service agreements still send", async () => {
  const tasks = [
    { id: "estimate", kind: "estimate_send", payload: { estimate_id: "estimate" } },
    { id: "reminder", kind: "estimate_reminder", payload: { estimate_id: "estimate" } },
    { id: "plan", kind: "estimate_send", payload: { plan_id: "plan" } },
    { id: "invoice", kind: "invoice_reminder", payload: { invoice_id: "invoice" } },
  ];
  const writes = [];
  const sent = [];
  const drain = serverFunction("app/api/canes/cron/route.ts", "drainDueTasks", {
    canesDb: () => ({ from: () => ({
      update(value) { this.value = value; return this; },
      eq(column, value) { if (column === "id") this.id = value; return this; },
      in() { return this; }, not() { return this; }, lt() { return this; },
      lte() { return this; }, order() { return this; }, select() { return this; },
      limit() { return this; },
      then(resolve, reject) {
        if (this.value && this.id) writes.push({ id: this.id, ...this.value });
        return Promise.resolve({ data: this.value ? [{ id: this.id }] : tasks }).then(resolve, reject);
      },
    }) }),
    getSettings: async () => ({}), LEAD_MESSAGE_KINDS: [], hasCronBudget: () => true,
    canesAutomationsEnabled: async (scope) => scope !== "estimate",
    getEstimate: async () => { throw new Error("Disabled estimate reached delivery"); },
    getPlan: async () => ({ status: "active", customer_phone: "+15555550101", public_token: "plan" }),
    getInvoice: async () => ({ status: "sent", customer_phone: "+15555550102", public_token: "invoice" }),
    invoicePublicUrl: () => "https://example.com/invoice", APP_URL: "https://example.com",
    sendCanesSms: async (input) => { sent.push(input); return { ok: true }; },
  });
  const result = await drain(Date.now() + 60000);
  assert.equal(result.sent, 2);
  assert.equal(result.canceled, 2);
  assert.deepEqual(sent.map((item) => item.to), ["+15555550101", "+15555550102"]);
  assert.deepEqual(writes.filter((item) => item.status === "canceled").map((item) => item.id), ["estimate", "reminder"]);
});

test("paused cron runs financial safety checks without any business automation", async () => {
  const calls = [];
  const cron = serverFunction("app/api/canes/cron/route.ts", "GET", {
    PUSH_CRON_RESERVE_MS: 27000, PUSH_RECEIPT_RESERVE_MS: 13000,
    process: { env: { CRON_SECRET: "test" } },
    NextResponse: { json: (value) => value }, canesConfigured: () => true,
    canesAutomationsEnabled: async () => false, hasCronBudget: () => true,
    reconcileLegacySquarePaymentHistory: async () => { calls.push("ledger"); },
    retireCreditAdjustedPaymentLinks: async () => { calls.push("payment-links"); },
    processCanesPushReceipts: async () => { calls.push("receipts"); },
  });
  const result = await cron({ headers: new Headers({ authorization: "Bearer test" }) });
  assert.equal(result.automations, "paused");
  assert.deepEqual(calls, ["ledger", "payment-links", "receipts"]);
});

test("photo uploads require permission and MMS-compatible content before storage", async () => {
  const writes = [];
  let denied = { ok: false, notice: "Not allowed" };
  const validate = serverFunction("lib/canes/message-media.ts", "validateMessageMedia", { MESSAGE_MEDIA_MIME_TYPES: ["image/jpeg", "image/png"], MESSAGE_MEDIA_MAX_BYTES: 4 * 1024 * 1024 });
  const send = serverFunction("app/CanesPressure/actions.ts", "sendPhotoMessage", {
    canesConfigured: () => true,
    denyUnlessPermitted: async () => denied,
    toE164: () => "+15615550188",
    validateMessageMedia: validate,
    storeMessageMedia: async () => { writes.push("upload"); return { path: "messages/photo.jpg", ref: "canes-storage://canes-message-media/messages/photo.jpg" }; },
    sendMessageWithMedia: async () => ({ ok: true }),
    removeMessageMedia: async () => writes.push("remove"),
  });
  const form = new FormData();
  form.set("file", new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
  assert.equal((await send("+15615550188", form)).ok, false);
  assert.deepEqual(writes, []);
  denied = null;
  form.set("file", new File(["photo"], "photo.webp", { type: "image/webp" }));
  assert.equal((await send("+15615550188", form)).ok, false);
  assert.deepEqual(writes, []);
  form.set("file", new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
  assert.equal((await send("+15615550188", form)).ok, true);
  assert.deepEqual(writes, ["upload"]);
});

test("browser image authentication preserves the API permission boundary", async () => {
  const file = "app/api/v1/canes/messages/[id]/media/[index]/route.ts";
  const resolve = serverFunction(file, "authenticateMedia", {
    authenticate: async () => null,
    getAdminSession: async () => ({ email: "owner@example.com", scope: "canes" }),
    getTechnicianActor: async () => null,
  });
  assert.equal((await resolve(new Request("https://example.com/media"))).kind, "admin");
  assert.equal(await resolve(new Request("https://example.com/media", { headers: { authorization: "Bearer invalid" } })), null);
  const anonymous = serverFunction(file, "authenticateMedia", {
    authenticate: async () => null, getAdminSession: async () => null, getTechnicianActor: async () => null,
  });
  assert.equal(await anonymous(new Request("https://example.com/media")), null);
});

test("an uncertain MMS response keeps its uploaded image available to the provider", async () => {
  const rawSend = serverFunction("lib/twilio.ts", "sendSms", {
    messagesUrl: () => "https://example.com/messages",
    fetch: async () => { throw new Error("Response timed out"); },
  });
  const provider = await rawSend({ accountSid: "test", authToken: "test", from: "+15615550188", to: "+15555550123", body: "", mediaUrls: ["https://example.com/photo.jpg"] });
  const canesSend = serverFunction("lib/canes/twilio.ts", "sendCanesSms", {
    twilioConfigured: () => true, canesConfigured: () => false,
    checkSmsConsent: async () => null, canesTwilioCreds: () => ({}),
    toE164: (phone) => phone, statusCallbackUrl: () => "https://example.com/status", twilioSend: async () => provider,
  });
  const mediaSend = serverFunction("app/CanesPressure/actions.ts", "sendMessageWithMedia", {
    canesConfigured: () => true, denyUnlessPermitted: async () => null,
    signedMessageMediaUrl: async () => "https://example.com/photo.jpg", sendCanesSms: canesSend,
  });
  const removed = [];
  const photoSend = serverFunction("app/CanesPressure/actions.ts", "sendPhotoMessage", {
    canesConfigured: () => true, denyUnlessPermitted: async () => null,
    toE164: (phone) => phone, validateMessageMedia: () => null,
    storeMessageMedia: async () => ({ path: "messages/photo.jpg", ref: "stored-photo" }),
    sendMessageWithMedia: mediaSend, removeMessageMedia: async (path) => removed.push(path),
  });
  const form = new FormData();
  form.set("file", new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
  const result = await photoSend("+15555550123", form);
  assert.equal(result.ok, false);
  assert.deepEqual(removed, []);
  assert.match(result.notice, /could not be confirmed/);
});

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

function callAction({ denied = null, eventError = null, callError = null, leadStatus = "new" } = {}) {
  const writes = [];
  const source = readFileSync(path.resolve(root, "../../app/CanesPressure/actions.ts"), "utf8");
  const ast = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true);
  const action = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name.text === "logCallOutcome");
  const compiled = ts.transpileModule(action.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = {
    canesConfigured: () => true,
    denyUnlessPermitted: async () => denied,
    getLead: async () => ({ id: "lead", phone: "+15555550123", status: leadStatus }),
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

test("logging a closed call marks a new lead contacted without changing booked work", async () => {
  const fresh = callAction();
  assert.equal((await fresh.run("lead", "closed", "Customer agreed; booking next.")).ok, true);
  assert.equal(fresh.writes.find((write) => write.table === "leads").row.status, "contacted");
  const booked = callAction({ leadStatus: "appointment_set" });
  assert.equal((await booked.run("lead", "closed", "Discussed the booked visit.")).ok, true);
  assert.equal(booked.writes.find((write) => write.table === "leads").row.status, undefined);
});

test("editing an overnight calendar block preserves its Eastern end date", async () => {
  const { state, load } = harness();
  const { CreateEventSheet } = load("../../app/CanesPressure/components/schedule/create-event-sheet.tsx");
  const event = { id: "block", title: "Time off", starts_at: "2026-09-28T03:00:00Z", ends_at: "2026-09-28T05:00:00Z", all_day: false, crew_id: null, kind: "block", notes: "" };
  const renderer = await mount(CreateEventSheet, { crews: [], event, onClose() {} });
  await act(async () => renderer.root.findByProps({ id: "event-title" }).props.onChange({ target: { value: "Updated time off" } }));
  const save = renderer.root.findAllByType("button").find((item) => text(item) === "Save event");
  assert.equal(save.props.disabled, false);
  await act(async () => save.props.onClick());
  const write = state.writes.find((item) => item.action === "updateCalendarEvent");
  assert.equal(write.args[0], "block");
  assert.equal(write.args[1].startIso, "2026-09-28T03:00:00.000Z");
  assert.equal(write.args[1].endIso, "2026-09-28T05:00:00.000Z");
  await act(async () => renderer.unmount());
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
  assert.deepEqual(state.writes[0].args, ["invoice", "quarterly", "2026-09-14", "21:00"]);
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
  assert.deepEqual(state.writes[0].args, ["draft", "quarterly", "2026-09-20", "08:00"]);
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

test("switching invoices changes both the editor and the submitted customer", async () => {
  const { state, load } = harness();
  const invoice = (name) => ({
    id: name, status: "draft", customer_name: name, customer_phone: "+15555550123",
    customer_email: `${name}@example.com`, contact_id: name, job_address: `${name} address`,
    job_name: `${name} job`, adjustment_cents: 0,
    items: [{ id: name, name: `${name} service`, quantity: 1, unit_price_cents: 10000, line_total_cents: 10000 }],
  });
  state.invoices.first = invoice("First");
  state.invoices.second = invoice("Second");
  const Screen = load("app/(owner)/invoice/new.tsx").default;
  const renderer = await mount(Screen);
  state.params = { id: "second" };
  await act(async () => renderer.update(React.createElement(Screen)));
  assert.match(text(button(renderer, "Select customer")), /Second/);
  await act(async () => button(renderer, "Save invoice").props.onPress());
  const update = state.writes.find((write) => write.action === "update");
  assert.equal(update.args[0], "second");
  assert.equal(update.args[1].customerName, "Second");
  assert.equal(state.writes.find((write) => write.action === "saveItems").args[1][0].name, "Second service");
  await act(async () => renderer.unmount());
});
