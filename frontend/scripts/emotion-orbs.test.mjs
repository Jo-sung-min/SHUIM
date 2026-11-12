import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const strip = (typed) => stripTypeScriptTypes(typed, { mode: "transform" }).replace(/^import\s.*$/gm, "").replace(/\bexport\s+/g, "");
const rulesSource = strip(await readFile(new URL("../lib/emotion-orbs.ts", import.meta.url), "utf8"));
const spotsSource = strip(await readFile(new URL("../lib/beach/emotion-orb-spots.ts", import.meta.url), "utf8"));
const moruSource = strip(await readFile(new URL("../lib/moru.ts", import.meta.url), "utf8"));
const context = { Math, Number, Date, Array, Object, JSON };
vm.runInNewContext(`${rulesSource}\n${spotsSource}\nglobalThis.orbs = { ORB_KINDS, ORB_MOODS, ORB_CALM, ORB_STAY_MS, ORB_BEAT_MS, ORB_REACH, isOrbMood, orbMood, orbNeedMs, orbReady, orbBeatDelay,
  readOrbToday, orbHash, pickOrbPlace, readOrb, orbTally, orbDayLabel, orbDayShort, orbPlaceLabel, orbSpaceLabel, orbCompanionNote, readAlbumPhoto, ORB_GROUNDS };`, context);
const o = context.orbs;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("five orbs share the mood words of the character and never say 우울", () => {
  assert.deepEqual(plain(o.ORB_MOODS), [1, 2, 3, 4, 5]);
  const names = /MOOD_NAMES[^=]*=\s*\{([^}]*)\}/.exec(moruSource)[1];
  for (const mood of o.ORB_MOODS) {
    const kind = o.ORB_KINDS[mood];
    assert.equal(kind.mood, mood);
    assert.ok(names.includes(`${mood}: "${kind.feeling}"`), `mood ${mood} uses the character's word`);
    assert.ok(kind.name.endsWith("구슬"));
    for (const text of [kind.name, kind.feeling, kind.line]) assert.ok(!text.includes("우울"));
    for (const color of [kind.light, kind.body, kind.deep, kind.glow]) assert.match(color, /^#[0-9a-f]{6}$/);
  }
  assert.equal(new Set(o.ORB_MOODS.map((mood) => o.ORB_KINDS[mood].name)).size, 5);
  assert.equal(new Set(o.ORB_MOODS.map((mood) => o.ORB_KINDS[mood].body)).size, 5);
});

test("the low orbs are the blue ones", () => {
  const blue = (hex) => { const n = parseInt(hex.slice(1), 16); return (n & 255) > ((n >> 16) & 255) + 40; };
  assert.equal(blue(o.ORB_KINDS[1].body), true);
  assert.equal(blue(o.ORB_KINDS[2].body), true);
  assert.equal(blue(o.ORB_KINDS[5].body), false);
});

test("the orb follows the day's mood, and stays calm when mirroring is off or the day carries a crisis signal", () => {
  const on = { syncOn: true, crisis: false };
  for (const mood of [1, 2, 3, 4, 5]) assert.equal(o.orbMood(mood, on), mood);
  assert.equal(o.orbMood(1, { syncOn: false, crisis: false }), 3);
  assert.equal(o.orbMood(1, { syncOn: true, crisis: true }), 3);
  assert.equal(o.orbMood(5, { syncOn: true, crisis: true }), 3);
  for (const odd of [null, undefined, 0, 6, 2.5, "2"]) assert.equal(o.orbMood(odd, on), 3);
});

test("ten minutes by default; the dev shortcut is ignored in production", () => {
  assert.equal(o.ORB_STAY_MS, 600_000);
  assert.equal(o.orbNeedMs(600_000, null, true), 600_000);
  assert.equal(o.orbNeedMs(600_000, "20", false), 20_000);
  assert.equal(o.orbNeedMs(600_000, "20", true), 600_000);
  assert.equal(o.orbNeedMs(120_000, null, false), 120_000);
  for (const odd of ["", "abc", "-5", "1.5", "999999"]) assert.equal(o.orbNeedMs(600_000, odd, false), 600_000);
  for (const odd of [undefined, null, 0, -1, NaN, "600000"]) assert.equal(o.orbNeedMs(odd, null, true), 600_000);
  assert.equal(o.orbNeedMs(600_000, "0", false), 1_000);
});

test("the orb appears once the stay is full and never after it was found", () => {
  assert.equal(o.orbReady(null, 600_000), false);
  assert.equal(o.orbReady({ stayMs: 599_999, found: false }, 600_000), false);
  assert.equal(o.orbReady({ stayMs: 600_000, found: false }, 600_000), true);
  assert.equal(o.orbReady({ stayMs: 900_000, found: true }, 600_000), false);
  assert.equal(o.orbBeatDelay(600_000), 30_000);
  assert.equal(o.orbBeatDelay(20_000), 5_000);
  assert.equal(o.orbBeatDelay(1_000), 2_000);
});

