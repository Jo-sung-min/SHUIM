import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

// 방 안의 외출 (lib/outing-room.ts): 풍경 속 숨은 것들의 자리와 말. 활동 목록은 lib/outing.ts 와 맞아야 한다
const load = async (name) => stripTypeScriptTypes(await readFile(new URL(`../lib/${name}`, import.meta.url), "utf8"), { mode: "transform" })
  .replace(/^import .*$/gm, "").replace(/\bexport\s+/g, "");
const context = { Math, Object, AbortController, setTimeout, clearTimeout, fetch: async () => { throw new Error("offline"); } };
vm.runInNewContext(`${await load("outing.ts")}\n${await load("outing-room.ts")}\nglobalThis.o = { OUTING_ACTIVITIES, EMPTY_OUTING, ROOM_PLACES, ROOM_SPOTS, STAGE, GROUND, roomPlace, roomSpot, spotState,
  DONE_LINES, WALK_LINES, POKE_LINES, LOOK_HINT, DECLINE_LINE, LEAVE_LINE, walkerScale, walkTarget, strollTarget, lineIndex };`, context);
const o = context.o;
const spots = Object.entries(o.ROOM_SPOTS).flatMap(([place, list]) => list.map((spot) => ({ place, ...spot })));

test("every activity is hidden somewhere in its own place, exactly once", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(o.ROOM_PLACES.map((p) => p.id))), ["park", "sea", "mountain"]);
  assert.equal(spots.length, o.OUTING_ACTIVITIES.length);
  for (const activity of o.OUTING_ACTIVITIES) {
    const found = spots.filter((s) => s.id === activity.id);
    assert.equal(found.length, 1, activity.id);
    assert.equal(found[0].place, activity.place, activity.id);
    assert.equal(o.roomSpot(activity.id).id, activity.id);
  }
  assert.equal(o.roomSpot("nothing"), undefined);
  assert.equal(o.roomPlace("sea").name, "보랏빛 바다");
  assert.equal(o.roomPlace("moon"), undefined);
});

test("what is hidden can be tapped: inside the visible stage, big enough, and not on top of each other", () => {
  for (const s of spots) {
    assert.ok(s.w >= 56 && s.h >= 44, `${s.id} is big enough to tap`);
    assert.ok(s.x - s.w / 2 >= o.STAGE.left - 6 && s.x + s.w / 2 <= o.STAGE.right + 6, `${s.id} is inside the visible width`);
    assert.ok(s.y - s.h / 2 >= o.STAGE.top && s.y + s.h / 2 <= o.STAGE.bottom + 2, `${s.id} is inside the visible height`);
    assert.ok(s.sx >= o.STAGE.left + 40 && s.sx <= o.STAGE.right - 40, `${s.id}: the friend stands on screen`);
    assert.ok(s.sy >= o.GROUND.top && s.sy <= o.GROUND.bottom, `${s.id}: the friend stands on the ground`);
  }
  for (const place of Object.keys(o.ROOM_SPOTS)) {
    const list = o.ROOM_SPOTS[place];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 8 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 8;
      assert.ok(apart, `${a.id} and ${b.id} overlap`);
    }
  }
});

test("locked things only say we can do it once we are closer; open things ask", () => {
  for (const s of spots) {
    const activity = o.OUTING_ACTIVITIES.find((a) => a.id === s.id);
    assert.match(s.invite, /\?$/, `${s.id} asks`);
    assert.ok(s.invite.length <= 26, s.invite);
    if (activity.day === 0) { assert.equal(s.locked, "", `${s.id} is open from the first day`); continue; }
    assert.ok(s.locked.length >= 12 && s.locked.length <= 52, s.locked);
    assert.match(s.locked, /친해지면|가까워지면|함께하면|함께한 사이가 되면/, `${s.id} points at being closer`);
    assert.doesNotMatch(s.locked, /\d|레벨|Lv|잠겨|해금|일에 열/, `${s.id} hides the numbers`);
  }
  const lines = [...spots.flatMap((s) => [s.locked, s.invite]), ...o.DONE_LINES, ...o.WALK_LINES, ...o.POKE_LINES, o.LOOK_HINT, o.DECLINE_LINE, o.LEAVE_LINE, ...o.ROOM_PLACES.map((p) => p.arrive)].filter(Boolean);
  for (const line of lines) assert.doesNotMatch(line, /왜 |해야|빨리|안 왔|새싹|깃털/, line);
});

test("a spot is locked, open or done today, following the server's lists", () => {
  const fresh = o.EMPTY_OUTING;
  assert.equal(o.spotState("park-bench", fresh), "open");
  assert.equal(o.spotState("sea-shells", fresh), "locked");
  assert.equal(o.spotState("park-bench", { unlocked: ["park-bench"], completedToday: ["park-bench"] }), "done");
  assert.equal(o.spotState("sea-shells", { unlocked: ["sea-shells"], completedToday: [] }), "open");
  assert.equal(o.spotState("unknown", fresh), "locked");
});

test("the friend walks only on the ground, looks smaller farther away, and says the together-lines in order", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(o.walkTarget(0, 0))), { sx: o.STAGE.left + 40, sy: o.GROUND.top + 14 });
  assert.deepEqual(JSON.parse(JSON.stringify(o.walkTarget(999, 999))), { sx: o.STAGE.right - 40, sy: o.GROUND.bottom - 6 });
  assert.deepEqual(JSON.parse(JSON.stringify(o.walkTarget(240, 520))), { sx: 240, sy: 520 });
  assert.equal(o.walkerScale(o.GROUND.top), 0.72);
  assert.equal(o.walkerScale(o.GROUND.bottom), 1);
  assert.equal(o.walkerScale(0), 0.72);
  assert.ok(o.walkerScale(520) > 0.72 && o.walkerScale(520) < 1);
  assert.deepEqual([0, 3999, 4000, 8000, 60000].map((ms) => o.lineIndex(ms, 3)), [0, 0, 1, 2, 2]);
});

test("left alone, the friend strolls a few steps sideways, turns back at the edge and stays on the ground", () => {
  for (const sx of [120, 240, 360]) for (const a of [0, 0.25, 0.49, 0.5, 0.75, 0.99]) for (const b of [0, 0.5, 0.99]) {
    const t = o.strollTarget(sx, a, b);
    assert.ok(t.sx >= o.STAGE.left + 40 && t.sx <= o.STAGE.right - 40, `on screen: ${sx} -> ${t.sx}`);
    assert.ok(t.sy >= o.GROUND.top && t.sy <= o.GROUND.bottom, `on the ground: ${t.sy}`);
    assert.ok(Math.abs(t.sx - sx) >= 40 && Math.abs(t.sx - sx) <= 120, `a real step, not far: ${sx} -> ${t.sx}`);
  }
});
