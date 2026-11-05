import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { randomUUID } from "node:crypto";

const compile = text => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const sources = {};
for (const [name, path] of Object.entries({ scene: "components/beach/BeachScene.tsx", joystick: "components/beach/Joystick.tsx",
  continuity: "lib/beach/continuity.ts", net: "lib/beach/net.ts", maps: "lib/beach/maps.ts", appearance: "lib/beach/appearance.ts" })) {
  sources[name] = compile(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function storage(values = new Map()) {
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function eventTarget() {
  const listeners = new Map();
  return { addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, details = {}) { for (const fn of [...listeners.get(type) ?? []]) fn({ type, ...details }); },
    listenerCount: () => [...listeners.values()].reduce((sum, list) => sum + list.size, 0) };
}
function walkElements(tree, visit) {
  if (!React.isValidElement(tree)) return;
  visit(tree); React.Children.forEach(tree.props.children, child => walkElements(child, visit));
}

/** Execute the real component and effects; only the renderer and external HTTP transport are replaced. */
function harness({ sessionStorage = storage(), component = "scene", props = { communityId: "ours", mapId: "uyuni" } } = {}) {
  let now = 1_700_000_000_000, nextTimer = 1, cursor = 0, dirty = true, mounted = false, tree;
  const slots = [], effects = [], pendingEffects = [], timers = new Map(), requests = [], engines = [], refs = new WeakMap();
  const document = Object.assign(eventTarget(), { hidden: false, visibilityState: "visible", body: { style: { overflow: "" } } });
  const localStorage = storage(), navigator = { onLine: true };
  const schedule = (fn, delay, interval = false) => { const id = nextTimer++; timers.set(id, { fn, at: now + delay, delay, interval }); return id; };
  const window = Object.assign(eventTarget(), { sessionStorage, localStorage, location: { search: "" },
    matchMedia: () => ({ matches: false }), setTimeout: (fn, delay = 0) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => schedule(fn, 16), cancelAnimationFrame: id => timers.delete(id) });
  const same = (before, after) => before && after && before.length === after.length && after.every((value, i) => Object.is(value, before[i]));
  const hooks = {
    useId() { const index = cursor++; return slots[index] ??= `test-${index}`; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { const next = typeof value === "function" ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }];
    },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) {
      const index = cursor++, previous = effects[index];
      if (!previous || !same(previous.deps, deps)) pendingEffects.push(() => {
        previous?.cleanup?.(); effects[index] = { deps, cleanup: undefined }; effects[index].cleanup = fn();
      });
    },
  };
  class Engine {
    constructor(canvas, options) {
      this.options = options; this.self = { ...options.spawn, moving: false };
      this.camera = { view: options.view, yaw: options.spawn.yaw, pitch: 0.07, orbitYaw: options.spawn.yaw, restSpot: null };
      this.isLying = false; this.isBenchSeated = false; this.onsenState = { sitting: false, floating: false };
      this.daylightNow = { hour: 12, deepNight: 0 }; this.events = []; engines.push(this);
    }
    getSelf() { return { ...this.self }; }
    getContinuityView() { return { ...this.camera }; }
    restoreVisit(spawn, rest, camera, keepLocal = false) {
      this.events.push(["restore", plain(spawn), rest && plain(rest), camera && plain(camera), keepLocal]);
      if (!keepLocal) Object.assign(this.self, spawn);
      if (rest && rest.pose !== "standing") Object.assign(this.self, rest);
      if (camera) this.camera = { ...camera };
    }
    whenReady() { return Promise.resolve(); }
    start() { this.events.push(["start"]); }
    stop() { this.events.push(["stop"]); this.self.moving = false; }
    dispose() { this.events.push(["dispose"]); }
    setInputPaused() {} setSkin() {} setHourOverride() {} resize() {}
    setFireState(value) { this.events.push(["fire", plain(value)]); }
    applyFireworks() {} select() {} playCare() {}
    applyUyuniMoments(events, serverTime) { this.events.push(["moments", plain(events), serverTime]); }
    applyRest(value) { this.events.push(["rest", plain(value)]); }
    setPlayers(value) { this.events.push(["players", plain(value)]); }
  }
  const env = { window, document, navigator, localStorage, AbortController, AbortSignal, URL, console, Error, crypto: { randomUUID },
    process: { env: { NODE_ENV: "production" } }, performance: { now: () => now - 1_700_000_000_000 },
    Date: class extends Date { static now() { return now; } },
    fetch(path, init) {
      const pending = deferred();
      const request = { path, body: JSON.parse(init.body), init,
        resolve(body, status = 200) { pending.resolve({ ok: status >= 200 && status < 300, status, json: async () => body }); } };
      requests.push(request);
      if (path.endsWith("/suspend") || path.endsWith("/leave")) request.resolve({});
      // Deliberately allow an aborted request to settle later, as a slow transport can.
      return pending.promise;
    },
  };
  function load(name, require = () => { throw new Error("Unexpected runtime import"); }) {
    const context = { ...env, exports: {}, require }; vm.runInNewContext(sources[name], context); return context.exports;
  }
  const continuity = load("continuity"), net = load("net"), maps = load("maps"), appearance = load("appearance");
  const module = load(component, name => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return { default: "a" };
    if (name.endsWith("/net")) return net;
    if (name.endsWith("/continuity")) return continuity;
    if (name.endsWith("/maps")) return maps;
    if (name.endsWith("/appearance")) return appearance;
    if (name.endsWith("/engine")) return { BeachEngine: Engine, webglSupported: () => true };
    if (name.endsWith("/daylight")) return { hourLabel: () => "낮", hourOverride: () => null };
    if (name.endsWith("/assets")) return { assetCssUrl: () => "none" };
    if (name.endsWith("/routes")) return { route: path => path };
    if (name.endsWith("/toast")) return { showToast() {}, toastSuccess() {}, tick() {} };
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    return new Proxy({ default: "section" }, { get: (object, key) => object[key] ?? "i" });
  });
  function render() {
    if (!mounted || !dirty) return; dirty = false; cursor = 0; tree = module.default(props);
    walkElements(tree, element => {
      const ref = element.props.ref;
      if (ref && typeof ref === "object") {
        if (!refs.has(ref)) refs.set(ref, { isConnected: true, focus() {}, contains: () => false,
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), setPointerCapture() {}, releasePointerCapture() {} });
        ref.current = refs.get(ref);
      }
    });
    while (pendingEffects.length) pendingEffects.shift()();
  }
  async function flush() { for (let i = 0; i < 20; i++) { await Promise.resolve(); render(); } }
  return { requests, engines, document, window, navigator, sessionStorage, continuity, net,
    get tree() { return tree; }, get now() { return now; },
    async mount() { mounted = true; render(); await flush(); }, flush,
    async unmount() { mounted = false; for (const effect of effects) effect?.cleanup?.(); await flush(); },
    async visibility(hidden) { document.hidden = hidden; document.visibilityState = hidden ? "hidden" : "visible"; document.emit("visibilitychange"); await flush(); },
    async advance(ms) {
      const end = now + ms;
      for (let steps = 0; steps < 100; steps++) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next; now = timer.at; timers.delete(id);
        if (timer.interval) timers.set(id, { ...timer, at: now + timer.delay });
        timer.fn(); await flush();
      }
      now = end; await flush();
    },
  };
}
const fire = { logs: 0, maxLogs: 12, intensity: 0, color: "amber", colorExpiresAt: null, serverTime: 1_700_000_000_000,
  nextLogBurnAt: null, queueEndsAt: null, queuedPops: 0, powderEnabled: false };
