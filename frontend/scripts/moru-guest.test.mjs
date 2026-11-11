import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

test("guests see only a closed window linking to login, without pet stats or journal", () => {
  const source = readFileSync(new URL("../components/MoruPet.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const empty = () => null;
  const mockRequire = (name) => {
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
    if (name === "./ui") return { Sheet: empty };
    if (name === "./MoruRoom") return { ROOM_SCENES: [] };
    if (name === "@/lib/pet") return { EMPTY_ANSWERS: {} };
    if (name === "@/lib/storage" || name === "@/lib/auth") return {};
    return empty;
  };
  vm.runInNewContext(js, { require: mockRequire, module, exports: module.exports });
  const html = renderToStaticMarkup(React.createElement(module.exports.default, { userId: null }));
  assert.match(html, /href="\/auth"/);
  assert.match(html, /나를 찾아줘/);
  assert.match(html, /closedWindow/);
  assert.doesNotMatch(html, /progressbar|행복도|이사하기|textarea|방문포인트/);
});
