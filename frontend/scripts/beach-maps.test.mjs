import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { assets } from "./assets-fixture.mjs";

const read = file => readFile(new URL(file, import.meta.url), "utf8");
const mapSource = stripTypeScriptTypes(await read("../lib/beach/maps.ts")).replace(/\bexport\s+(?=function|const)/g, "");
const mapContext = {};
vm.runInNewContext(`${mapSource}\nglobalThis.api = { MAPS, mapHref, mapEyebrow, PUBLIC_SPACE_ID };`, mapContext);
const maps = mapContext.api;
const mapIds = Object.keys(maps.MAPS), mapCount = mapIds.length;
const cardSource = await read("../components/beach/BeachCard.tsx");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function elements(tree, type) {
  if (!React.isValidElement(tree)) return [];
  return [...(tree.type === type ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => elements(child, type))];
}
/** Full rooms render as buttons; the rail's previous/next arrows are buttons too. */
const placeButtons = tree => elements(tree, "button").filter(button => button.props["data-place"]);
const occupancyLabels = tree => elements(tree,"strong").filter(element => typeof element.props.children === "number");

function cardHarness(customCircles, publicSpace) {
  const values = [], effects = [], queued = [], requests = [], pushed = [], remembered = [], toasts = [], consents = [], saves = [];
  let cursor = 0, refresh;
  const hooks = {
    useId: () => "community-choice",
    useRef(initial) { const slot = cursor++; return values[slot] ??= { current: initial }; },
    useCallback(fn) { const slot = cursor++; return values[slot] ??= fn; },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = initial;
      return [values[slot], value => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }];
    },
    useEffect(callback, deps) {
      const slot = cursor++, previous = effects[slot];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) queued.push(() => {
        previous?.cleanup?.(); effects[slot] = { deps, cleanup: callback() };
      });
    },
  };
  const context = {
    exports: {}, Error, window: { setInterval: callback => { refresh = callback; return 1; }, clearInterval() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") return { useRouter: () => ({ push: href => pushed.push(href) }) };
      if (name.endsWith("/consent")) return {
        requestCommunityConsent: () => { const result = deferred(); consents.push(result); return result.promise; },
        requireCommunityConsent: () => { const result = deferred(); saves.push(result); return result.promise; },
      };
      if (name.endsWith("/toast")) return { showToast: (message, options) => toasts.push([message, options?.kind ?? "error"]) };
      if (name.endsWith("/maps")) return maps;
      if (name.endsWith("/assets")) return assets;
      if (name.endsWith("/daylight")) return { currentHour: () => 12, daylightAt: () => ({ skyTop: [0.5, 0.6, 0.7], stars: 0 }) };
      if (name.endsWith("/atlas")) return { CHAR_VIEW: { front: 0, left: 1 } };
      if (name.endsWith("/net")) return { fetchBeachCount: (communityId, mapId) => {
        const result = deferred(); requests.push({ communityId, mapId, ...result }); return result.promise;
      } };
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      return { IconCheck: "i", IconChevronL: "i", IconChevronR: "i", IconLock: "i", IconUsers: "i", rememberBeachReturn() { remembered.push(true); } };
    },
  };
  vm.runInNewContext(compile(cardSource), context);
  let circles = customCircles ?? [{ id: "circle / one", name: "우리", slug: "one", primary: true }, { id: "circle-two", name: "둘", slug: "two" }];
  return { requests, pushed, remembered, toasts, consents, saves, setCircles(next) { circles = next; }, refresh() { refresh(); }, render() {
    cursor = 0; const tree = context.exports.default({ circles, publicSpace });
    while (queued.length) queued.shift()();
    return tree;
  } };
}

test("visitors with no joined circles render the discovery card without dereferencing an empty count", () => {
  const harness = cardHarness([]), tree = harness.render();
  assert.equal(harness.requests.length, 0);
  assert.equal(elements(tree, "a").length, mapCount);
  assert.ok(elements(tree, "a").every(link => link.props.href === "/c"));
  assert.equal(occupancyLabels(tree).length, 0, "unknown occupancy is never invented as zero");
  assert.deepEqual(elements(tree,"img").map(image=>image.props.src),mapIds.map(map => assets.assetUrl(map === "cloudspa" ? "/cloudspa/art/city-nw-card-v2.webp" : `/beach/places/${map}-v1.webp`)));
});