const entry = (extra = {}) => ({ ticket: "visit-1", mapId: "uyuni", sequence: 0, resumed: false,
  me: { id: "user-1", pid: "self", nick: "나", skin: 0 }, count: 1, capacity: 100,
  community: { id: "ours", name: "우리", slug: "ours" }, bounds: { minX: -22, maxX: 22, minZ: -1, maxZ: 55 },
  spawn: { x: 0, z: 3, yaw: 0 }, restEnabled: true, bedEnabled: true, fireEnabled: false, fire, ...extra });
const tick = (request, extra = {}) => ({ sequence: request.body.sequence, serverTime: 1_700_000_000_000,
  players: [], count: 1, received: { comfort: 0, hug: 0, wave: 0 }, events: [], fire, ...extra });
const of = (h, path) => h.requests.filter(request => request.path === `/api/beach/${path}`);
async function joined(h, payload = entry()) { await h.mount(); of(h, "enter")[0].resolve(payload); await h.flush(); return h.engines[0]; }

const moments = (time, events = [], cooldowns = { sparkler: 0, lantern: 0 }) => ({ serverTime: time, uyuniMomentsEnabled: true,
  uyuniMoments: events, uyuniMomentCooldowns: cooldowns });
function momentControls(h) {
  let controls;
  walkElements(h.tree, node => { if (typeof node.props.onLantern === "function") controls = node; });
  assert.ok(controls, "a supported Uyuni visit exposes the actions"); return controls.props;
}

