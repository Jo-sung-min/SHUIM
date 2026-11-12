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
  // 손님 화면에서 쓰이지 않는 모듈의 대역: 기본 내보내기는 아무것도 그리지 않는 컴포넌트, 이름 붙은 내보내기는 null 을 돌려주는 함수
  const stub = new Proxy(empty, { get: (target, key) => key === "__esModule" ? false : key === "default" ? target : empty });
  const mockRequire = (name) => {
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
    if (name === "./ui") return { Sheet: empty };
    if (name === "./MoruRoom") return { ROOM_SCENES: [] };
    if (name === "@/lib/pet") return { EMPTY_ANSWERS: {} };
    if (name === "@/lib/storage" || name === "@/lib/auth") return {};
    return stub;
  };
  vm.runInNewContext(js, { require: mockRequire, module, exports: module.exports });
  const html = renderToStaticMarkup(React.createElement(module.exports.default, { userId: null }));
  assert.match(html, /href="\/auth"/);
  assert.match(html, /나를 찾아줘/);
  assert.match(html, /closedWindow/);
  assert.doesNotMatch(html, /progressbar|행복도|이사하기|textarea|방문포인트/);
});

test("a companion the server does not list yet (Moring on an older backend) is not offered", () => {
  const source = readFileSync(new URL("../components/MoruCompanion.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const empty = () => null;
  vm.runInNewContext(js, { require: (name) => name === "react/jsx-runtime" ? require(name) : name.endsWith(".module.css") ? {} : empty, module, exports: module.exports });
  const ids = (allowed) => module.exports.companionChoices(allowed).map((c) => c.id).join(" ");
  assert.equal(ids(undefined), "moru noa leo lumi"); // 옛 서버: 응답에 appearances 가 없다
  assert.equal(ids(["moru", "noa", "leo", "lumi", "moring"]), "moru noa leo lumi moring");
  assert.equal(ids(["moru"]), "moru"); // 서버가 받아 주는 것만
});