test("a pinned private circle precedes the primary circle and respects its four-place limit", async () => {
  const harness = cardHarness([{ id: "ordinary", name: "기존", slug: "ordinary", primary: true },
    { id: "test", name: "헤송민의 소로우", slug: "test", pinned: true, privateTest: true, spaceCapacity: 4 }]);
  let tree = harness.render();
  assert.equal(elements(tree, "select").length, 0, "the surrounding community selection is not duplicated");
  assert.equal(harness.requests.length, mapCount);
  assert.ok(harness.requests.every(request => request.communityId === "test"));
  assert.ok(elements(tree, "a").every(link => link.props.href.endsWith("communityId=test")));
  harness.requests[0].resolve({ communityId: "test", mapId: "beach", count: 4, capacity: 4 });
  await settle(); tree = harness.render();
  assert.equal(elements(tree, "a").length, mapCount - 1, "only the full room loses its enter link");
  assert.equal(placeButtons(tree)[0].props["data-place"], "beach");
  assert.equal(placeButtons(tree)[0].props.disabled, true);
  assert.equal(occupancyLabels(tree)[0].props.children, 4);
});

const PUBLIC = { id: "public", name: "공용 공간", capacity: 20 };
const ladder = open => mapIds.map((id, index) => ({ id, open: index < open, members: index === 0 ? 0 : index * 20 + 1 }));
const texts = tree => elements(tree, "p").map(p => [].concat(p.props.children).join(""));

test("the public space opens every landscape to anyone and asks for the community rules before entering", async () => {
  const harness = cardHarness([{ id: "mine", name: "우리", slug: "mine", primary: true, spaceMaps: ladder(1) }], PUBLIC);
  let tree = harness.render();
  assert.deepEqual(elements(tree, "a").map(link => link.props.href), mapIds.map(id => maps.mapHref(id, "public")), "no landscape is locked and none enters my circle");
  assert.equal(placeButtons(tree).length, 0);
  assert.ok(harness.requests.length === mapCount && harness.requests.every(request => request.communityId === "public"));
  assert.ok(texts(tree).some(text => text.includes("누구나 들어올 수 있어요")));
  assert.ok(elements(tree, "a").every(link => link.props["aria-label"].startsWith("공용 공간 ")));
  harness.requests[0].resolve({ communityId: "public", mapId: "beach", count: 20, capacity: 20 });
  await settle(); tree = harness.render();
  assert.equal(placeButtons(tree)[0].props["aria-label"], "바닷가, 만석");

  const uyuni = elements(tree, "a").find(link => link.props["data-place"] === "uyuni");
  const click = extra => { const event = { prevented: false, button: 0, preventDefault() { this.prevented = true; }, ...extra }; uyuni.props.onClick(event); return event; };
  assert.equal(click({ ctrlKey: true }).prevented, false, "a new-tab click is left to the browser; the server checks consent there");
  assert.equal(harness.consents.length, 0);
  assert.equal(click().prevented, true);
  click();
  assert.equal(harness.consents.length, 1, "a second tap while the rules sheet is open does not ask twice");
  assert.deepEqual(harness.pushed, [], "nobody enters before agreeing");
  harness.consents[0].resolve(false);
  await settle(); await settle();
  assert.deepEqual(harness.toasts, [["함께 지킬 약속에 동의하면 들어갈 수 있어요.", "info"]], "closing the rules sheet is a brief notice, not a lingering error");
  assert.equal(harness.saves.length, 0);
  assert.deepEqual(harness.pushed, []);
  click(); harness.consents[1].resolve(true);
  await settle(); await settle();
  assert.deepEqual(harness.pushed, [], "the agreement is saved on the server before entering");
  harness.saves[0].reject(new Error("연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."));
  await settle(); await settle();
  assert.deepEqual(harness.toasts[1], ["연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", "error"]);
  assert.deepEqual(harness.pushed, []);
  click(); harness.consents[2].resolve(true); await settle(); await settle();
  harness.saves[1].resolve(); await settle(); await settle();
  assert.deepEqual(harness.pushed, ["/uyuni?communityId=public"]);
  assert.equal(harness.remembered.length, 1, "leaving the room returns to the page it was entered from");
});