test("uncertain wish launch retains its UUID across same-account mobile reentry and merges one confirmed event", async () => {
  const h = harness(), engine = await joined(h, entry(moments(h.now)));
  const wish = "우리의 내일도 반짝이길";
  const first = momentControls(h).onLantern("rose", wish); await h.flush();
  of(h, "tick").at(-1).resolve(tick(of(h, "tick").at(-1), moments(h.now))); await h.flush();
  const uncertain = of(h, "moments").at(-1); assert.ok(uncertain);
  uncertain.resolve({ error: "연결이 잠시 끊겼어요" }, 500);
  assert.equal(await first, false); await h.flush();
  const event = { id: "00000000-0000-4000-8000-000000000001", kind: "lantern", fromPid: "self", fromNick: "나",
    x: 0, z: 3, yaw: 0, startedAt: h.now, durationMs: 40000, color: "rose", wish };
  await h.visibility(true); await h.advance(10_001); await h.visibility(false); await h.advance(0);
  of(h, "enter").at(-1).resolve(entry({ ...moments(h.now, [event]), ticket: "visit-2", resumed: true, sequence: 3 })); await h.flush();
  // Settle the resumed poll before manually retrying the uncertain action.
  const resumedTick = of(h, "tick").at(-1);
  resumedTick.resolve(tick(resumedTick, moments(h.now, [event]))); await h.flush();
  const retry = momentControls(h).onLantern("rose", wish); await h.flush();
  const pose = of(h, "tick").at(-1); pose.resolve(tick(pose, moments(h.now, [event]))); await h.flush();
  const repeated = of(h, "moments").at(-1);
  assert.equal(repeated.body.requestId, uncertain.body.requestId);
  assert.equal(repeated.body.ticket, "visit-2");
  repeated.resolve({ event, serverTime: h.now, cooldowns: { sparkler: 0, lantern: h.now + 8000 } });
  assert.equal(await retry, true); await h.flush();
  assert.equal(engine.events.filter(e => e[0] === "moments").at(-1)[1].length, 1);
  await h.unmount();
});

test("a late moment acknowledgement cannot restore an event removed by a newer room snapshot", async () => {
  const h = harness(), engine = await joined(h, entry(moments(h.now)));
  const pending = momentControls(h).onSparkler("E"); await h.flush();
  const pose = of(h, "tick").at(-1); pose.resolve(tick(pose, moments(h.now))); await h.flush();
  const launch = of(h, "moments").at(-1), start = h.now;
  await h.advance(1000);
  const poll = of(h, "tick").at(-1); poll.resolve(tick(poll, moments(h.now, []))); await h.flush();
  launch.resolve({ event: { id: "00000000-0000-4000-8000-000000000002", kind: "sparkler", fromPid: "self", fromNick: "나",
    x: 0, z: 3, yaw: 0, startedAt: start, durationMs: 12000, letter: "E" }, serverTime: start,
    cooldowns: { sparkler: start + 4000, lantern: 0 } });
  await pending; await h.flush();
  assert.equal(engine.events.filter(e => e[0] === "moments").at(-1)[1].length, 0);
  await h.unmount();
});