test("today's state from the server is read strictly", () => {
  assert.deepEqual(plain(o.readOrbToday({ day: "2026-11-13", stayMs: 1200, needMs: 600000, found: false })), { day: "2026-11-13", stayMs: 1200, needMs: 600000, found: false });
  assert.equal(o.readOrbToday({ day: "2026-11-13", stayMs: 1, needMs: 600000, found: "yes" }).found, false);
  for (const bad of [null, {}, { day: "11/13", stayMs: 1, needMs: 1 }, { day: "2026-11-13", stayMs: -1, needMs: 1 }, { day: "2026-11-13", stayMs: 1, needMs: 0 }, { day: "2026-11-13", stayMs: "1", needMs: 1 }])
    assert.equal(o.readOrbToday(bad), null);
});

const SPOTS = [{ id: "a", name: "가", x: 0, z: 0 }, { id: "b", name: "나", x: 40, z: 0, r: 3 }, { id: "c", name: "다", x: 0, z: 40 }];
const anywhere = (x, z) => ({ x, z });

test("a day's place is the same all day, differs between people, and sits 2.5 to 5 m beside a named spot", () => {
  const first = o.pickOrbPlace(SPOTS, "user-1|2026-11-13|garden", anywhere, { x: 0, z: -10 });
  assert.deepEqual(plain(o.pickOrbPlace(SPOTS, "user-1|2026-11-13|garden", anywhere, { x: 0, z: -10 })), plain(first));
  const spot = SPOTS.find((s) => s.id === first.spotId);
  assert.equal(first.spotName, spot.name);
  const distance = Math.hypot(first.x - spot.x, first.z - spot.z) - (spot.r ?? 0);
  assert.ok(distance >= 2.49 && distance <= 5.01, `distance ${distance}`);
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(o.pickOrbPlace(SPOTS, `user-${i}|2026-11-13|garden`, anywhere, { x: 0, z: -10 }).spotId);
  assert.deepEqual([...seen].sort(), ["a", "b", "c"]);
  const days = new Set();
  for (let d = 1; d <= 28; d++) days.add(o.pickOrbPlace(SPOTS, `user-1|2026-11-${String(d).padStart(2, "0")}|garden`, anywhere, { x: 0, z: -10 }).spotId);
  assert.ok(days.size >= 2);
});

test("places that cannot be stood on, drift too far, fall inside the landmark or in water are skipped", () => {
  const onlyC = (x, z) => (z > 30 ? { x, z } : null);
  for (let i = 0; i < 20; i++) assert.equal(o.pickOrbPlace(SPOTS, `u${i}|d|m`, onlyC, { x: 0, z: -10 }).spotId, "c");
  // 엔진이 멀리 옮겨 버린 점은 쓰지 않는다: 모두 한 점으로 끌려가면 그 점에서 2.2m 안의 후보만 남는다
  const pulled = () => ({ x: 100, z: 100 });
  const lost = o.pickOrbPlace(SPOTS, "u|d|m", pulled, { x: 0, z: -10 });
  assert.equal(lost.spotId, null);
  assert.deepEqual([lost.x, lost.z], [0, -10]);
  // 자리의 물건 안쪽으로 밀려 들어간 점
  const intoLandmark = (x, z) => (Math.hypot(x - 40, z) < 12 ? { x: 40 + (x - 40) * 0.2, z: z * 0.2 } : null);
  assert.equal(o.pickOrbPlace(SPOTS, "u|d|m", intoLandmark, { x: 0, z: -10 }).spotId, null);
  // 피해야 하는 원
  const avoid = [{ x: 0, z: 0, r: 8 }, { x: 40, z: 0, r: 12 }];
  for (let i = 0; i < 20; i++) assert.equal(o.pickOrbPlace(SPOTS, `u${i}|d|m`, anywhere, { x: 0, z: -10 }, { avoid }).spotId, "c");
});

test("with nowhere to stand the orb waits beside the entrance, and a dev override pins one spot", () => {
  const nowhere = () => null;
  const lost = o.pickOrbPlace(SPOTS, "u|d|m", nowhere, { x: 1, z: 2 });
  assert.deepEqual(plain(lost), { spotId: null, spotName: "", x: 1, z: 2 });
  const beside = o.pickOrbPlace([], "u|d|m", anywhere, { x: 1, z: 2 });
  assert.equal(beside.spotId, null);
  const away = Math.hypot(beside.x - 1, beside.z - 2);
  assert.ok(away >= 2.49 && away <= 5.01);
  for (let i = 0; i < 10; i++) assert.equal(o.pickOrbPlace(SPOTS, `u${i}|d|m`, anywhere, { x: 0, z: 0 }, { only: "b" }).spotId, "b");
  assert.equal(o.pickOrbPlace(SPOTS, "u|d|m", anywhere, { x: 0, z: 0 }, { only: "zzz" }).spotId, null);
});