test("a circle's own space locks the landscapes its members have not grown into yet", async () => {
  const harness = cardHarness([{ id: "small", name: "작은 소로우", slug: "small", primary: true, memberCount: 3, spaceMaps: ladder(1) }]);
  let tree = harness.render();
  assert.deepEqual(elements(tree, "a").map(link => link.props.href), [maps.mapHref("beach", "small")], "a new circle starts with the beach");
  assert.deepEqual(harness.requests.map(request => request.mapId), ["beach"], "locked rooms are not polled");
  const locked = placeButtons(tree);
  assert.deepEqual(locked.map(button => button.props["data-place"]), mapIds.slice(1));
  assert.ok(locked.every(button => button.props.disabled === true && button.props["data-locked"] === ""));
  assert.deepEqual(locked.map(button => button.props["aria-label"]), ["우유니, 멤버 21명부터 열려요", "대나무숲, 멤버 41명부터 열려요", "봄물 정원, 멤버 61명부터 열려요", "구름미그린 온천, 멤버 81명부터 열려요", "바이칼, 멤버 101명부터 열려요"]);
  assert.ok(texts(tree).some(text => text === "멤버만 들어와요. 멤버 21명부터 우유니도 열려요."));

  harness.setCircles([{ id: "small", name: "작은 소로우", slug: "small", primary: true, memberCount: 21, spaceMaps: ladder(2) }]);
  tree = harness.render();
  assert.deepEqual(elements(tree, "a").map(link => link.props["data-place"]), ["beach", "uyuni"], "the next landscape opens once the circle grows");
  assert.deepEqual(harness.requests.slice(1).map(request => request.mapId), ["beach", "uyuni"], "the newly opened room starts reporting who is there");
  assert.ok(texts(tree).some(text => text === "멤버만 들어와요. 멤버 41명부터 대나무숲도 열려요."));

  harness.setCircles([{ id: "big", name: "큰 소로우", slug: "big", primary: true, spaceMaps: ladder(mapCount) }]);
  tree = harness.render();
  assert.equal(elements(tree, "a").length, mapCount);
  assert.ok(texts(tree).some(text => text === "우리 소로우 멤버만 들어오는 공간이에요."));
});

test("map links preserve the community and encode it without changing the beach route", () => {
  assert.equal(maps.mapHref("beach", "circle / one"), "/beach?communityId=circle%20%2F%20one");
  assert.equal(maps.mapHref("uyuni", "circle / one"), "/uyuni?communityId=circle%20%2F%20one");
  assert.equal(maps.MAPS.uyuni.eyebrow, "하늘이 머무는 곳");
  assert.equal(maps.MAPS.uyuni.welcome, "발끝에 비치는 별빛");
  assert.equal(maps.mapHref("baikal", maps.PUBLIC_SPACE_ID), "/baikal?communityId=public");
  assert.equal(maps.mapEyebrow("beach", false), "우리만의 프라이빗 해변");
  assert.equal(maps.mapEyebrow("beach", true), "누구나 쉬어 가는 해변", "the public beach is not called ours alone");
  assert.equal(maps.mapEyebrow("uyuni", true), maps.MAPS.uyuni.eyebrow);
});

test("all landscape cards enter directly and keep their live counts and effective capacities separate", async () => {
  const harness = cardHarness();
  let tree = harness.render();
  assert.deepEqual(elements(tree, "a").map(link => link.props.href), Object.keys(maps.MAPS).map(id => maps.mapHref(id, "circle / one")));
  assert.equal(occupancyLabels(tree).length, 0);
  harness.requests[0].resolve({ communityId: "circle / one", mapId: "beach", count: 20, capacity: 100 });
  harness.requests[1].resolve({ communityId: "circle / one", mapId: "uyuni", count: 9, capacity: 100 });
  await settle(); tree = harness.render();
  assert.equal(placeButtons(tree)[0].props["data-place"], "beach", "legacy capacity 100 is capped at the current 20-person limit");
  assert.equal(elements(tree, "a").length, mapCount - 1);
  assert.deepEqual(occupancyLabels(tree).map(label => label.props.children), [20, 9]);
  assert.ok(elements(tree, "span").some(span => span.props["aria-label"] === "9명, 정원 20명"));
});