test("an old launch response cannot clear the busy state or request of a same-ticket resumed launch", async () => {
  const h = harness(), engine = await joined(h, entry(moments(h.now)));
  const original = momentControls(h).onSparkler("L"); await h.flush();
  const pose = of(h, "tick").at(-1); pose.resolve(tick(pose, moments(h.now))); await h.flush();
  const oldRequest = of(h, "moments").at(-1);
  await h.visibility(true); await h.visibility(false); await h.advance(0);
  of(h, "enter").at(-1).resolve(entry({ ...moments(h.now), resumed: true, sequence: 3 })); await h.flush();
  const resumed = of(h, "tick").at(-1); resumed.resolve(tick(resumed, moments(h.now))); await h.flush();
  const retry = momentControls(h).onSparkler("L"); await h.flush();
  const nextPose = of(h, "tick").at(-1); nextPose.resolve(tick(nextPose, moments(h.now))); await h.flush();
  const newRequest = of(h, "moments").at(-1);
  assert.equal(newRequest.body.requestId, oldRequest.body.requestId);
  const result = { event: { id: "00000000-0000-4000-8000-000000000003", kind: "sparkler", fromPid: "self", fromNick: "나",
    x: 0, z: 3, yaw: 0, startedAt: h.now, durationMs: 12000, letter: "L" }, serverTime: h.now,
    cooldowns: { sparkler: h.now + 4000, lantern: 0 } };
  oldRequest.resolve(result); assert.equal(await original, false); await h.flush();
  assert.equal(momentControls(h).busy, true, "the old finally cannot unlock the current operation");
  assert.equal(engine.events.filter(e => e[0] === "moments").at(-1)[1].length, 0);
  newRequest.resolve(result); assert.equal(await retry, true); await h.flush();
  assert.equal(momentControls(h).busy, false);
  assert.equal(engine.events.filter(e => e[0] === "moments").at(-1)[1].length, 1);
  await h.unmount();
});

test("launch waits for the ongoing poll, then requires a fresh successful position confirmation", async () => {
  const h = harness(), engine = await joined(h, entry(moments(h.now))); await h.advance(0);
  const oldPose = of(h, "tick").at(-1);
  Object.assign(engine.self, { x: 4, z: -8, yaw: .8 });
  const action = momentControls(h).onSparkler("V"); await h.flush();
  assert.equal(of(h, "moments").length, 0);
  oldPose.resolve(tick(oldPose, moments(h.now))); await h.flush(); await h.advance(40);
  const currentPose = of(h, "tick").at(-1);
  assert.notEqual(currentPose, oldPose);
  assert.equal(currentPose.body.x, 4); assert.equal(currentPose.body.z, -8);
  currentPose.resolve({ error: "연결을 확인하고 있어요" }, 503);
  assert.equal(await action, false); await h.flush();
  assert.equal(of(h, "moments").length, 0, "an unconfirmed position never launches from the stale server pose");
  assert.equal(momentControls(h).busy, false);
  await h.unmount();
});

test("mobile suspension saves the live position, cancels polling and never sends leave", async () => {
  const h = harness(), engine = await joined(h); await h.advance(0);
  const pending = of(h, "tick")[0]; assert.ok(pending);
  Object.assign(engine.self, { x: 8.4, z: 26.7, yaw: 0.8, moving: true });
  engine.camera = { view: "third", yaw: 0.8, pitch: 0.2, orbitYaw: 1.1, restSpot: null };
  await h.visibility(true); h.window.emit("pagehide", { persisted: true }); await h.flush();
  assert.equal(pending.init.signal.aborted, true);
  assert.equal(of(h, "leave").length, 0); assert.equal(of(h, "suspend").length, 1);
  assert.deepEqual(of(h, "suspend")[0].body, { ticket: "visit-1", sequence: 2, x: 8.4, z: 26.7, yaw: 0.8 });
  assert.equal(of(h, "suspend")[0].init.keepalive, true);
  const saved = h.continuity.readBeachVisit("ours", "uyuni");
  assert.equal(saved.ticket, "visit-1"); assert.equal(saved.sequence, 2); assert.deepEqual(plain(saved.camera), engine.camera);
  await h.advance(10_001); assert.equal(of(h, "tick").length, 1, "the background tab cannot keep polling");
  await h.unmount(); assert.equal(of(h, "leave").length, 0, "page destruction after suspension retains the authenticated resume hint");
});

test("an entry that finishes while the app is hidden stays stopped and suspends its new ticket", async () => {
  const h = harness(); await h.mount(); await h.visibility(true);
  of(h, "enter")[0].resolve(entry()); await h.flush(); await h.advance(2000);
  assert.equal(h.engines.length, 1);
  assert.equal(h.engines[0].events.filter(([kind]) => kind === "start").length, 0);
  assert.equal(of(h, "suspend").length, 1); assert.equal(of(h, "tick").length, 0); assert.equal(of(h, "leave").length, 0);
  h.window.emit("pagehide"); await h.unmount();
  assert.equal(of(h, "leave").length, 0);
});

