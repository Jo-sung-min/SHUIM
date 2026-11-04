import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const typed = await readFile(new URL("../lib/admin-quotes.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const sample = (extra = {}) => ({ id: "quote-1", text: "잠시 쉬어도 괜찮아요.", author: "테스트 저자", source: "검증용 문헌", sourceUrl: "https://example.org/source", theme: "휴식", kind: "paraphrase", enabled: false, reviewedAt: null, createdAt: 1000, updatedAt: 2000, ...extra });
function setup(network = async () => ({ ok: true, json: async () => ({ quotes: [] }) })) {
  const ctx = { fetch: network, URL, Error };
  vm.runInNewContext(`${source}\nglobalThis.api = { AdminQuoteError, fetchAdminQuotes, saveAdminQuote, setAdminQuoteUsage, quoteStatus, quoteDraft, quoteSourceLink, filterQuotes, validateQuoteDraft, QUOTE_STATUS_LABELS, QUOTE_KIND_LABELS, QUOTE_LIMITS };`, ctx);
  return ctx.api;
}
const api = setup();

test("list requests stay authenticated and uncached, and preserve the server's review state", async () => {
  const quote = sample();
  const client = setup(async (url, options) => {
    assert.equal(url, "/api/admin/quotes");
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => ({ quotes: [quote] }) };
  });
  assert.equal((await client.fetchAdminQuotes())[0], quote);
});

test("new content is POSTed and edits are PUT without accidentally sending approval fields", async () => {
  const calls = [];
  const client = setup(async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => ({ quote: sample() }) };
  });
  const draft = sample({ text: "  확인한 문장  ", enabled: true, reviewedAt: 777 });
  await client.saveAdminQuote(draft);
  await client.saveAdminQuote(draft, "quote/one");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "/api/admin/quotes");
  assert.equal(calls[1].method, "PUT");
  assert.equal(calls[1].url, "/api/admin/quotes/quote%2Fone");
  const body = JSON.parse(calls[1].body);
  assert.equal(body.text, "확인한 문장");
  assert.deepEqual(Object.keys(body).sort(), ["author", "kind", "source", "sourceUrl", "text", "theme"]);
});

test("usage approval includes the exact reviewed version and returns the authoritative replacement", async () => {
  const approved = sample({ enabled: true, reviewedAt: 3000, updatedAt: 3001 });
  const client = setup(async (url, options) => {
    assert.equal(url, "/api/admin/quotes/quote-1/usage");
    assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), { enabled: true, expectedUpdatedAt: 2000 });
    return { ok: true, json: async () => ({ quote: approved }) };
  });
  assert.equal(await client.setAdminQuoteUsage("quote-1", true, 2000), approved);
});

test("authorization failures and stale approvals remain actionable errors", async () => {
  for (const status of [403, 409]) {
    const client = setup(async () => ({ ok: false, status, json: async () => ({ error: "다시 확인해 주세요" }) }));
    await assert.rejects(client.setAdminQuoteUsage("quote-1", true, 2000), (error) => error.status === status && /다시 확인/.test(error.message));
  }
});

test("an enabled but unreviewed response cannot become an approved card", async () => {
  const client = setup(async () => ({ ok: true, json: async () => ({ quote: sample({ enabled: true }) }) }));
  await assert.rejects(client.setAdminQuoteUsage("quote-1", true, 2000), /명언 정보를 확인/);
});

test("review filters separate pending, enabled and disabled and combine with search and theme", () => {
  const quotes = [sample(), sample({ id: "enabled", enabled: true, reviewedAt: 3000, theme: "용기" }), sample({ id: "disabled", reviewedAt: 3000 })];
  assert.equal(api.filterQuotes(quotes, "", "", "pending")[0].id, "quote-1");
  assert.equal(api.filterQuotes(quotes, "", "", "enabled")[0].id, "enabled");
  assert.equal(api.filterQuotes(quotes, "테스트 문헌", "휴식", "disabled")[0].id, "disabled");
  assert.equal(api.filterQuotes(quotes, "없는 문장", "", "all").length, 0);
  assert.equal(api.filterQuotes(quotes, "", "용기", "pending").length, 0);
});

test("invalid source URLs cannot be linked or sent and required fields stay bounded", async () => {
  for (const sourceUrl of ["javascript:alert(1)", "data:text/plain,source", "/relative", "https://user:password@example.org/source"]) {
    assert.equal(api.quoteSourceLink(sourceUrl), null);
    assert.throws(() => api.validateQuoteDraft(sample({ sourceUrl })), /출처 링크/);
  }
  for (const extra of [{ text: " " }, { author: "x".repeat(101) }, { theme: "x".repeat(61) }, { kind: "unknown" }]) {
    assert.throws(() => api.validateQuoteDraft(sample(extra)));
  }
});

