import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

// 캐릭터마다 다른 말 (lib/moru-lines.ts): 자기 몸에 없는 것을 말하지 않는지
const typed = await readFile(new URL("../lib/moru-lines.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/\bexport\s+/g, "");
const context = {};
vm.runInNewContext(`${source}\nglobalThis.l = { LOOKS, TICKLE_BY, HUG_BY, BATH_BY, LIGHT_MURMUR_BY, PRAISE_WAITING_BY, tickleLines, hugLines, bathLines, lightMurmur, praiseWaiting };`, context);
const l = context.l;
const LOOKS = [...l.LOOKS];
/** 그 모습이 하는 말 전부 */
const allOf = (look) => [...l.tickleLines(look), ...l.hugLines(look), ...l.bathLines(look), l.lightMurmur(look), ...l.praiseWaiting(look)];
/** 이 낱말은 이 캐릭터만 쓴다 */
const OWN = { moru: ["새싹"], noa: ["리본", "달빛"], leo: ["망토"], lumi: ["베레모", "별빛"], moring: ["깃털", "솜털", "날개", "꼬리 깃", "둥지", "삐삐", "파드득"] };

test("every character has its own lines for tickling, hugging, bathing, a light day and waiting", () => {
  assert.deepEqual(LOOKS, ["moru", "noa", "leo", "lumi", "moring"]);
  for (const look of LOOKS) {
    for (const table of [l.TICKLE_BY, l.HUG_BY, l.BATH_BY]) assert.equal(table[look].length, 3, look);
    assert.equal(l.PRAISE_WAITING_BY[look].length, 4, look);
    assert.ok(l.LIGHT_MURMUR_BY[look], look);
  }
});

test("nobody talks about a body part or prop they do not have", () => {
  for (const look of LOOKS) {
    const lines = allOf(look).join(" ");
    for (const [owner, words] of Object.entries(OWN)) for (const word of words) {
      if (owner === look) continue;
      assert.equal(lines.includes(word), false, `${look} says "${word}", which is ${owner}'s`);
    }
  }
  assert.ok(l.tickleLines("moru").some((line) => line.includes("새싹")));
  assert.ok(l.tickleLines("moring").some((line) => line.includes("깃털")));
  for (const look of ["noa", "leo", "lumi", "moring"]) assert.equal(allOf(look).join(" ").includes("새싹"), false, `${look} has no sprout`);
});

test("tickle lines differ between characters", () => {
  const signatures = new Set(LOOKS.map((look) => l.tickleLines(look).join("|")));
  assert.equal(signatures.size, LOOKS.length);
});

test("an unknown look falls back to Moru, and the waiting lines keep one array per look", () => {
  assert.equal(l.tickleLines("someone-new"), l.TICKLE_BY.moru);
  assert.equal(l.lightMurmur("someone-new"), l.LIGHT_MURMUR_BY.moru);
  for (const look of LOOKS) assert.equal(l.praiseWaiting(look), l.praiseWaiting(look), "the speech bubble follows one stable array");
});

test("lines stay short and never blame or hurry the user", () => {
  for (const look of LOOKS) for (const line of allOf(look)) {
    assert.ok(line.length > 0 && line.length <= 30, `${look}: ${line}`);
    assert.doesNotMatch(line, /왜 |해야|빨리|안 왔|잊었/, line);
  }
});