test("returning after suspension reenters the same map with its sequence and keeps the latest local position", async () => {
  const h = harness(), engine = await joined(h);
  Object.assign(engine.self, { x: -10.1, z: 24.3, yaw: 0.8 });
  engine.camera = { view: "third", yaw: 0.8, pitch: 0.2, orbitYaw: 1.1, restSpot: null };
  await h.visibility(true); await h.advance(10_001); await h.visibility(false); await h.advance(0);
  const resumed = of(h, "enter")[1];
  assert.ok(resumed, "resume authenticates membership before sending more movement");
  assert.deepEqual(resumed.body, { communityId: "ours", mapId: "uyuni", resumeTicket: "visit-1", sequence: 1 });
  resumed.resolve(entry({ ticket: "visit-2", sequence: 1, resumed: true, spawn: { x: -10, z: 24, yaw: 0.7 } })); await h.flush();
  const restoration = engine.events.filter(([kind]) => kind === "restore").at(-1);
  assert.equal(restoration[4], true, "a living engine retains movement made since the last server sample");
  assert.deepEqual(restoration[3], engine.camera);
  assert.equal(engine.self.x, -10.1); assert.equal(engine.self.z, 24.3);
  const update = of(h, "tick").at(-1); assert.equal(update.body.ticket, "visit-2"); assert.equal(update.body.sequence, 2);
  update.resolve(tick(update)); await h.flush(); await h.unmount();
});

test("a recreated page uses the tab bookmark and restores camera only for the verified account", async () => {
  for (const sameAccount of [true, false]) {
    const session = storage(), first = harness({ sessionStorage: session }), engine = await joined(first);
    engine.camera = { view: "third", yaw: 0.4, pitch: 0.2, orbitYaw: 0.9, restSpot: "hotel-dawn" };
    await first.visibility(true); first.window.emit("pagehide"); await first.unmount();
    const bookmark = first.continuity.readBeachVisit("ours", "uyuni");
    const next = harness({ sessionStorage: session }); await next.mount();
    const request = of(next, "enter")[0]; assert.equal(request.body.resumeTicket, "visit-1"); assert.equal(request.body.sequence, bookmark.sequence);
    const payload = entry({ ticket: "visit-2", resumed: sameAccount, sequence: sameAccount ? bookmark.sequence : 0,
      spawn: { x: -13.5, z: 24.5, yaw: Math.PI }, me: { id: sameAccount ? "user-1" : "user-2", pid: "next", nick: "나", skin: 0 } });
    request.resolve(payload); await next.flush();
    const restore = next.engines[0].events.find(([kind]) => kind === "restore");
    assert.deepEqual(restore[1], payload.spawn);
    assert.deepEqual(restore[3], sameAccount ? engine.camera : undefined, "another account cannot inherit the previous person's camera");
    await next.unmount(); assert.equal(session.values.size, 0, "explicit route departure clears the tab bookmark");
  }
});

test("cleanup before a pending saved entry resolves cannot leave the bookmarked visit used by a remount", async () => {
  const session = storage(), cancelled = harness({ sessionStorage: session });
  const saved = { version: 1, userId: "user-1", ticket: "bookmarked-visit", sequence: 9, savedAt: cancelled.now,
    camera: { view: "third", yaw: 0.4, pitch: 0.2, orbitYaw: 0.9, restSpot: null } };
  cancelled.continuity.saveBeachVisit("ours", "uyuni", saved);
  await cancelled.mount(); const pending = of(cancelled, "enter")[0];
  assert.equal(pending.body.resumeTicket, saved.ticket); assert.equal(cancelled.engines.length, 0);
  await cancelled.unmount();
  assert.equal(of(cancelled, "leave").length, 0, "an effect that never acquired an engine cannot close an existing server visit");
  assert.deepEqual(plain(cancelled.continuity.readBeachVisit("ours", "uyuni")), saved);

  const resumed = harness({ sessionStorage: session }); await resumed.mount();
  assert.equal(of(resumed, "enter")[0].body.resumeTicket, saved.ticket);
  const response = entry({ ticket: saved.ticket, resumed: true, sequence: 10, spawn: { x: 7, z: 21, yaw: 0.4 } });
  of(resumed, "enter")[0].resolve(response); await resumed.flush();
  pending.resolve(response); await cancelled.flush();
  assert.equal(cancelled.engines.length, 0, "the cancelled entry cannot build a late renderer");
  assert.equal(of(cancelled, "leave").length, 0, "a late response cannot close the remounted visitor's shared ticket");
  assert.equal(resumed.continuity.readBeachVisit("ours", "uyuni").ticket, saved.ticket);
  assert.deepEqual(resumed.engines[0].events.find(([kind]) => kind === "restore")[3], saved.camera);
  await resumed.unmount();
  assert.deepEqual(of(resumed, "leave").map(request => request.body), [{ ticket: saved.ticket }]);
  assert.equal(session.values.size, 0, "the completed visit still leaves normally on explicit departure");
});

