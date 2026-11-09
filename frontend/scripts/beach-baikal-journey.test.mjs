import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";

async function load(file, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency ${name}`);
  }, ...globals };
  vm.runInNewContext(code, context);
  return context.exports;
}
const layout = await load("../lib/beach/baikal-layout.ts");
const journey = await load("../lib/beach/baikal-journey.ts", { "./baikal-layout": layout });
const { BAIKAL_CABINS: cabins } = layout;
const { advanceBaikalJourney: advance, baikalJourneyDistance: distance, baikalJourneyKey: key, readBaikalJourney: read, saveBaikalJourney: save } = journey;
function memoryStore() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), entries };
}
const porch = cabin => ({ x: cabin.porchMaxX - .5, z: (cabin.doorMinZ + cabin.doorMaxZ) / 2 });

test("only the next shelter's room or porch advances the three-stop journey", () => {
  assert.equal(advance(0, porch(cabins[2])), 0);
  assert.equal(advance(0, porch(cabins[1])), 0);
  let stage = 0;
  for (const cabin of cabins) {
    assert.equal(advance(stage, { x: cabin.minX - .1, z: cabin.z }), stage, "passing the back wall never counts");
    assert.equal(advance(stage, { x: cabin.porchMaxX + .1, z: cabin.z }), stage, "passing on the ice never counts");
    assert.equal(advance(stage, { x: cabin.x, z: cabin.z }), stage + 1, "the interior counts");
    stage = advance(stage, porch(cabin));
    assert.equal(advance(stage, porch(cabin)), stage, "staying at one shelter cannot skip ahead");
  }
  assert.equal(stage, 3);
  assert.equal(advance(stage, layout.BAIKAL_SPAWN), 3);
});

test("invalid positions and stages cannot grant an arrival; distance leads to the lakeside entrance", () => {
  for (const bad of [null, { x: NaN, z: 0 }, { x: 0, z: Infinity }, { x: -Infinity, z: 0 }]) {
    assert.equal(advance(0, bad), 0); assert.equal(distance(0, bad), null);
  }
  for (const invalid of [-1, 1.5, 4, NaN]) { assert.equal(advance(invalid, porch(cabins[0])), 0); assert.equal(distance(invalid, porch(cabins[0])), null); }
  for (let stage = 0; stage < 3; stage++) {
    assert.equal(distance(stage, porch(cabins[stage])), 0);
    assert.equal(distance(stage, { ...porch(cabins[stage]), x: cabins[stage].porchMaxX + 10 }), 15);
  }
  assert.equal(distance(3, porch(cabins[2])), null);
});

test("a journey is isolated by account, community and map and a stale tab cannot lower progress", () => {
  const storage = memoryStore();
  assert.equal(save("alice", "private-room", 2, storage), 2);
  assert.equal(read("alice", "private-room", storage), 2);
  assert.equal(read("bob", "private-room", storage), 0);
  assert.equal(read("alice", "another-room", storage), 0);
  assert.equal(save("alice", "private-room", 1, storage), 2);
  assert.equal(save("alice", "private-room", 3, storage), 3);
  assert.notEqual(key("a:b", "c"), key("a", "b:c"));
  assert.match(key("alice", "private-room"), /:baikal:/);
});

test("malformed, future, mismatched and oversized records are ignored", () => {
  const storage = memoryStore(), good = { version: 1, mapId: "baikal", userId: "alice", communityId: "room", stage: 2 };
  for (const raw of ["{", "null", "[]", "4", JSON.stringify({ ...good, version: 2 }), JSON.stringify({ ...good, mapId: "garden" }), JSON.stringify({ ...good, userId: "bob" }), JSON.stringify({ ...good, communityId: "other" }), ...[-1, 1.5, 4, "3", null].map(stage => JSON.stringify({ ...good, stage })), JSON.stringify({ ...good, padding: "x".repeat(1024) })]) {
    storage.setItem(key("alice", "room"), raw); assert.equal(read("alice", "room", storage), 0, raw.slice(0, 80));
  }
  storage.setItem(key("alice", "room"), JSON.stringify(good));
  assert.equal(read("alice", "room", storage), 2);
});

test("private browsing and unavailable storage still allow a walk to finish without throwing", () => {
  const denied = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
  for (const storage of [null, denied]) { assert.equal(read("alice", "room", storage), 0); assert.equal(save("alice", "room", 3, storage), 3); }
  const storage = memoryStore();
  save("", "room", 2, storage); save("alice", "", 2, storage);
  assert.equal(storage.entries.size, 0);
});

function elements(tree, predicate) {
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(node => elements(node, predicate))];
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!React.isValidElement(tree)) return "";
  return React.Children.toArray(tree.props.children).map(text).join("");
}
async function harness(initialStage = 0) {
  const storage = memoryStore(); save("alice", "room", initialStage, storage);
  const hooks = [], pending = [], intervals = new Map(), timeouts = new Map(), listeners = new Map();
  const applied = [], document = { hidden: false };
  let index = 0, timerId = 0, position = { ...layout.BAIKAL_SPAWN };
  const window = { localStorage: storage,
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; }, clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { timeouts.set(++timerId, fn); return timerId; }, clearTimeout(id) { timeouts.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const react = {
    useId: () => "journey-details",
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useEffect(effect, deps) { const i = index++; if (hooks[i] && deps.every((value, n) => Object.is(value, hooks[i].deps[n]))) return; const previous = hooks[i]; hooks[i] = { deps }; pending.push(() => { previous?.cleanup?.(); hooks[i].cleanup = effect(); }); },
  };
  const Component = (await load("../components/beach/BaikalJourney.tsx", {
    react, "react/jsx-runtime": jsxRuntime, "@/lib/beach/baikal-journey": journey,
    "@/components/Icons": { IconCheck: "svg", IconChevronR: "svg", IconSparkle: "svg" },
    "./BaikalJourney.module.css": { default: new Proxy({}, { get: (_, name) => name }) },
  }, { window, document })).default;
  const props = { engine: { getSelf: () => position, setBaikalJourney: stage => applied.push(stage) }, userId: "alice", communityId: "room", night: true };
  const render = (changes = {}) => { Object.assign(props, changes); index = 0; const tree = Component(props); pending.splice(0).forEach(effect => effect()); return tree; };
  render();
  return { render, storage, applied, document, intervals, listeners, setPosition(value) { position = value; }, tick() { for (const fn of intervals.values()) fn(); },
    cleanup() { for (const hook of hooks) hook?.cleanup?.(); }, expire() { for (const fn of timeouts.values()) fn(); timeouts.clear(); } };
}

test("the guide restores a completed reward without repeating its completion announcement", async () => {
  const h = await harness(3), tree = h.render({ night: false });
  assert.deepEqual(h.applied, [3]);
  assert.match(text(tree), /오로라 여행 완주/);
  assert.match(text(tree), /밤이 오면 관측소 너머로 오로라가 펼쳐져요/);
  assert.equal(text(elements(tree, node => node.props.role === "status")[0]), "");
  const button = elements(tree, node => node.type === "button")[0];
  assert.equal(button.props["aria-expanded"], false); button.props.onClick();
  assert.equal(elements(h.render(), node => node.type === "button")[0].props["aria-expanded"], true);
  h.cleanup(); assert.equal(h.intervals.size, 0); assert.equal(h.listeners.size, 0);
});

test("the guide observes ordered arrival, pauses while disconnected or backgrounded, and leaves movement untouched", async () => {
  const h = await harness();
  h.setPosition(porch(cabins[0])); h.render({ paused: true }); h.tick(); assert.deepEqual(h.applied, [0]);
  h.render({ paused: false }); h.document.hidden = true; h.tick(); assert.deepEqual(h.applied, [0]);
  h.document.hidden = false; h.tick(); assert.deepEqual(h.applied, [0, 1]);
  h.setPosition(porch(cabins[2])); h.tick(); assert.deepEqual(h.applied, [0, 1]);
  h.setPosition(porch(cabins[1])); h.tick();
  h.setPosition(porch(cabins[2])); h.tick();
  assert.deepEqual(h.applied, [0, 1, 2, 3]);
  assert.equal(read("alice", "room", h.storage), 3);
  assert.match(text(elements(h.render(), node => node.props.role === "status")[0]), /完走|완주/);
  assert.equal(h.render({ hidden: true }).props.hidden, true);
  h.cleanup();
});

test("another tab's progress synchronizes only for the same account and room, without downgrading", async () => {
  const h = await harness(1);
  save("alice", "room", 3, h.storage);
  h.listeners.get("storage")({ key: key("bob", "room") }); assert.deepEqual(h.applied, [1]);
  h.listeners.get("storage")({ key: key("alice", "room") }); assert.deepEqual(h.applied, [1, 3]);
  assert.match(text(h.render()), /오로라 여행 완주/);
  h.cleanup();
});
