import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";

const code = ts.transpileModule(await readFile(new URL("../components/beach/RoomLightingControls.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const ctx = { exports: {}, require(name) {
  if (name === "react") return { useEffect() {}, useId: () => "room-time", useRef: () => ({ current: null }) };
  if (name === "react/jsx-runtime") return jsxRuntime;
  if (name === "@/components/Icons") return { IconMoon: "svg" };
  if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
  throw new Error(`Unexpected import ${name}`);
} };
vm.runInNewContext(code, ctx);
function elements(tree, predicate) {
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => elements(child, predicate))];
}
function render(extra = {}) {
  const chosen = [];
  const tree = ctx.exports.default({ mode: "auto", open: true, busy: null, disabled: false,
    onOpenChange() {}, onSelect: mode => chosen.push(mode), ...extra });
  const choices = elements(tree, node => node.type === "button" && "aria-pressed" in node.props);
  return { tree, choices, chosen };
}

test("only the garden adds a rainy-night choice without changing the four existing time choices", () => {
  for (const mapId of [undefined, "beach", "uyuni", "bamboo", "cloudspa"]) {
    const h = render({ mapId });
    assert.equal(h.choices.length, 4);
    h.choices.forEach(node => node.props.onClick());
    assert.deepEqual(h.chosen, ["auto", "day", "sunset", "night"]);
  }
  const h = render({ mapId: "garden", mode: "rainy-night" });
  assert.equal(h.choices.length, 5);
  const rain = h.choices[4];
  assert.equal(rain.props["aria-pressed"], true);
  assert.ok(React.Children.toArray(rain.props.children).includes("비 내리는 밤"));
  assert.ok(h.choices.slice(0, 4).every(node => !node.props["aria-pressed"]));
  rain.props.onClick(); assert.deepEqual(h.chosen, ["rainy-night"]);
});

test("rain choices share pending and disconnected locks and stay hidden while the control is closed", () => {
  for (const state of [{ disabled: true }, { busy: "rainy-night" }, { busy: "day" }]) {
    const h = render({ mapId: "garden", ...state });
    assert.ok(h.choices.every(node => node.props.disabled));
  }
  const busy = render({ mapId: "garden", busy: "rainy-night" });
  assert.ok(React.Children.toArray(busy.choices[4].props.children).includes("적용 중"));
  assert.equal(render({ mapId: "garden", open: false }).choices.length, 0);
});

test("garden rain remains available inside the latest hamburger menu", () => {
  const h = render({ mapId: "garden", inline: true, buttonClass: "menu-row" });
  const trigger = elements(h.tree, node => node.type === "button" && node.props["aria-label"] === "방의 시간 조절")[0];
  assert.equal(trigger.props.className, "menu-row");
  assert.equal(elements(h.tree, node => node.props["data-inline"] === true).length, 1);
  h.choices[4].props.onClick(); assert.deepEqual(h.chosen, ["rainy-night"]);
});
