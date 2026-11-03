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

const preferenceApi = (window) => load("../lib/beach/appearance.ts", { window }, ["savedCharacter", "saveCharacter", "characterFromSkin", "characterSkin", "characterAfterEntry"]);

test("character choices remain separate across accounts and ignore malformed stored values", async () => {
  const values = new Map();
  const api = await preferenceApi({ localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } });
  api.saveCharacter("account / one", "female");
  assert.equal(api.savedCharacter("account / one"), "female");
  assert.equal(api.savedCharacter("account / two"), null);
  api.saveCharacter("account / two", "male");
  assert.equal(api.savedCharacter("account / one"), "female");
  assert.equal(api.savedCharacter("account / two"), "male");
  const oneKey = [...values.keys()].find((key) => key.endsWith("account%20%2F%20one"));
  values.set(oneKey, "admin");
  assert.equal(api.savedCharacter("account / one"), null);
  api.saveCharacter("", "female");
  assert.equal(api.savedCharacter(""), null);
  assert.equal(values.size, 2, "no anonymous/global preference is created");
});

test("blocked browser storage never prevents choosing a character for the current visit", async () => {
  const window = {};
  Object.defineProperty(window, "localStorage", { get() { throw new Error("storage blocked"); } });
  const api = await preferenceApi(window);
  assert.equal(api.savedCharacter("one"), null);
  assert.doesNotThrow(() => api.saveCharacter("one", "female"));
});

test("reconnecting after an account switch never inherits the previous account's in-memory character", async () => {
  const api = await preferenceApi(undefined);
  const previous = { id: "account-a", character: "female" };
  assert.equal(api.characterAfterEntry({ id: "account-b", skin: 0 }, previous, null), "male");
  assert.equal(api.characterAfterEntry({ id: "account-b", skin: 0 }, previous, "female"), "female");
  assert.equal(api.characterAfterEntry({ id: "account-a", skin: 0 }, previous, null), "female", "same-account reconnect retains a choice even when storage is unavailable");
});

test("legacy server skin rows safely select one of the two base characters", async () => {
  const api = await preferenceApi(undefined);
  for (let oldSkin = 0; oldSkin < 8; oldSkin++) {
    assert.equal(api.characterSkin(api.characterFromSkin(oldSkin)), oldSkin % 2);
  }
  assert.equal(api.characterFromSkin(Number.NaN), "male");
  assert.equal(api.characterFromSkin(Number.POSITIVE_INFINITY), "male");
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
  await api.enterBeach("circle", "female");
  await api.tickBeach({ ticket: "ticket", x: 1, z: 2, yaw: 0, moving: false, character: "male" });
  await api.enterBeach("circle");
  assert.deepEqual(calls[0], { url: "/api/beach/enter", body: { communityId: "circle", character: "female" } });
  assert.equal(calls[1].body.character, "male");
  assert.equal(calls[1].body.ticket, "ticket");
  assert.deepEqual(calls[2].body, { communityId: "circle" }, "initial unknown-account entry does not inherit another account's choice");
});
