import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const compile = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const apiCode = compile(await readFile(new URL("../lib/admin-users.ts", import.meta.url), "utf8"));
const uiCode = compile(await readFile(new URL("../app/admin/UsersAdmin.tsx", import.meta.url), "utf8"));
const circleCode = compile(await readFile(new URL("../lib/circles.ts", import.meta.url), "utf8"));
const sample = (extra = {}) => ({ id: "member-1", nick: "따뜻한 회원", createdAt: Date.parse("2024-01-01T00:00:00Z"), registeredAt: Date.parse("2026-11-05T00:00:00Z"), signupMethods: ["email"], status: "active", memberType: "member", admin: false, ...extra });
const page = (users = [sample()], extra = {}) => ({ users, total: users.length, page: 0, pageSize: 30, ...extra });
const plain = (value) => JSON.parse(JSON.stringify(value));
function api(fetch) { const ctx = { exports: {}, fetch, URLSearchParams, Intl, Error }; vm.runInNewContext(apiCode, ctx); return ctx.exports; }
const library = api(() => assert.fail("unexpected request"));
const ok = (body) => ({ ok: true, json: async () => body });
function elements(tree, predicate) {
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap((child) => elements(child, predicate))];
}

test("list queries use literal encoded nicknames, server paging, authenticated uncached requests and cancellation", async () => {
  const controller = new AbortController();
  const client = api(async (path, options) => {
    assert.equal(path, "/api/admin/users?q=%EA%B0%80%25_%21&page=2");
    assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store"); assert.equal(options.signal, controller.signal);
    return ok(page([sample()], { page: 2, total: 61 }));
  });
  assert.equal((await client.fetchAdminUsers(" 가%_! ", 2, controller.signal)).users[0].id, "member-1");
});

test("member type updates send no role or authority and use the returned server state", async () => {
  const client = api(async (path, options) => {
    assert.equal(path, "/api/admin/users/member%2Fone/member-type"); assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), { memberType: "keeper" });
    return ok({ user: sample({ id: "member/one", memberType: "keeper", admin: false }) });
  });
  const updated = await client.setAdminMemberType("member/one", "keeper");
  assert.equal(updated.memberType, "keeper"); assert.equal(updated.admin, false);
  await assert.rejects(client.setAdminMemberType("member/one", "admin"), /회원 유형/);
});

test("bad responses cannot expose extra fields, invent dates or silently accept another member", async () => {
  const client = api(async () => ok(page([sample({ passwordHash: "fake-only", email: "private@example.test" })])));
  const result = (await client.fetchAdminUsers()).users[0];
  assert.equal("passwordHash" in result, false); assert.equal("email" in result, false);
  for (const extra of [{ registeredAt: undefined }, { memberType: "admin" }, { signupMethods: [] }, { createdAt: -1 }]) {
    await assert.rejects(api(async () => ok(page([sample(extra)]))).fetchAdminUsers(), /정보를 확인/);
  }
  await assert.rejects(api(async () => ok({ user: sample({ id: "someone-else" }) })).setAdminMemberType("member-1", "partner"), /변경한 회원/);
  await assert.rejects(api(async () => ({ ok: false, json: async () => ({ error: "관리자만 확인할 수 있어요" }) })).fetchAdminUsers(), /관리자만/);
});

test("known signup times use KST and historical account creation is explicitly distinguished", () => {
  const known = library.adminUserDate(sample({ registeredAt: Date.parse("2026-11-04T15:30:00Z") }));
  assert.equal(known.label, "가입일"); assert.match(known.text, /2026\. 11\. 05\./); assert.match(known.text, /00:30/);
  const historical = library.adminUserDate(sample({ registeredAt: null }));
  assert.equal(historical.label, "계정 생성일"); assert.equal(historical.timestamp, sample().createdAt);
});