test("changing communities and refreshing discards late counts and restores unknown state on failure", async () => {
  const harness = cardHarness();
  harness.render();
  harness.setCircles([{ id: "new-circle", name: "새 소로우", slug: "new" }]);
  harness.render();
  harness.requests[0].resolve({ communityId: "circle / one", mapId: "beach", count: 20, capacity: 20 });
  harness.requests[mapCount].resolve({ communityId: "new-circle", mapId: "beach", count: 3, capacity: 20 });
  await settle();
  let tree = harness.render();
  assert.deepEqual(occupancyLabels(tree).map(label => label.props.children), [3]);
  assert.ok(elements(tree, "a").every(link => link.props.href.endsWith("communityId=new-circle")));
  harness.refresh();
  harness.requests[mapCount + 1].resolve({ communityId: "new-circle", mapId: "uyuni", count: 20, capacity: 20 });
  harness.requests[mapCount * 2 + 1].resolve({ communityId: "new-circle", mapId: "uyuni", count: 7, capacity: 20 });
  harness.requests[mapCount * 2].reject(new Error("network unavailable"));
  await settle(); tree = harness.render();
  assert.deepEqual(occupancyLabels(tree).map(label => label.props.children), [7], "failed counts become unknown and the old refresh cannot mark a room full");
  assert.equal(elements(tree, "a").length, mapCount);
  assert.equal(placeButtons(tree).length, 0);
});

const sceneSource = await read("../components/beach/BeachScene.tsx");
const sceneAst = ts.createSourceFile("BeachScene.tsx", sceneSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let reenter, lifecycle, toggleRest, sofa;
const bedDisplay = {};
function inspect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sceneAst) === "reenter") reenter = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(sceneAst) === "toggleStargazing") toggleRest = node.initializer;
  if (ts.isVariableDeclaration(node) && ["activeBed", "restArea", "areaEnabled", "areaSpot", "viewLabel"].includes(node.name.getText(sceneAst))) bedDisplay[node.name.getText(sceneAst)] = node.initializer.getText(sceneAst);
  if (ts.isJsxExpression(node) && node.expression?.getText(sceneAst).includes("rest &&") && node.expression.getText(sceneAst).includes("engineRef.current?.toggleRest()")) sofa = node.expression;
  if (ts.isCallExpression(node) && node.expression.getText(sceneAst) === "useEffect" && node.arguments[0]?.getText(sceneAst).includes("new BeachEngine")) lifecycle = node;
  ts.forEachChild(node, inspect);
}
inspect(sceneAst);

