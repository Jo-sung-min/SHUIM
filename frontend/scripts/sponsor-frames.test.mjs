import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const plain = (typed) => stripTypeScriptTypes(typed).replace(/^import [^;]*;\r?\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const frames = plain(await read("../lib/sponsor-frames.ts"));
const sponsors = plain(await read("../lib/sponsors.ts"));
const css = await read("../components/SponsorFrame.module.css");
const view = await read("../components/SponsorFrame.tsx");
const policy = await read("../../backend/src/main/java/kr/co/shuim/sponsor/SponsorPolicy.java");

function setup(fetch = async () => { throw new Error("unexpected request"); }) {
  const context = { fetch };
  vm.runInNewContext(`${frames}\n${sponsors}\nglobalThis.api = { FRAME_STYLES, FRAME_COLORS, FRAME_DECOS, DEFAULT_FRAME, FRAME_STYLE_LABELS, FRAME_COLOR_LABELS, FRAME_DECO_LABELS,
    parseFrame, sameFrame, studioKeyFromHash, studioLink, parseSponsor, fmtSponsorWon, openSponsorStudio, saveSponsorFrame };`, context);
  return context.api;
}
const api = setup();
const javaList = (name) => [...new RegExp(`${name} = List\\.of\\(([^)]*)\\)`).exec(policy)[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
const KEY = "A".repeat(20) + "-_" + "b".repeat(21);

test("the frame lists are the server's lists, in the same order", () => {
  assert.deepEqual([...api.FRAME_STYLES], javaList("FRAME_STYLES"));
  assert.deepEqual([...api.FRAME_COLORS], javaList("FRAME_COLORS"));
  assert.deepEqual([...api.FRAME_DECOS], javaList("FRAME_DECOS"));
  assert.deepEqual({ ...api.DEFAULT_FRAME }, { style: api.FRAME_STYLES[0], color: api.FRAME_COLORS[0], deco: api.FRAME_DECOS[0] });
});

test("every frame, colour and decoration has a label and a drawing", () => {
  for (const style of api.FRAME_STYLES) {
    assert.ok(api.FRAME_STYLE_LABELS[style], `label for ${style}`);
    assert.ok(css.includes(`.frame[data-style="${style}"]`), `css for ${style}`);
  }
  for (const color of api.FRAME_COLORS) {
    assert.ok(api.FRAME_COLOR_LABELS[color], `label for ${color}`);
    assert.ok(css.includes(`[data-color="${color}"]`), `css for ${color}`);
  }
  for (const deco of api.FRAME_DECOS) {
    assert.ok(api.FRAME_DECO_LABELS[deco], `label for ${deco}`);
    if (deco !== "none") assert.match(view, new RegExp(`\\b${deco}: "M`), `glyph for ${deco}`);
  }
});

test("unknown or malformed frames fall back field by field", () => {
  assert.deepEqual({ ...api.parseFrame({ style: "gold", color: "teal", deco: "star" }) }, { style: "gold", color: "teal", deco: "star" });
  assert.deepEqual({ ...api.parseFrame({ style: "hologram", color: "teal", deco: 7 }) }, { style: "glass", color: "teal", deco: "none" });
  for (const value of [null, undefined, "gold", [], 3]) assert.deepEqual({ ...api.parseFrame(value) }, { ...api.DEFAULT_FRAME });
  assert.equal(api.sameFrame(api.parseFrame({ style: "ink" }), { style: "ink", color: "violet", deco: "none" }), true);
  assert.equal(api.sameFrame(api.DEFAULT_FRAME, { ...api.DEFAULT_FRAME, deco: "leaf" }), false);
});

test("sponsors always carry a frame, even from an older server", () => {
  const base = { id: "s1", name: "청우헌", amountWon: 2_000_000, fireworksTotal: 2000, fireworksGiven: 5, remaining: 1995, cheers: 5, rank: 3 };
  assert.deepEqual({ ...api.parseSponsor(base).frame }, { ...api.DEFAULT_FRAME });
  assert.deepEqual({ ...api.parseSponsor({ ...base, frame: { style: "wood", color: "green", deco: "leaf" } }).frame }, { style: "wood", color: "green", deco: "leaf" });
  assert.equal(api.parseSponsor({ ...base, amountWon: -1 }), null);
});

test("amounts read in 억 and 만 without losing won", () => {
  assert.equal(api.fmtSponsorWon(5_000_000), "500만원");
  assert.equal(api.fmtSponsorWon(100_000_000), "1억원");
  assert.equal(api.fmtSponsorWon(125_000_000), "1억 2,500만원");
  assert.equal(api.fmtSponsorWon(30_000), "3만원");
  assert.equal(api.fmtSponsorWon(1_234_000), "1,234,000원");
  assert.equal(api.fmtSponsorWon(0), "0원");
});

test("the studio key lives only in the address fragment and has one exact shape", () => {
  assert.equal(api.studioKeyFromHash(`#${KEY}`), KEY);
  assert.equal(api.studioKeyFromHash(KEY), KEY);
  for (const hash of ["", "#", `#${KEY}x`, `#${KEY.slice(1)}`, `#k=${KEY}`, `#${KEY.slice(0, 42)}!`]) assert.equal(api.studioKeyFromHash(hash), null);
  assert.equal(api.studioLink("https://www.sorow.co.kr/", KEY), `https://www.sorow.co.kr/sponsors/studio#${KEY}`);
});

test("the studio sends the key in the body and reads back the saved card", async () => {
  const calls = [];
  const card = { id: "s1", name: "청우헌", tagline: "", logoAt: null, amountWon: 2_000_000, rank: 0, frame: { style: "neon", color: "pink", deco: "heart" } };
  const studio = setup(async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ sponsor: card }) }; });
  const opened = await studio.openSponsorStudio(KEY);
  assert.equal(opened.rank, 0);
  assert.deepEqual({ ...opened.frame }, card.frame);
  await studio.saveSponsorFrame(KEY, { style: "gold", color: "teal", deco: "star" });
  assert.deepEqual(calls.map((call) => [call.options.method, call.url]), [["POST", "/api/sponsors/studio/open"], ["PUT", "/api/sponsors/studio"]]);
  assert.ok(calls.every((call) => !call.url.includes(KEY) && call.options.cache === "no-store"));
  assert.deepEqual(JSON.parse(calls[0].options.body), { key: KEY });
  assert.deepEqual(JSON.parse(calls[1].options.body), { key: KEY, style: "gold", color: "teal", deco: "star" });
});

test("a refused studio link surfaces as a 404 the screen can tell apart", async () => {
  const studio = setup(async () => ({ ok: false, status: 404, json: async () => ({ error: "꾸미기 링크가 맞지 않아요. 새 링크를 받아 주세요." }) }));
  await assert.rejects(() => studio.openSponsorStudio(KEY), (error) => error.name === "HttpError404" && /꾸미기 링크/.test(error.message));
  const broken = setup(async () => ({ ok: true, json: async () => ({ sponsor: { id: "s1" } }) }));
  await assert.rejects(() => broken.openSponsorStudio(KEY), /꾸미기 화면/);
});