function loadUi(hooks = React, client = library, circle = () => assert.fail("unexpected circle creation"), status = async () => ({ enabled: true })) {
  const ctx = { exports: {}, AbortController, Error, require(name) {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return { default: "a" };
    if (name === "@/lib/admin-users") return client;
    if (name === "@/lib/circles") return { createPrivateTestCircle: circle, fetchPrivateTestStatus: status };
    if (name === "@/lib/routes") return { route: path => `/r${path}` };
    if (name === "@/components/ui") return { Hero: "header", LoadError: "aside", SkeletonScreen: "progress" };
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.runInNewContext(uiCode, ctx); return ctx.exports;
}

test("cards expose understandable metadata, lock pending saves and keep membership distinct from admin", () => {
  const { UserCard } = loadUi();
  const values = [];
  const tree = UserCard({ user: sample({ registeredAt: null, signupMethods: ["kakao"], admin: true }), draft: "partner", busy: false,
    saving: false, onDraft: value => values.push(value), onSave() {}, selectable: false, selected: false, onSelect() {} });
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /계정 생성일/); assert.match(markup, /카카오/); assert.match(markup, /관리자/); assert.match(markup, /회원 유형/);
  assert.match(markup, /정확한 가입일 대신/);
  const select = elements(tree, node => node.type === "select")[0];
  select.props.onChange({ target: { value: "keeper" } }); assert.deepEqual(values, ["keeper"]);
  assert.deepEqual(elements(tree, node => node.type === "option").map(node => node.props.value), ["member", "partner", "keeper"]);
  const locked = UserCard({ user: sample(), draft: "partner", busy: true, saving: true, onDraft() {}, onSave() {}, selectable: true, selected: false, onSelect() {} });
  assert.ok(elements(locked, node => node.type === "button" || node.type === "select").every(node => node.props.disabled));
});

function harness({ status = true, statusError = false } = {}) {
  let cursor = 0, dirty = true, tree;
  const slots = [], effects = [], pending = [], requests = [], circleRequests = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!effects[i] || !same(effects[i].deps, deps)) pending.push(() => {
      effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const client = api((path, options) => new Promise(resolve => requests.push({ path, options, resolve: (body, status = 200) => resolve({ ok: status === 200, status, json: async () => body }) })));
  const component = loadUi(hooks, client, peerId => new Promise((resolve, reject) => circleRequests.push({ peerId, resolve, reject })),
    async () => { if (statusError) throw new Error("unavailable"); return { enabled: status }; });
  const render = () => { for (let guard = 0; dirty && guard < 20; guard++) {
    cursor = 0; dirty = false; tree = component.default({ currentUserId: "self" }); pending.splice(0).forEach(effect => effect());
  } return tree; };
  const settle = async () => { for (let i = 0; i < 12; i++) { await Promise.resolve(); render(); } };
  const find = predicate => elements(render(), predicate);
  const button = text => find(node => node.type === "button" && node.props.children === text)[0];
  const cards = () => find(node => node.type === component.UserCard);
  render();
  return { requests, circleRequests, render, settle, find, button, cards, unmount() { effects.forEach(effect => effect?.cleanup?.()); } };
}

test("search resets pagination and aborts the previous page request", async () => {
  const h = harness();
  h.requests[0].resolve(page([sample()], { total: 31 })); await h.settle();
  h.button("다음").props.onClick(); h.render();
  assert.match(h.requests[1].path, /page=1$/);
  h.requests[1].resolve(page([sample({ nick: "다음 페이지" })], { total: 31, page: 1 })); await h.settle();
  h.find(node => node.type === "input")[0].props.onChange({ target: { value: "새로운" } }); h.render();
  h.find(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} }); h.render();
  assert.match(h.requests[2].path, /page=0$/);
  assert.equal(h.requests[1].options.signal.aborted, true);
  h.requests[2].resolve(page([sample({ nick: "새로운 회원" })])); await h.settle();
  assert.equal(h.cards()[0].props.user.nick, "새로운 회원");
  h.unmount(); assert.equal(h.requests[2].options.signal.aborted, true);
});