test("reconnection keeps Uyuni and a response from a departed visit only releases its ticket", async () => {
  assert.ok(reenter && lifecycle);
  for (const hook of [reenter, lifecycle]) assert.match(hook.arguments[1].getText(sceneAst), /\bmapId\b/, "changing map recreates the room lifecycle and reconnect callback");
  const entered = { ticket: "uyuni-ticket", me: { id: "self" }, community: { id: "ours" }, count: 2, capacity: 100,
    mapId: "uyuni", fireEnabled: false, restEnabled: true, fireworksFree: false, fireworkTickets: 3, spawn: { x: 0, z: 0, yaw: 0 } };
  for (const depart of [false, true]) {
    const pending = deferred(), requests = [], left = [], fireworkState = [];
    const engine = { restoreVisit() {}, select() {}, getContinuityView: () => ({ view: "first", yaw: 0, pitch: 0.07, orbitYaw: 0, restSpot: null }),
      isLying: false, isBenchSeated: false, onsenState: { sitting: false } };
    const ctx = { communityId: "ours", mapId: "uyuni", enterBeach: (...args) => { requests.push(args); return pending.promise; }, leaveBeach: ticket => left.push(ticket) };
    for (const name of ["aliveRef", "engineRef", "visitGenerationRef", "requestEpochRef", "resumeRecordRef", "sequenceRef", "blockedRef", "meRef", "pendingCareRef", "careBusyRef", "ticketRef", "lightingRef", "lightingBusyRef", "fireEnabledRef", "restEnabledRef", "bedEnabledRef", "benchEnabledRef", "onsenEnabledRef", "pavilionEnabledRef", "bunkerEnabledRef"]) ctx[name] = { current: null };
    ctx.aliveRef.current = true; ctx.engineRef.current = engine; ctx.visitGenerationRef.current = 4;
    ctx.setMusicControl = () => {};
    ctx.applyMusic = () => {};
    ctx.setFireworksFree = value => fireworkState.push(["free", value]);
    ctx.setFireworkTickets = value => fireworkState.push(["tickets", value]);
    ctx.requestEpochRef.current = 8; ctx.sequenceRef.current = 0;
    for (const name of ["setCareBusy", "resetFireworks", "setFireworksControl", "applyFireworks", "resetMoments", "setMomentsEnabled", "applyMoments", "setPondEnabled", "applyPondMoments", "setLightingBusy", "setLightingOpen", "setLightingControl", "setLighting", "applyLighting", "adoptCharacter", "setCareCapabilities", "setCount", "setCapacity", "setCommunity", "setFireEnabled", "setRestEnabled", "setBedEnabled", "setBenchEnabled", "setOnsenEnabled", "setPavilionEnabled", "setBunkerEnabled", "applyFire", "rememberVisit"]) ctx[name] = () => {};
    vm.runInNewContext(compile(`globalThis.run = ${reenter.arguments[0].getText(sceneAst)};`), ctx);
    const result = ctx.run(engine, 4, 8, new AbortController().signal);
    if (depart) ctx.visitGenerationRef.current++;
    pending.resolve(entered);
    assert.equal(await result, !depart);
    assert.equal(requests[0][2], "uyuni");
    assert.deepEqual(left, depart ? ["uyuni-ticket"] : []);
    assert.equal(ctx.ticketRef.current, depart ? null : "uyuni-ticket");
    assert.deepEqual(fireworkState, depart ? [] : [["free", false], ["tickets", 3]], "a departed reconnect does not update firework access or tickets");
  }
});

function hotelRestHarness({ enabled = true, confirm, sync } = {}) {
  const calls = [], applied = [], notices = [];
  const engine = {
    isLying: false, isBenchSeated: false, onsenState: { sitting: false, floating: false },
    getBedState: () => ({ spotId: "hotel-dawn", near: true, occupied: 0, capacity: 2 }),
    walkToBed: async spotId => { calls.push(["walk", spotId]); return "arrived"; },
    select() {}, setView(view) { calls.push(["view", view]); },
    applyRest(value) { applied.push(value); this.isLying = value.pose === "lying"; },
  };
  const ctx = { performance, window: { setTimeout }, Error, engineRef: { current: engine },
    BeachGone: class BeachGone extends Error {}, BeachUnavailable: class BeachUnavailable extends Error {},
    resumeForAction: async () => {}, haptic() {}, showToast: text => notices.push(text),
    scheduleTick: () => calls.push(["poll"]), stopWithError: error => { throw error; },
  };
  for (const name of ["onsenEnabledRef", "benchEnabledRef", "restEnabledRef", "pavilionEnabledRef", "skyBusyRef", "woodBusyRef", "powderBusyRef", "pondBusyRef", "bunkerBusyRef", "blockedRef", "skyOperationRef", "visitGenerationRef", "aliveRef", "restMutationRef", "inFlightRef", "ticketRef", "meRef", "bedEnabledRef"]) ctx[name] = { current: null };
  ctx.aliveRef.current = true; ctx.bedEnabledRef.current = enabled;
  ctx.skyOperationRef.current = 0; ctx.visitGenerationRef.current = 4;
  ctx.meRef.current = { id: "me" }; ctx.ticketRef.current = "uyuni-visit";
  ctx.runTick = async allowRestSync => { calls.push(["sync", allowRestSync]); await sync?.(ctx); return true; };
  ctx.setBeachRest = async (ticket, action, spotId) => {
    calls.push(["claim", ticket, action, spotId]);
    if (confirm) return confirm({ ticket, action, spotId });
    return action === "stand" ? { pose: "standing", spotId: null, slot: null, x: -12, z: 22, yaw: 0 }
      : { pose: "lying", spotId, slot: 1, x: -10.5, z: 24.5, yaw: Math.PI };
  };
  for (const name of ["setRestActionSpot", "setCarePrompt", "setSkyPhase", "setOnsenEnabled", "setBenchEnabled", "setBedEnabled", "setRestEnabled", "setPavilionEnabled"]) ctx[name] = () => {};
  vm.runInNewContext(compile(`globalThis.run = ${toggleRest.getText(sceneAst)};`), ctx);
  return { ctx, engine, calls, applied, notices, run: ctx.run };
}

