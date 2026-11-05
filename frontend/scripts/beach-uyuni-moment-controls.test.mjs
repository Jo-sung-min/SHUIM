import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";

const code = ts.transpileModule(await readFile(new URL("../components/beach/UyuniMomentControls.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function elements(tree, predicate) {
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => elements(child, predicate))];
}
function harness(initial = {}) {
  let cursor = 0, dirty = true, tree, now = 10_000;
  const slots = [], effects = [], pending = [], requests = [], opened = [], intervals = new Map(), portals = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { const next = typeof value === "function" ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useId() { const i = cursor++; return slots[i] ??= `id-${i}`; },
    useEffect(fn, deps) { const i = cursor++; if (!effects[i] || !same(effects[i].deps, deps)) pending.push(() => {
      effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const window = Object.assign(new EventTarget(), { innerHeight: 844,
    visualViewport: Object.assign(new EventTarget(), { offsetTop: 0, height: 844 }),
    setInterval(fn) { const id = intervals.size + 1; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); } });
  const document = { body: {}, activeElement: null };
  const ctx = { exports: {}, window, document, Date: { now: () => now }, require(name) {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react-dom") return { createPortal(child, target) { portals.push(target); return child; } };
    if (name === "@/components/Icons") return { IconClose: "svg", IconSparkle: "svg" };
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.runInNewContext(code, ctx);
  const request = (kind, values) => new Promise((resolve, reject) => requests.push({ kind, values, resolve, reject }));
  const props = { disabled: false, busy: false, cooldowns: { sparkler: 0, lantern: 0 }, active: true,
    onSparkler: letter => request("sparkler", [letter]), onLantern: (color, wish) => request("lantern", [color, wish]),
    onOpenChange: open => opened.push(open), ...initial };
  const render = () => { for (let guard = 0; dirty && guard < 20; guard++) {
    cursor = 0; dirty = false; tree = ctx.exports.default(props); pending.splice(0).forEach(effect => effect());
  } return tree; };
  const find = predicate => elements(render(), predicate);
  const button = label => find(node => node.type === "button" && node.props["aria-label"] === label)[0];
  const click = node => node.props.onClick({ currentTarget: { focus() { document.activeElement = "trigger"; } } });
  const input = () => find(node => node.type === "input")[0];
  const write = value => input().props.onChange({ target: { value } });
  const submit = () => find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  const settle = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); render(); } };
  render();
  return { find, button, click, input, write, submit, requests, opened, portals, document, window, render, settle,
    update(next) { Object.assign(props, next); dirty = true; render(); },
    advance(ms) { now += ms; [...intervals.values()].forEach(fn => fn()); render(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); } };
}

test("four letters are explicit actions, portal opens accessibly, and immediate repeated clicks launch once", async () => {
  const h = harness(); h.click(h.button("불꽃 막대"));
  assert.equal(h.find(node => node.props.role === "dialog")[0].props["aria-modal"], "true");
  assert.deepEqual(h.find(node => node.type === "button" && /^불꽃으로 /.test(node.props["aria-label"] ?? "")).map(node => node.props.children), ["L", "O", "V", "E"]);
  assert.ok(h.portals.every(target => target === h.document.body));
  const letter = h.button("불꽃으로 V 그리기"); h.click(letter); h.click(letter); h.render();
  assert.equal(h.requests.length, 1); assert.deepEqual(h.requests[0].values, ["V"]);
  assert.equal(h.button("불꽃으로 L 그리기").props.disabled, true);
  h.requests[0].resolve(true); await h.settle();
  assert.equal(h.find(node => node.props.role === "dialog").length, 0);
  assert.deepEqual(h.opened, [false, true, false]); h.unmount();
});

test("all five named lantern colors remain selectable and only confirmed success clears a wish", async () => {
  const h = harness(); h.click(h.button("소원등"));
  const colors = h.find(node => node.type === "button" && node.props["aria-pressed"] !== undefined);
  assert.deepEqual(colors.map(node => node.props["aria-label"]), ["주황 등", "장밋빛 등", "민트 등", "하늘빛 등", "보라빛 등"]);
  assert.equal(colors.filter(node => node.props["aria-pressed"]).length, 1);
  h.click(h.button("보라빛 등")); h.write("  모두 건강하기  "); h.render();
  const form = h.find(node => node.type === "form")[0]; form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
  assert.equal(h.requests.length, 1); assert.deepEqual(h.requests[0].values, ["violet", "모두 건강하기"]);
  h.requests[0].resolve(false); await h.settle();
  assert.equal(h.input().props.value, "  모두 건강하기  "); assert.equal(h.find(node => node.props.role === "alert").length, 1);
  h.submit(); h.requests[1].resolve(true); await h.settle();
  h.click(h.button("소원등")); assert.equal(h.input().props.value, ""); h.unmount();
});

test("wish limit counts Unicode codepoints, strips forbidden controls, and rejects empty or overlong drafts", async () => {
  const h = harness(); h.click(h.button("소원등"));
  h.write("   "); h.submit(); assert.equal(h.requests.length, 0);
  h.write("🌟".repeat(81)); h.render(); assert.equal(h.input().props["aria-invalid"], true);
  h.submit(); assert.equal(h.requests.length, 0);
  h.write("🌟".repeat(80) + "\u0000\u0085"); h.render();
  assert.equal(h.input().props.value, "🌟".repeat(80)); assert.equal(h.input().props["aria-invalid"], false);
  assert.equal(h.find(node => node.props["aria-label"] === "80자, 최대 80자").length, 1);
  h.submit(); assert.equal(Array.from(h.requests[0].values[1]).length, 80);
  h.requests[0].reject(new Error("network down")); await h.settle();
  assert.equal(h.input().props.value, "🌟".repeat(80)); assert.equal(h.find(node => node.props.role === "alert").length, 1); h.unmount();
});

test("cooldowns and external busy state prevent actions and countdown unlocks at the deadline", () => {
  const h = harness({ cooldowns: { sparkler: 12_500, lantern: 13_000 } });
  const locked = h.button("불꽃 막대, 3초 후 가능"); assert.equal(locked.props.disabled, true);
  h.click(locked); assert.equal(h.find(node => node.props.role === "dialog").length, 0);
  h.advance(3000); assert.equal(h.button("불꽃 막대").props.disabled, false);
  h.click(h.button("불꽃 막대")); h.update({ busy: true });
  h.click(h.button("불꽃으로 L 그리기")); assert.equal(h.requests.length, 0);
  assert.equal(h.button("불꽃으로 L 그리기").props.disabled, true); h.unmount();
});

test("forced hiding and Escape notify the scene while preserving the draft and selected color", () => {
  const h = harness(); h.click(h.button("소원등")); h.write("언제나 함께"); h.click(h.button("민트 등")); h.render();
  h.update({ active: false }); assert.equal(h.find(node => node.props.role === "dialog").length, 0); assert.equal(h.opened.at(-1), false);
  h.update({ active: true }); h.click(h.button("소원등"));
  assert.equal(h.input().props.value, "언제나 함께"); assert.equal(h.button("민트 등").props["aria-pressed"], true);
  let stopped = false, prevented = false;
  h.find(node => node.props.role === "dialog")[0].props.onKeyDown({ key: "Escape", stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } });
  h.render(); assert.ok(stopped && prevented); assert.equal(h.opened.at(-1), false);
  assert.equal(h.document.activeElement, "trigger"); h.unmount();
});

test("the portal follows the visual viewport when the mobile keyboard reduces available height", () => {
  const h = harness(); h.click(h.button("소원등")); h.render();
  Object.assign(h.window.visualViewport, { height: 360, offsetTop: 42 });
  h.window.visualViewport.dispatchEvent(new Event("resize")); h.render();
  const overlay = h.find(node => node.props.className === "backdrop")[0];
  assert.equal(overlay.props.style.height, 360); assert.equal(overlay.props.style.top, 42);
  h.unmount(); assert.equal(h.opened.at(-1), false);
});