test("late first-load response after unmount is ignored and no mutation is issued automatically", async () => {
  const h = harness(); h.unmount();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(page()); await h.settle();
  assert.equal(h.cards().length, 0); assert.equal(h.circleRequests.length, 0);
});

test("type save is single-flight, preserves the old state on failure, and accepts only server success", async () => {
  const h = harness(); h.requests[0].resolve(page()); await h.settle();
  h.cards()[0].props.onDraft("partner"); h.render();
  const save = h.cards()[0].props.onSave; save(); save(); h.render();
  assert.equal(h.requests.length, 2); assert.equal(h.cards()[0].props.saving, true);
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { memberType: "partner" });
  h.requests[1].resolve({ error: "저장할 수 없어요" }, 403); await h.settle();
  assert.equal(h.cards()[0].props.user.memberType, "member"); assert.equal(h.cards()[0].props.draft, "partner");
  h.cards()[0].props.onSave(); h.requests[2].resolve({ user: sample({ memberType: "partner" }) }); await h.settle();
  assert.equal(h.cards()[0].props.user.memberType, "partner"); assert.equal(h.cards()[0].props.user.admin, false);
});

test("private test circle needs a different active member, explicit submit, and prevents double creation", async () => {
  const h = harness(); h.requests[0].resolve(page([sample({ id: "self" }), sample({ id: "blocked", status: "blocked" }), sample()])); await h.settle();
  assert.deepEqual(h.cards().map(card => card.props.selectable), [false, false, true]);
  assert.equal(h.button("테스트 소로우 만들기").props.disabled, true);
  h.cards()[2].props.onSelect(); h.render(); assert.equal(h.circleRequests.length, 0);
  const create = h.button("테스트 소로우 만들기").props.onClick; create(); create(); h.render();
  assert.equal(h.circleRequests.length, 1); assert.equal(h.circleRequests[0].peerId, "member-1");
  assert.equal(h.button("만드는 중…").props.disabled, true);
  h.circleRequests[0].resolve({ slug: "our-private", name: "헤송민의 소로우" }); await h.settle();
  assert.equal(h.find(node => node.type === "a")[0].props.href, "/r/c/our-private");
  assert.equal(h.button("테스트 소로우 만들기").props.disabled, true);
});

test("disabled or unavailable creation stays closed while member type settings still work", async () => {
  for (const options of [{ status: false }, { statusError: true }]) {
    const h = harness(options); h.requests[0].resolve(page()); await h.settle();
    assert.equal(h.cards()[0].props.selectable, false);
    assert.equal(h.button("테스트 소로우 만들기"), undefined);
    h.cards()[0].props.onDraft("keeper"); h.render(); h.cards()[0].props.onSave();
    h.requests[1].resolve({ user: sample({ memberType: "keeper" }) }); await h.settle();
    assert.equal(h.cards()[0].props.user.memberType, "keeper"); assert.equal(h.circleRequests.length, 0);
  }
});

test("creation availability is read fresh with authentication and only an explicit boolean is accepted", async () => {
  for (const enabled of [true, false, undefined, "true"]) {
    const controller = new AbortController();
    const ctx = { exports: {}, URLSearchParams, Error, require: () => ({}), fetch: async (url, options) => {
      assert.equal(url, "/api/circles/private-test/status"); assert.equal(options.method, "GET");
      assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin"); assert.equal(options.signal, controller.signal);
      return ok({ enabled });
    } };
    vm.runInNewContext(circleCode, ctx);
    if (typeof enabled === "boolean") assert.deepEqual(plain(await ctx.exports.fetchPrivateTestStatus(controller.signal)), { enabled });
    else await assert.rejects(ctx.exports.fetchPrivateTestStatus(controller.signal), /상태를 확인하지 못했어요/);
  }
});