test("Uyuni hotel actions wait for the server slot, serialize retries and stand without another walk", async () => {
  const pending = deferred();
  const harness = hotelRestHarness({ confirm: ({ action, spotId }) => action === "lie" ? pending.promise
    : { pose: "standing", spotId: null, slot: null, x: -12, z: 22, yaw: 0 } });
  const first = harness.run("hotel-dawn");
  await harness.run("hotel-dawn");
  for (let i = 0; i < 4; i++) await settle();
  assert.deepEqual(harness.calls.slice(0, 3), [["walk", "hotel-dawn"], ["sync", true], ["claim", "uyuni-visit", "lie", "hotel-dawn"]]);
  assert.equal(harness.applied.length, 0, "walking and a sent request do not invent a lying confirmation");
  pending.resolve({ pose: "lying", spotId: "hotel-dawn", slot: 1, x: -10.5, z: 24.5, yaw: Math.PI });
  await first;
  assert.equal(harness.applied[0].slot, 1);
  assert.equal(harness.ctx.restMutationRef.current, false);
  await harness.run("hotel-dawn");
  assert.equal(harness.applied.at(-1).pose, "standing");
  assert.equal(harness.calls.filter(call => call[0] === "walk").length, 1);
  assert.deepEqual(harness.calls.filter(call => call[0] === "claim").at(-1), ["claim", "uyuni-visit", "stand", "hotel-dawn"]);
});

test("hotel capability removal and uncertain confirmations never fabricate a successful rest", async () => {
  const disabled = hotelRestHarness({ enabled: false });
  await disabled.run("hotel-dawn"); assert.equal(disabled.calls.length, 0);
  const revoked = hotelRestHarness({ sync: ctx => { ctx.bedEnabledRef.current = false; } });
  await revoked.run("hotel-dawn");
  assert.equal(revoked.calls.filter(call => call[0] === "claim").length, 0);
  assert.equal(revoked.applied.length, 0);
  const failed = hotelRestHarness({ confirm: async () => { throw new Error("응답 확인 중"); } });
  await failed.run("hotel-dusk");
  assert.equal(failed.applied.length, 0);
  assert.equal(failed.ctx.restMutationRef.current, false);
  assert.ok(failed.calls.some(call => call[0] === "poll"), "a subsequent room tick recovers an unknown confirmation");
});

test("hotel bed and sofa context remain available in Uyuni without changing the existing view controls", () => {
  const bed = { spotId: "hotel-dusk", shelterName: "노을 호텔", near: true, lying: true, occupied: 1, capacity: 2 };
  for (const bedEnabled of [false, true]) {
    const context = { mapId: "uyuni", bed, bedEnabled, stargazing: { lying: false }, onsen: { floating: false }, restEnabled: true, lying: true, view: "third" };
    vm.runInNewContext(compile(`${Object.entries(bedDisplay).map(([name, expression]) => `const ${name} = ${expression};`).join("\n")}\nglobalThis.result = { activeBed, areaEnabled, areaSpot, viewLabel };`), context);
    assert.equal(context.result.activeBed, bed);
    assert.equal(context.result.areaEnabled, bedEnabled);
    assert.equal(context.result.areaSpot, "hotel-dusk");
    assert.equal(context.result.viewLabel, "바다 보기");
  }
  const clicks = [], context = { exports: {}, require: () => jsxRuntime, mapId: "uyuni", rest: { shelterName: "노을 호텔", seated: false },
    lying: false, bunker: { inside: false }, bunkerBusy: null, bench: { seated: false }, onsenResting: false, skyPhase: null, woodBusy: false, powderPhase: null,
    styles: new Proxy({}, { get: (_, key) => String(key) }), IconSeat: "i", IconStand: "i",
    engineRef: { current: { select() {}, toggleRest: () => clicks.push("sit") } } };
  vm.runInNewContext(compile(`globalThis.tree = ${sofa.getText(sceneAst)};`), context);
  const button = elements(context.tree, "button")[0];
  assert.ok(button, "the nearby sofa action is rendered in Uyuni");
  button.props.onClick(); assert.deepEqual(clicks, ["sit"]);
});

