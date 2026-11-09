import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

async function load(file, context, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}

const preferenceApi = (window) => load("../lib/beach/appearance.ts", { window }, ["BEACH_CHARACTERS", "savedCharacter", "saveCharacter", "characterFromSkin", "characterSkin", "characterAfterEntry"]);

test("character choices remain separate across accounts and ignore malformed stored values", async () => {
  const values = new Map();
  const api = await preferenceApi({ localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } });
  api.saveCharacter("account / one", "female-3d");
  assert.equal(api.savedCharacter("account / one"), "female-3d");
  assert.equal(api.savedCharacter("account / two"), null);
  api.saveCharacter("account / two", "male");
  assert.equal(api.savedCharacter("account / one"), "female-3d");
  assert.equal(api.savedCharacter("account / two"), "male");
  const oneKey = [...values.keys()].find((key) => key.endsWith("account%20%2F%20one"));
  values.set(oneKey, "admin");
  assert.equal(api.savedCharacter("account / one"), null);
  api.saveCharacter("", "female-3d");
  assert.equal(api.savedCharacter(""), null);
  assert.equal(values.size, 2, "no anonymous/global preference is created");
});

test("blocked browser storage never prevents choosing a character for the current visit", async () => {
  const window = {};
  Object.defineProperty(window, "localStorage", { get() { throw new Error("storage blocked"); } });
  const api = await preferenceApi(window);
  assert.equal(api.savedCharacter("one"), null);
  assert.doesNotThrow(() => api.saveCharacter("one", "female-3d"));
});

test("reconnecting after an account switch never inherits the previous account's in-memory character", async () => {
  const api = await preferenceApi(undefined);
  const previous = { id: "account-a", character: "female" };
  assert.equal(api.characterAfterEntry({ id: "account-b", skin: 0 }, previous, null), "male");
  assert.equal(api.characterAfterEntry({ id: "account-b", skin: 0 }, previous, "female-3d"), "female-3d");
  assert.equal(api.characterAfterEntry({ id: "account-a", skin: 0 }, previous, null), "female-3d", "same-account reconnect migrates an old in-memory choice even when storage is unavailable");
});

test("the picker offers the two ordinary characters with their stable server skin IDs", async () => {
  const values = new Map();
  const api = await preferenceApi({ localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } });
  const choices = [["male", 0], ["female-3d", 3]];
  assert.deepEqual(Array.from(api.BEACH_CHARACTERS, ({ id, skin }) => [id, skin]), choices);
  assert.deepEqual(Array.from(api.BEACH_CHARACTERS, ({ id, label, preview }) => ({ id, label, preview })), [
    { id: "male", label: "남자", preview: "/beach/male-avatar.webp" },
    { id: "female-3d", label: "여자", preview: "/beach/female-avatar.webp" },
  ]);
  for (const [id, skin] of choices) {
    api.saveCharacter("account", id);
    assert.equal(api.savedCharacter("account"), id);
    assert.equal(api.characterSkin(id), skin);
    assert.equal(api.characterFromSkin(skin), id);
    assert.equal(api.characterAfterEntry({ id: "account", skin: 0 }, null, api.savedCharacter("account")), id);
    assert.equal(api.characterAfterEntry({ id: "account", skin: 0 }, { id: "account", character: id }, null), id,
      "same-account reconnect retains every choice without relying on local storage");
    assert.equal(api.characterAfterEntry({ id: "another-account", skin }, { id: "account", character: "female" }, null), id,
      "an account change uses the new account's confirmed character");
  }
  assert.equal(api.characterSkin("male"), 0);
  assert.equal(api.characterSkin("female-3d"), 3);
});

test("legacy pixel preferences migrate on read, write and reconnect without crossing accounts", async () => {
  const values = new Map([
    ["sorow:beach-character:v1:old-boy", "pixel-male"],
    ["sorow:beach-character:v1:old-girl", "female"],
  ]);
  const api = await preferenceApi({ localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } });
  assert.equal(api.savedCharacter("old-boy"), "male");
  assert.equal(api.savedCharacter("old-girl"), "female-3d");
  assert.equal(values.get("sorow:beach-character:v1:old-boy"), "male");
  assert.equal(values.get("sorow:beach-character:v1:old-girl"), "female-3d");
  api.saveCharacter("other-boy", "pixel-male");
  api.saveCharacter("other-girl", "female");
  assert.equal(values.get("sorow:beach-character:v1:other-boy"), "male");
  assert.equal(values.get("sorow:beach-character:v1:other-girl"), "female-3d");
  assert.equal(api.characterAfterEntry({ id: "old-boy", skin: 2 }, { id: "old-boy", character: "pixel-male" }, null), "male");
  assert.equal(api.characterAfterEntry({ id: "old-girl", skin: 1 }, null, null), "female-3d");
  const readOnly = await preferenceApi({ localStorage: { getItem: () => "female", setItem: () => { throw Error("read only"); } } });
  assert.equal(readOnly.savedCharacter("old-girl"), "female-3d", "a failed persistence update still migrates this visit");
});