const componentSource = await readFile(new URL("../app/admin/QuoteAdmin.tsx", import.meta.url), "utf8");
const componentCode = ts.transpileModule(componentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const component = { exports: {}, require: (name) => {
  if (name === "react") return React;
  if (name === "react/jsx-runtime") return jsxRuntime;
  if (name === "@/lib/admin-quotes") return api;
  if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
  return {};
} };
vm.runInNewContext(componentCode, component);
const { QuoteCard } = component.exports;
function elements(tree, type) {
  if (!React.isValidElement(tree)) return [];
  return [...(tree.type === type ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap((child) => elements(child, type))];
}

test("pending card keeps its approval unchecked and visibly distinguishes paraphrase and source", () => {
  const actions = [];
  const tree = QuoteCard({ quote: sample(), busy: false, saving: false, onEdit: () => {}, onUsage: (value) => actions.push(value) });
  const html = renderToStaticMarkup(tree);
  const checkbox = elements(tree, "input")[0];
  assert.equal(checkbox.props.checked, false);
  assert.match(html, /검수 대기/);
  assert.match(html, /의역/);
  assert.match(html, /검증용 문헌/);
  assert.match(html, /출처 원문 확인/);
  assert.equal(elements(tree, "a")[0].props.rel, "noopener noreferrer");
  const reject = elements(tree, "button").find((button) => button.props.children === "미사용으로 검수");
  assert.ok(reject, "pending quotes can be reviewed without ever enabling them");
  reject.props.onClick();
  assert.deepEqual(actions, [false]);
});

test("a checked card allows disabling and saving locks both usage and content edits", () => {
  const actions = [];
  const quote = sample({ enabled: true, reviewedAt: 3000, kind: "translation" });
  const tree = QuoteCard({ quote, busy: false, saving: false, onEdit: () => {}, onUsage: (value) => actions.push(value) });
  const input = elements(tree, "input")[0];
  assert.equal(input.props.checked, true);
  input.props.onChange({ target: { checked: false } });
  assert.deepEqual(actions, [false]);
  assert.match(renderToStaticMarkup(tree), /번역/);
  const locked = QuoteCard({ quote, busy: true, saving: true, onEdit: () => {}, onUsage: () => {} });
  assert.equal(elements(locked, "input")[0].props.disabled, true);
  assert.equal(elements(locked, "button")[0].props.disabled, true);
});

test("unsafe imported source links never become clickable markup", () => {
  const tree = QuoteCard({ quote: sample({ sourceUrl: "javascript:alert(1)" }), busy: false, saving: false, onEdit: () => {}, onUsage: () => {} });
  assert.equal(elements(tree, "a").length, 0);
});

test("the editor stays closed without a browser document and opens in the body above the bottom navigation", () => {
  const state = [];
  const portals = [];
  let index = 0;
  const hooks = {
    useState: (initial) => {
      const slot = index++;
      if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
      return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }];
    },
    useRef: (value) => ({ current: value }), useCallback: (callback) => callback, useEffect: () => {},
  };
  const ctx = { exports: {}, require: (name) => {
    if (name === "react") return hooks;
    if (name === "react-dom") return { createPortal: (tree, container) => { portals.push({ tree, container }); return null; } };
    return component.require(name);
  } };
  vm.runInNewContext(componentCode, ctx);
  const render = () => { index = 0; return ctx.exports.default(); };
  const closed = render();
  assert.equal(portals.length, 0, "initial server render must not need document.body");
  const add = elements(closed, "button").find((button) => React.Children.toArray(button.props.children).includes(" 명언 추가"));
  assert.ok(add);
  ctx.document = { body: { nodeName: "BODY" } };
  add.props.onClick();
  render();
  assert.equal(portals.length, 1);
  assert.equal(portals[0].container, ctx.document.body);
  assert.equal(portals[0].tree.props.open, true);
  const save = elements(portals[0].tree, "button").find((button) => button.props.type === "submit");
  assert.equal(save.props.children, "검수 대기로 저장");
  portals[0].tree.props.onClose();
  render();
  assert.equal(portals.length, 1, "closing the editor removes the portal");
});

test("conflicting approval refreshes edited content without retrying approval or applying a local success", async () => {
  const ast = ts.createSourceFile("QuoteAdmin.tsx", componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let usage;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "usage") usage = node.initializer; ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(usage);
  const current = sample({ text: "다른 관리자가 수정한 문장", updatedAt: 5000 });
  const state = {};
  let approvals = 0;
  const ctx = {
    Error,
    AdminQuoteError: api.AdminQuoteError, locked: { current: false }, mounted: { current: true },
    setBusy: (value) => { state.busy = value; }, setError: (value) => { state.error = value; }, setSuccess: (value) => { state.success = value; },
    setAdminQuoteUsage: async (_id, _enabled, version) => { approvals++; assert.equal(version, 2000); throw new api.AdminQuoteError("내용이 변경됐어요. 다시 검수해 주세요.", 409); },
    fetchAdminQuotes: async () => [current], setQuotes: (value) => { state.quotes = value; }, update: () => assert.fail("must not apply a failed approval"),
  };
  vm.runInNewContext(ts.transpileModule(`globalThis.run = ${usage.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  await ctx.run(sample(), true);
  assert.equal(approvals, 1);
  assert.equal(state.quotes[0], current);
  assert.match(state.error, /다시 검수/);
  assert.equal(state.success, null);
  assert.equal(state.busy, null);
  assert.equal(ctx.locked.current, false);
});