test("Uyuni is a private fullscreen route and retains the community from the URL", async () => {
  const [route, layout, tabbar] = await Promise.all([read("../app/uyuni/page.tsx"), read("../app/uyuni/layout.tsx"), read("../components/TabBar.tsx")]);
  assert.match(route, /search\.get\("communityId"\)/);
  assert.match(route, /<BeachScene[^>]+communityId=\{communityId\}[^>]+mapId="uyuni"/);
  assert.match(layout, /robots:\s*\{ index: false, follow: false \}/);
  assert.match(tabbar, /path === "\/uyuni"/);
  assert.match(sceneSource, /mapId === "beach" && fireEnabled && <div className=\{styles\.fireContext\}/, "Uyuni never mounts campfire controls");
  assert.match(lifecycle.arguments[0].getText(sceneAst), /new BeachEngine\(canvas,\s*\{\s*mapId,/);
});


test("cloud spa photo keeps private membership, independent occupancy and direct entry", async () => {
  const harness = cardHarness([{ id: "private / two", name: "우리 둘", slug: "two", pinned: true, privateTest: true, spaceCapacity: 4 }]);
  let tree = harness.render();
  const cloudLink = () => elements(tree, "a").find(link => link.props["data-place"] === "cloudspa");
  assert.equal(cloudLink().props.href, "/cloudspa?communityId=private%20%2F%20two");
  assert.equal(elements(cloudLink(), "img")[0].props.src, assets.assetUrl("/cloudspa/art/city-nw-card-v2.webp"));
  assert.equal(harness.requests.filter(request => request.mapId === "cloudspa").length, 1);
  harness.requests.find(request => request.mapId === "beach").resolve({ communityId: "private / two", mapId: "beach", count: 4, capacity: 4 });
  await settle(); tree = harness.render(); assert.ok(cloudLink(), "a full beach does not disable the cloud spa");
  harness.requests.find(request => request.mapId === "cloudspa").resolve({ communityId: "private / two", mapId: "cloudspa", count: 4, capacity: 4 });
  await settle(); tree = harness.render(); assert.equal(cloudLink(), undefined);
  const full = placeButtons(tree).find(button => button.props["data-place"] === "cloudspa");
  assert.equal(full.props.disabled, true);
  assert.equal(occupancyLabels(full)[0].props.children, 4);
});


test("cloud spa is a private fullscreen route with the current capacity and shared entry cards", async () => {
  const [page, layout, tabs, home, circle] = await Promise.all([read("../app/cloudspa/page.tsx"), read("../app/cloudspa/layout.tsx"), read("../components/TabBar.tsx"), read("../app/c/home/page.tsx"), read("../app/c/[slug]/page.tsx")]);
  assert.ok(page.includes('search.get("communityId")'));
  assert.ok(page.includes('communityId={communityId} mapId="cloudspa"'));
  assert.ok(layout.includes('robots: { index: false, follow: false }'));
  assert.ok(layout.includes("최대 20명"));
  assert.ok(tabs.includes('path === "/cloudspa"'));
  assert.ok(home.includes('<BeachCard publicSpace={mine.publicSpace} circles='), "the home card is the public space, with my circle's space as the fallback for an older server");
  assert.ok(circle.includes('<BeachCard circles='));
});