test("every map has named spots inside its bounds with ids the server accepts", () => {
  const bounds = { beach: [-22, 22, -15, 63], uyuni: [-22, 22, -50, 55], bamboo: [-55, 44, -4, 115], garden: [-60, 60, -30, 100], cloudspa: [-76, 76, -98, 130], baikal: [-120, 120, -240, 70] };
  assert.deepEqual(Object.keys(o.ORB_GROUNDS).sort(), Object.keys(bounds).sort());
  for (const [map, ground] of Object.entries(o.ORB_GROUNDS)) {
    assert.ok(ground.spots.length >= 6, `${map} has enough spots`);
    assert.equal(new Set(ground.spots.map((s) => s.id)).size, ground.spots.length, `${map} ids are unique`);
    const [minX, maxX, minZ, maxZ] = bounds[map];
    for (const spot of ground.spots) {
      assert.match(spot.id, /^[a-z0-9-]{1,40}$/);
      assert.ok(spot.name.trim() && spot.name.length <= 40 && !spot.name.includes("우울"));
      assert.ok(spot.x > minX && spot.x < maxX && spot.z > minZ && spot.z < maxZ, `${map}/${spot.id} is inside the map`);
    }
  }
});

const ORB = { id: "7", day: "2026-11-13", foundAt: 1763000000000, mood: 2, mapId: "garden", shared: true, spaceName: "공용 공간", spotId: "bench-ne", spotName: "북동쪽 호숫가 벤치",
  companions: [{ id: "u1", nick: "가람" }, { id: "u2", nick: "나루" }], companionCount: 3 };

test("an orb from the server is read strictly and odd ones are dropped", () => {
  assert.deepEqual(plain(o.readOrb(ORB)), ORB);
  assert.equal(o.readOrb({ ...ORB, mood: 6 }), null);
  assert.equal(o.readOrb({ ...ORB, day: "어제" }), null);
  assert.equal(o.readOrb({ ...ORB, id: 7 }), null);
  assert.equal(o.readOrb(null), null);
  const loose = o.readOrb({ id: "1", day: "2026-01-02", mood: 5, mapId: "beach", companions: [{ id: "u", nick: "  " }, "x", { id: 3, nick: "n" }, { id: "ok", nick: "다온" }] });
  assert.deepEqual(plain(loose.companions), [{ id: "ok", nick: "다온" }]);
  assert.equal(loose.companionCount, 1);
  assert.equal(loose.shared, false);
  assert.equal(loose.spotId, null);
  assert.equal(loose.spotName, "");
});

test("the shelf counts colours and writes dates without a device time zone", () => {
  assert.deepEqual(plain(o.orbTally([{ mood: 1 }, { mood: 1 }, { mood: 5 }])), { 1: 2, 2: 0, 3: 0, 4: 0, 5: 1 });
  assert.equal(o.orbDayLabel("2026-11-13"), "2026년 11월 13일 금요일");
  assert.equal(o.orbDayLabel("2026-01-01"), "2026년 1월 1일 목요일");
  assert.equal(o.orbDayShort("2026-03-07"), "3.7");
});

test("the note says where, in which space, and who was there", () => {
  assert.equal(o.orbPlaceLabel("봄물 정원", "북동쪽 호숫가 벤치"), "봄물 정원 · 북동쪽 호숫가 벤치 근처");
  assert.equal(o.orbPlaceLabel("바이칼", "  "), "바이칼");
  assert.equal(o.orbSpaceLabel({ shared: true, spaceName: "공용 공간" }), "누구나 쉬어 가는 공용 공간에서");
  assert.equal(o.orbSpaceLabel({ shared: false, spaceName: "밤산책" }), "밤산책 소로우 공간에서");
  assert.equal(o.orbSpaceLabel({ shared: false, spaceName: "" }), "소로우 공간에서");
  assert.equal(o.orbCompanionNote({ companions: [], companionCount: 0 }), "혼자 조용히 머문 날이에요.");
  assert.equal(o.orbCompanionNote({ companions: ORB.companions, companionCount: 2 }), "");
  assert.equal(o.orbCompanionNote(ORB), "그리고 지금은 이름이 남지 않은 1명");
  assert.match(o.orbCompanionNote({ companions: [], companionCount: 2 }), /^그때 2명이 함께 있었어요/);
});

test("album photos must carry an https address", () => {
  const photo = { id: "3", url: "https://cdn.example/feed/2026/11/13/u-1.webp", mapId: "uyuni", spaceName: "공용 공간", createdAt: 5 };
  assert.deepEqual(plain(o.readAlbumPhoto(photo)), photo);
  for (const url of ["http://cdn.example/a.webp", "javascript:alert(1)", "https://x/a b.webp", "", 5]) assert.equal(o.readAlbumPhoto({ ...photo, url }), null);
  assert.equal(o.readAlbumPhoto({ ...photo, id: "" }), null);
});