test("an expired active ticket retries an authenticated resume instead of resetting to the entrance", async () => {
  const h = harness(), engine = await joined(h); await h.advance(0);
  Object.assign(engine.self, { x: 11.2, z: 28.4, yaw: -0.3 });
  const expired = of(h, "tick")[0]; expired.resolve({}, 410); await h.flush(); await h.advance(1000);
  const request = of(h, "enter")[1];
  assert.deepEqual(request.body, { communityId: "ours", mapId: "uyuni", resumeTicket: "visit-1", sequence: 1 });
  request.resolve(entry({ ticket: "renewed", resumed: true, sequence: 1, spawn: { x: 11, z: 28, yaw: -0.3 } })); await h.flush();
  assert.equal(engine.self.x, 11.2); assert.equal(engine.self.z, 28.4);
  assert.equal(of(h, "tick").at(-1).body.ticket, "renewed");
  await h.unmount();
});

test("a cancelled late tick cannot move actors, apply rest or clear a resumed request guard", async () => {
  const h = harness(), engine = await joined(h); await h.advance(0); const old = of(h, "tick")[0];
  await h.visibility(true); await h.visibility(false); await h.advance(0);
  const reentry = of(h, "enter")[1]; reentry.resolve(entry({ sequence: 2, resumed: true })); await h.flush();
  const fresh = of(h, "tick").at(-1), before = engine.events.length;
  old.resolve(tick(old, { players: [{ pid: "stale" }], selfRest: { pose: "lying", spotId: "hotel-dawn", slot: 0, x: -13.5, z: 24.5, yaw: Math.PI } }));
  await h.flush(); assert.equal(engine.events.length, before, "aborted response cannot touch the scene");
  await h.advance(1500); assert.equal(of(h, "tick").at(-1), fresh, "the cancelled request cannot schedule a concurrent replacement");
  fresh.resolve(tick(fresh, { players: [{ pid: "current" }] })); await h.flush();
  assert.deepEqual(engine.events.filter(([kind]) => kind === "players").at(-1)[1], [{ pid: "current" }]);
  await h.unmount();
});

test("explicit unmount aborts its active request, sends one leave and ignores a late response", async () => {
  const h = harness(), engine = await joined(h); await h.advance(0); const pending = of(h, "tick")[0];
  await h.unmount(); assert.equal(pending.init.signal.aborted, true);
  assert.deepEqual(of(h, "leave").map(request => request.body), [{ ticket: "visit-1" }]);
  assert.equal(h.sessionStorage.values.size, 0);
  assert.equal(h.document.listenerCount(), 0); assert.equal(h.window.listenerCount(), 0);
  const before = engine.events.length; pending.resolve(tick(pending, { players: [{ pid: "late" }] })); await h.flush();
  assert.equal(engine.events.length, before);
});

test("the joystick releases a held pointer on app suspension and does not resume walking by itself", async () => {
  const movement = [], h = harness({ component: "joystick", props: { onMove: (x, y) => movement.push([x, y]) } });
  await h.mount();
  const target = { setPointerCapture() {} };
  h.tree.props.onPointerDown({ pointerId: 7, currentTarget: target, clientX: 50, clientY: 0 }); await h.flush();
  assert.deepEqual(movement.at(-1), [0, 1]);
  await h.visibility(true); assert.deepEqual(movement.at(-1), [0, 0]);
  await h.visibility(false); const count = movement.length;
  h.tree.props.onPointerMove({ pointerId: 7, currentTarget: target, clientX: 90, clientY: 50 }); await h.flush();
  assert.equal(movement.length, count, "the frozen pointer no longer owns the pad");
  await h.unmount(); assert.deepEqual(movement.at(-1), [0, 0]);
});