test("legacy server rows resolve to the matching 3D gender without renumbering the female model", async () => {
  const api = await preferenceApi(undefined);
  for (const oldSkin of [-6, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100]) {
    assert.equal(api.characterSkin(api.characterFromSkin(oldSkin)), ((oldSkin % 2) + 2) % 2 === 1 ? 3 : 0);
  }
  assert.equal(api.characterFromSkin(Number.NaN), "male");
  assert.equal(api.characterFromSkin(Number.POSITIVE_INFINITY), "male");
  assert.equal(api.characterFromSkin(6), "male", "the retired Mongsil skin becomes an ordinary character");
  assert.equal(api.characterFromSkin(7), "female-3d");
  assert.equal(api.characterSkin("unknown"), 0);
});

test("removed cat and Mongsil preferences migrate to the ordinary characters across storage and reconnect", async () => {
  const values = new Map([
    ["sorow:beach-character:v1:one", "cat-gentleman"],
    ["sorow:beach-character:v1:two", "cat-lady"],
    ["sorow:beach-character:v1:three", "mongsil"],
  ]);
  const api = await preferenceApi({ localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } });
  assert.deepEqual(Array.from(api.BEACH_CHARACTERS, choice => choice.id), ["male", "female-3d"]);
  for (const [id, removed, selected, oldSkin, skin] of [["one", "cat-gentleman", "male", 4, 0], ["two", "cat-lady", "female-3d", 5, 3], ["three", "mongsil", "male", 6, 0]]) {
    assert.equal(api.savedCharacter(id), selected);
    assert.equal(values.get(`sorow:beach-character:v1:${id}`), selected, "persist the migration so every map uses the ordinary character");
    assert.equal(api.characterAfterEntry({ id, skin: oldSkin }, { id, character: removed }, null), selected);
    assert.equal(api.characterAfterEntry({ id, skin: oldSkin }, null, null), selected);
    assert.equal(api.characterSkin(removed), skin);
    api.saveCharacter(id, removed);
    assert.equal(api.savedCharacter(id), selected);
  }
  const readOnly = await preferenceApi({ localStorage: { getItem: () => "cat-lady", setItem: () => { throw Error("read only"); } } });
  assert.equal(readOnly.savedCharacter("one"), "female-3d");
});

test("a stored choice that no longer exists falls back to the account's own skin", async () => {
  const values = new Map([["sorow:beach-character:v1:one", "dog-girl"]]);
  const api = await preferenceApi({ localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } });
  assert.equal(api.savedCharacter("one"), null);
  assert.equal(api.characterAfterEntry({ id: "one", skin: 3 }, { id: "one", character: "dog-girl" }, api.savedCharacter("one")), "female-3d");
  assert.equal(api.characterAfterEntry({ id: "one", skin: 0 }, null, api.savedCharacter("one")), "male");
});

test("entry and movement carry the stable character ID on every map", async () => {
  const calls = [];
  const api = await load("../lib/beach/net.ts", {
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ url, body });
      return new Response(JSON.stringify(url.endsWith("/enter") ? { mapId: body.mapId ?? "beach" } : { players: [] }), { status: 200 });
    }, Error, AbortSignal,
  }, ["enterBeach", "tickBeach"]);
  for (const mapId of ["beach", "uyuni", "bamboo", "garden", "cloudspa", "baikal"]) {
    await api.enterBeach("circle", "female-3d", mapId, { ticket: "previous", sequence: 4 });
    await api.tickBeach({ ticket: "ticket", x: 1, z: 2, yaw: 0, moving: true, character: "female-3d", sequence: 5 });
    assert.equal(calls.at(-2).body.character, "female-3d");
    assert.equal(calls.at(-2).body.mapId ?? "beach", mapId);
    assert.equal(calls.at(-2).body.resumeTicket, "previous");
    assert.equal(calls.at(-1).body.character, "female-3d");
    assert.equal(calls.at(-1).body.sequence, 5);
  }
});

test("enter and movement updates send the selected character for remote players", async () => {
  const calls = [];
  const api = await load("../lib/beach/net.ts", {
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response("{}", { status: 200 });
    },
    Error, AbortSignal,
  }, ["enterBeach", "tickBeach"]);
  await api.enterBeach("circle", "female-3d");
  await api.tickBeach({ ticket: "ticket", x: 1, z: 2, yaw: 0, moving: false, character: "male" });
  await api.enterBeach("circle");
  assert.deepEqual(calls[0], { url: "/api/beach/enter", body: { communityId: "circle", character: "female-3d" } });
  assert.equal(calls[1].body.character, "male");
  assert.equal(calls[1].body.ticket, "ticket");
  assert.deepEqual(calls[2].body, { communityId: "circle" }, "initial unknown-account entry does not inherit another account's choice");
  const choices = await preferenceApi(undefined);
  for (const legacy of ["pixel-male", "female", "cat-gentleman", "cat-lady", "mongsil"]) {
    const character = choices.characterAfterEntry({ id: "account", skin: 0 }, { id: "account", character: legacy }, null);
    await api.enterBeach("circle", character);
    await api.tickBeach({ ticket: "ticket", x: 1, z: 2, yaw: 0, moving: false, character });
    assert.equal(calls.at(-2).body.character, character);
    assert.equal(calls.at(-1).body.character, character);
  }
});
