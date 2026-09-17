// Run with: node scripts/test-pwa-notification.cjs
// Uses the project's TypeScript dependency and Node's built-in test runner.
// Browser APIs and React hooks are simulated; no real push messages are sent.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(process.env.PWA_TEST_SOURCE_ROOT || path.join(__dirname, ".."));
const compiled = new Map();
function load(relative, globals, imports = {}) {
  if (!compiled.has(relative)) {
    const result = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
      fileName: relative,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    assert.equal(result.diagnostics?.length || 0, 0, `Syntax errors in ${relative}`);
    compiled.set(relative, result.outputText);
  }
  const module = { exports: {} };
  vm.runInNewContext(compiled.get(relative), {
    ...globals, module, exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
  }, { filename: relative });
  return module.exports;
}

function browser(options = {}) {
  let mode = options.mode || "browser";
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const media = new Map();
  window.matchMedia = query => {
    if (!media.has(query)) {
      const target = new EventTarget();
      Object.defineProperty(target, "matches", { get: () => query === `(display-mode: ${mode})` });
      media.set(query, target);
    }
    return media.get(query);
  };
  const payload = { endpoint: "https://push.example.invalid/test", keys: { p256dh: "test-key", auth: "test-auth" } };
  const subscription = { endpoint: payload.endpoint, toJSON: () => payload };
  const pushManager = {
    getSubscription: async () => options.hasSubscription === false ? null : subscription,
    subscribe: async () => subscription,
  };
  const navigator = {
    standalone: Boolean(options.iosStandalone), userAgent: "test", platform: "test", maxTouchPoints: 0,
    serviceWorker: { ready: Promise.resolve({ pushManager }) },
  };
  const Notification = {
    permission: options.permission || "granted",
    requestPermission: async () => { Notification.permission = options.requestPermission || "granted"; return Notification.permission; },
  };
  Object.assign(window, {
    navigator, Notification, PushManager: function PushManager() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    atob: value => Buffer.from(value, "base64").toString("binary"),
  });
  if (options.unsupported) delete window.PushManager;
  const globals = { window, document, navigator, Notification, Event, setTimeout, clearTimeout, URL, Uint8Array };
  const pwa = load("client/src/lib/pwaInstall.ts", globals);
  return {
    ...globals, pwa, globals,
    setMode(next) {
      const previous = new Map([...media].map(([query, target]) => [query, target.matches]));
      mode = next;
      for (const [query, target] of media) if (previous.get(query) !== target.matches) target.dispatchEvent(new Event("change"));
    },
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
function notifications(options = {}) {
  const env = browser(options);
  const slots = [];
  let cursor = 0;
  let effects = [];
  let testOptions;
  let rootElement;
  const cleanup = [];
  const writes = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: factory => factory(),
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) effects.push(effect);
      slots[index] = dependencies;
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const mutation = { mutateAsync: async input => {
    writes.push(input);
    if (options.registrationError) throw new Error("Registration unavailable");
    return options.registrationResult || { success: true, studentCount: 1 };
  } };
  const api = load("client/src/components/PwaInstallPrompt.tsx", env.globals, {
    "react": react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/dialog": {},
    "@/_core/hooks/useAuth": { useAuth: () => ({ user: options.admin ? { role: "admin" } : undefined, loading: false }) },
    "@/lib/pwaInstall": env.pwa,
    "@/lib/parentPushState": load("client/src/lib/parentPushState.ts", env.globals),
    "@shared/pwaInstallRules": { detectPwaInstallEnvironment: () => ({ isIos: Boolean(options.ios), isAndroid: !options.ios }), getManualInstallInstruction: () => "" },
    "lucide-react": { Bell: "svg", Chrome: "svg", Download: "svg", Smartphone: "svg" },
    "sonner": { toast: { success() {}, error() {}, info() {} } },
    "@/lib/trpc": { trpc: { academy: { parentPush: {
      config: { useQuery: () => ({ data: { available: options.available !== false, publicKey: "AA" } }) },
      subscribe: { useMutation: () => mutation },
      unsubscribe: { useMutation: () => ({ mutateAsync: async () => { throw new Error("Unexpected unsubscribe"); } }) },
      test: { useMutation: callbacks => {
        testOptions = callbacks;
        return { isPending: false, mutate: () => testOptions.onSuccess({ sent: 1 }) };
      } },
    } } } },
  });
  function render() {
    cursor = 0;
    effects = [];
    const wrapper = api.ParentNotificationPrompt({ token: "test-token" });
    rootElement = wrapper.type(wrapper.props);
    for (const effect of effects) cleanup.push(effect());
    return rootElement;
  }
  function elements(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(item => elements(item));
    return [node, ...elements(node.props?.children)];
  }
  return {
    ...env, writes, render,
    async mount() { render(); await flush(); return render(); },
    button(label) {
      const result = elements(rootElement).find(node => node.type === "button" && node.props.children === label);
      assert.ok(result, `Missing button: ${label}`);
      return result;
    },
    dispose() { for (const fn of cleanup) if (typeof fn === "function") fn(); },
  };
}

for (const mode of ["fullscreen", "standalone", "browser"]) {
  test(`PWA snapshot recognizes ${mode}`, () => {
    assert.equal(browser({ mode }).pwa.getPwaInstallSnapshot().installed, mode !== "browser");
  });
  test(`Registered notifications collapse in ${mode}`, async () => {
    const app = notifications({ mode });
    const element = await app.mount();
    assert.equal(element.type, "details");
    assert.equal(element.props.open, undefined);
    assert.equal(element.key, "configured");
    assert.equal(app.writes.length, 1);
    app.dispose();
  });
}
test("Legacy iOS standalone remains supported", () => {
  assert.equal(browser({ iosStandalone: true }).pwa.getPwaInstallSnapshot().installed, true);
});
test("Installing elsewhere does not mark an ordinary tab as an app", () => {
  const env = browser();
  env.pwa.initializePwaInstallCapture();
  env.window.dispatchEvent(new Event("appinstalled"));
  assert.equal(env.pwa.getPwaInstallSnapshot().installed, false);
});
test("Both display-mode transitions notify subscribers and unsubscribe works", () => {
  const env = browser();
  env.pwa.initializePwaInstallCapture();
  const seen = [];
  const off = env.pwa.subscribePwaInstall(snapshot => seen.push(snapshot.installed));
  env.setMode("fullscreen");
  env.setMode("browser");
  env.setMode("standalone");
  assert.deepEqual(seen, [true, false, true]);
  off();
  env.setMode("browser");
  assert.equal(seen.length, 3);
});
for (const [label, options] of [
  ["permission denied", { permission: "denied" }],
  ["no subscription", { hasSubscription: false }],
  ["registration rejected", { registrationResult: { success: false, studentCount: 1 } }],
  ["no registered student", { registrationResult: { success: true, studentCount: 0 } }],
  ["registration error", { registrationError: true }],
  ["unsupported push", { unsupported: true }],
  ["server unavailable", { available: false }],
]) {
  test(`Setup remains visible: ${label}`, async () => {
    const app = notifications({ mode: "fullscreen", ...options });
    const element = await app.mount();
    assert.equal(element.props.open, true);
    assert.equal(element.key, "setup");
    app.dispose();
  });
}
test("Test receipt question stays open until confirmed", async () => {
  const app = notifications({ mode: "fullscreen" });
  await app.mount();
  app.button("테스트 알림 보내기").props.onClick();
  assert.equal(app.render().props.open, true);
  app.button("네, 받았어요").props.onClick();
  assert.equal(app.render().props.open, undefined);
  app.dispose();
});
test("Permission revocation is detected when the app regains focus", async () => {
  const app = notifications({ mode: "fullscreen" });
  await app.mount();
  app.Notification.permission = "denied";
  app.window.dispatchEvent(new Event("focus"));
  await flush();
  assert.equal(app.render().props.open, true);
  app.dispose();
});
test("Enabling notifications in a browser collapses setup without installing", async () => {
  const app = notifications({ permission: "default", hasSubscription: false });
  await app.mount();
  await app.button("알림 허용").props.onClick();
  assert.equal(app.render().props.open, undefined);
  assert.equal(app.writes.length, 1);
  app.dispose();
});
test("iOS browser still requires opening the installed app before enabling push", async () => {
  const app = notifications({ ios: true, permission: "default" });
  let guides = 0;
  app.window.addEventListener("haemil:open-ios-notification-guide", () => guides++);
  await app.mount();
  await app.button("알림 허용").props.onClick();
  assert.equal(guides, 1);
  assert.equal(app.writes.length, 0);
  assert.equal(app.render().props.open, true);
  app.dispose();
});
test("Admin session does not register or show the guardian prompt", async () => {
  const app = notifications({ admin: true });
  assert.equal(await app.mount(), null);
  assert.equal(app.writes.length, 0);
  app.dispose();
});
