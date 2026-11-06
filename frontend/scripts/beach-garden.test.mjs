import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

async function load(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/^export \{[^\n]+\} from [^\n]+$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(",")} };`, context);
  return context.api;
}

const trail = await load("../lib/beach/bamboo-trail.ts", {}, [
  "PAVILION_HALF", "PAVILION_REACH", "PAVILION_RISE", "PAVILION_STEP_HALF_WIDTH", "PAVILION_STEP_LENGTH", "PAVILION_POST_HEIGHT", "PAVILION_EAVE",
  "PAVILION_SEAT_CAPACITY", "TRAIL_WALK_HALF", "nearestOnTrail", "sampleCatmullRom", "seededRandom",
]);
const garden = await load("../lib/beach/garden-layout.ts", trail, [
  "GARDEN_BOUNDS", "GROUND_Y", "BRIDGE_Y", "PIER_Y", "BOAT_DECK_Y", "GARDEN_SPAWN", "LAKE", "ISLAND", "HALL", "HALL_TIERS", "HALL_BENCH_HEIGHT",
  "lakeSigned", "isWater", "hallFloorHeight", "GARDEN_PAVILIONS", "GARDEN_SEATS", "gardenSeat", "claimedGardenSeat", "nearbyGardenPavilion",
  "gardenPavilionForSpot", "GARDEN_PIERS", "pierEnd", "onPier", "GARDEN_BRIDGE", "onBridge", "GARDEN_LOOP_POINTS", "GARDEN_POLYLINES",
  "onGardenGround", "resolveGardenWalk", "gardenFloorHeight", "gardenCeilingHeight", "GARDEN_WALLS", "BOAT_STOPS", "BOAT_ROUTE", "boatPoseAt",
  "nextBoatStop", "nearestBoatStop", "gardenRainAt", "RAIN_PERIOD_MS", "GARDEN_WILLOWS", "GARDEN_LANTERNS", "lotusPads", "reedSites", "GARDEN_OBSTACLES",
]);
const { daylightAt, gardenDaylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt", "gardenDaylightAt"]);
const maps = await load("../lib/beach/maps.ts", {}, ["MAPS", "mapHref"]);
const near = (actual, expected, message, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${message}: ${actual} vs ${expected}`);

test("the lake is water in the middle, land at the island, the gate and behind the hall", () => {
  assert.ok(garden.lakeSigned(0, 34) < -8, "the middle of the lake is far from every shore, the island included");
  assert.ok(garden.isWater(0, 34));
  assert.ok(garden.lakeSigned(garden.ISLAND.x, garden.ISLAND.z) > 6);
  assert.ok(!garden.isWater(garden.ISLAND.x, garden.ISLAND.z));
  assert.ok(garden.lakeSigned(0, -11) > 3, "spawn stands well back from the south shore");
  assert.ok(!garden.isWater(0, 70), "the hall floor is a structure, never water");
  assert.ok(garden.lakeSigned(0, 58) < 0 && garden.isWater(0, 58), "water reaches the glass wall in the middle");
});

test("the shore loop, the gate spur and the piers stay on land and the walkable test agrees", () => {
  for (const [x, z] of garden.GARDEN_LOOP_POINTS) {
    assert.ok(garden.lakeSigned(x, z) > 1.2, `loop point ${x},${z} sits back from the water (${garden.lakeSigned(x, z)})`);
    assert.ok(garden.onGardenGround(x, z), `loop point ${x},${z} walkable`);
  }
  assert.ok(garden.onGardenGround(garden.GARDEN_SPAWN.x, garden.GARDEN_SPAWN.z));
  for (const pier of garden.GARDEN_PIERS) {
    assert.ok(garden.lakeSigned(pier.x, pier.z) > 0.2, `${pier.id} pier starts on land`);
    const end = garden.pierEnd(pier);
    assert.ok(garden.lakeSigned(end.x, end.z) < -1.5, `${pier.id} pier ends over water (${garden.lakeSigned(end.x, end.z)})`);
    assert.equal(garden.onPier(end.x, end.z)?.id, pier.id);
    assert.ok(garden.onGardenGround(end.x, end.z));
    assert.ok(!garden.isWater(end.x, end.z));
    near(garden.gardenFloorHeight(end.x, end.z), garden.PIER_Y, "pier deck height");
  }
  for (const [x, z] of garden.GARDEN_BRIDGE) {
    assert.ok(garden.onBridge(x, z) && garden.onGardenGround(x, z), `bridge point ${x},${z}`);
    near(garden.gardenFloorHeight(x, z), garden.BRIDGE_Y, "bridge deck");
  }
  assert.ok(garden.lakeSigned(garden.GARDEN_BRIDGE[0][0], garden.GARDEN_BRIDGE[0][1]) > 0, "bridge begins on the west shore");
  assert.ok(garden.lakeSigned(-28, 41) < -1, "the bridge crosses open water");
});

test("walking never enters the water and slides back to the nearest allowed spot", () => {
  const [x, z] = garden.resolveGardenWalk(0, 8);
  assert.ok(garden.onGardenGround(x, z) && !garden.isWater(x, z), "south shore water pushes back to the loop");
  assert.ok(Math.hypot(x - 0, z - 8) < 8);
  const inside = garden.resolveGardenWalk(-15.4, 68);
  assert.ok(garden.onGardenGround(...inside));
  assert.ok(Math.abs(inside[0]) <= garden.HALL.halfX, "pushing through the hall wall keeps the walker inside");
  const yard = garden.resolveGardenWalk(0, -11);
  assert.ok(yard[0] === 0 && yard[1] === -11);
  const door = garden.resolveGardenWalk(-16.5, 76);
  assert.ok(door[0] === -16.5 && door[1] === 76, "the west door ramp is walkable");
  assert.ok(garden.onGardenGround(garden.ISLAND.x, garden.ISLAND.z));
  const island = garden.resolveGardenWalk(garden.ISLAND.x - 9, garden.ISLAND.z);
  assert.ok(!garden.isWater(...island));
});

test("hall tiers descend toward the glass, the stairs are continuous and the side doors ramp to the ground", () => {
  const { HALL, HALL_TIERS } = garden;
  near(garden.hallFloorHeight(8, HALL.glassZ + 2), HALL_TIERS[0].y, "window tier");
  near(garden.hallFloorHeight(-8, HALL.glassZ + 18), HALL_TIERS[3].y, "back tier");
  assert.equal(garden.hallFloorHeight(0, HALL.glassZ - 2), null);
  let previous = garden.hallFloorHeight(0, HALL.glassZ + 0.2);
  for (let lz = 0.2; lz <= 19.8; lz += 0.1) {
    const h = garden.hallFloorHeight(0, HALL.glassZ + lz);
    assert.ok(h >= previous - 1e-9 && h - previous < 0.09, `stairs rise smoothly at ${lz.toFixed(1)} (${previous} -> ${h})`);
    previous = h;
  }
  near(previous, HALL_TIERS[3].y, "stairs reach the back tier");
  near(garden.hallFloorHeight(-15.05, HALL.doorZ), HALL_TIERS[3].y, "door sill", 0.05);
  near(garden.hallFloorHeight(-18.1, HALL.doorZ), garden.GROUND_Y, "foot of the door steps", 0.06);
  assert.equal(garden.hallFloorHeight(-16, HALL.doorZ + 3), null, "no ramp beside the door");
  assert.ok(garden.gardenCeilingHeight(0, 70) > 14);
  assert.equal(garden.gardenCeilingHeight(0, 30), null);
  assert.ok(garden.GARDEN_WALLS.length >= 7);
});

test("thirty server-mirrored seats: four hall tiers facing the glass and the island pavilion", () => {
  assert.equal(garden.GARDEN_PAVILIONS.length, 5);
  assert.equal(garden.GARDEN_SEATS.length, 30);
  const hall = garden.GARDEN_SEATS.filter((seat) => seat.spotId.startsWith("hall-tier-"));
  assert.equal(hall.length, 24);
  for (const seat of hall) {
    near(seat.yaw, 0, `${seat.id} faces the window (-z)`);
    const tier = garden.gardenPavilionForSpot(seat.spotId);
    near(seat.z, tier.z, "seat row");
    near(seat.avatarY, tier.floorY + garden.HALL_BENCH_HEIGHT, "bench height");
    near(garden.gardenFloorHeight(seat.x, seat.z), tier.floorY, `${seat.id} floor under the bench`);
    assert.ok(garden.onGardenGround(seat.x, seat.z));
  }
  // Mirror of BeachRoom.pavilionSeat(): x = cx + lx*rx + lz*fx, z = cz + lx*rz + lz*fz with rx=-fz, rz=fx.
  const island = garden.gardenPavilionForSpot("pavilion-island");
  assert.equal(island.fx, -1); assert.equal(island.fz, 0);
  const seat0 = garden.gardenSeat("pavilion-island", 0);
  near(seat0.x, island.x + 2.42 * -1, "island seat 0 x");
  near(seat0.z, island.z + -1.7 * -1, "island seat 0 z");
  near(seat0.avatarY, island.floorY, "pavilion seat sits on the deck edge");
  assert.equal(garden.gardenSeat("pavilion-island", 6), null);
  assert.equal(garden.claimedGardenSeat({ pose: "sitting", spotId: "hall-tier-2", slot: 3 })?.spotId, "hall-tier-2");
  assert.equal(garden.claimedGardenSeat({ pose: "standing", spotId: "hall-tier-2", slot: 3 }), null);
  assert.equal(garden.nearbyGardenPavilion(hall[0].x + 1, hall[0].z + 0.5)?.spotId, hall[0].spotId);
  assert.equal(garden.nearbyGardenPavilion(0, 34), null);
  assert.equal(garden.GARDEN_OBSTACLES.length, 6);
});

test("the boat route stays in open water, visits all three piers and reports the next stop", () => {
  const { BOAT_ROUTE, BOAT_STOPS } = garden;
  assert.ok(BOAT_ROUTE.total > 150 && BOAT_ROUTE.total < 260, `loop length ${BOAT_ROUTE.total}`);
  for (let s = 0; s < BOAT_ROUTE.total; s += 1) {
    const pose = garden.boatPoseAt(s);
    assert.ok(garden.lakeSigned(pose.x, pose.z) < -2.2, `route at ${s.toFixed(0)} m (${pose.x.toFixed(1)}, ${pose.z.toFixed(1)}) is ${garden.lakeSigned(pose.x, pose.z).toFixed(2)} from shore`);
    assert.ok(!garden.onBridge(pose.x, pose.z, 1.2) && garden.onPier(pose.x, pose.z, 0.4) === null, `route clear of structures at ${s}`);
    assert.ok(Number.isFinite(pose.yaw));
  }
  BOAT_STOPS.forEach((stop, index) => {
    const pose = garden.boatPoseAt(BOAT_ROUTE.stopAt[index]);
    assert.ok(Math.hypot(pose.x - stop.x, pose.z - stop.z) < 0.6, `${stop.id} stop lies on the route`);
    const pier = garden.GARDEN_PIERS.find((p) => p.id === stop.pierId), end = garden.pierEnd(pier);
    assert.ok(Math.hypot(stop.x - end.x, stop.z - end.z) < 2.4, `${stop.id} stop is beside its pier end`);
    assert.equal(garden.nearestBoatStop(end.x, end.z)?.id, stop.id, "standing on the pier end can board");
  });
  assert.equal(garden.nearestBoatStop(0, -11), null);
  assert.equal(garden.nextBoatStop(BOAT_ROUTE.stopAt[0] + 1), 1);
  assert.equal(garden.nextBoatStop(BOAT_ROUTE.stopAt[2] + 1), 0);
  assert.equal(garden.nextBoatStop(BOAT_ROUTE.stopAt[1]), 1, "standing at a stop counts that stop");
  near(garden.gardenFloorHeight(0, 34), garden.BOAT_DECK_Y, "riders stand on the boat deck");
});

test("rain follows server time: every forty-minute block has one shower that fades in and out", () => {
  const period = garden.RAIN_PERIOD_MS;
  for (let block = 0; block < 12; block++) {
    let wet = 0, peak = 0;
    for (let t = 0; t < period; t += 30_000) {
      const rain = garden.gardenRainAt(block * period + t);
      assert.ok(rain >= 0 && rain <= 1);
      if (rain > 0.01) wet += 30_000;
      peak = Math.max(peak, rain);
    }
    assert.ok(wet > 13 * 60_000 && wet < 19 * 60_000, `block ${block} rains for ${wet / 60_000} min`);
    assert.ok(peak >= 0.45, `block ${block} peak ${peak}`);
  }
  const t0 = 3 * period;
  let last = garden.gardenRainAt(t0);
  for (let t = t0; t < t0 + period; t += 5_000) {
    const now = garden.gardenRainAt(t);
    assert.ok(Math.abs(now - last) < 0.08, "rain never jumps");
    last = now;
  }
});

test("willows, lanterns, lotus pads and reeds are planted where they belong", () => {
  assert.ok(garden.GARDEN_WILLOWS.length >= 12);
  for (const tree of garden.GARDEN_WILLOWS) {
    assert.ok(garden.lakeSigned(tree.x, tree.z) > 0.8, `willow at ${tree.x.toFixed(1)},${tree.z.toFixed(1)} on land`);
    assert.ok(!garden.onGardenGround(tree.x, tree.z) || garden.onPier(tree.x, tree.z) === null);
  }
  assert.ok(garden.GARDEN_LANTERNS.length >= 20);
  for (const lantern of garden.GARDEN_LANTERNS) assert.ok(garden.lakeSigned(lantern.x, lantern.z) > 0.4);
  const pads = garden.lotusPads();
  assert.ok(pads.length > 150, `pads ${pads.length}`);
  for (const pad of pads) assert.ok(garden.isWater(pad.x, pad.z));
  assert.ok(pads.some((pad) => pad.flower));
  const reeds = garden.reedSites();
  assert.ok(reeds.length > 50);
  const seen = new Set(pads.map((pad) => `${pad.x.toFixed(3)},${pad.z.toFixed(3)}`));
  assert.equal(seen.size, pads.length, "deterministic, distinct pads");
});

test("the garden daylight keeps a paper-toned haze that opens far across the water", () => {
  for (const hour of [6, 12, 15, 18, 19.5, 22, 2]) {
    const d = gardenDaylightAt(hour), base = daylightAt(hour);
    assert.ok(d.fogNear >= 30 && d.fogFar >= 150, `open fog at ${hour}`);
    assert.equal(d.stars, base.stars);
    assert.equal(d.lanterns, base.lanterns);
    assert.ok(d.fog.every((c) => c >= 0 && c <= 1));
  }
  const noon = gardenDaylightAt(12);
  assert.ok(noon.fog[0] > 0.8 && noon.fog[1] > 0.8, "daytime haze reads as paper");
  const night = gardenDaylightAt(23);
  assert.ok(night.fog[0] < 0.12 && night.fog[2] > night.fog[0], "night haze is blue ink");
});

test("the fourth map is registered with its own copy and link", () => {
  assert.equal(maps.MAPS.garden.id, "garden");
  assert.equal(maps.MAPS.garden.path, "/garden");
  assert.equal(maps.mapHref("garden", "c 1"), "/garden?communityId=c%201");
  assert.ok(maps.MAPS.garden.name.includes("봄물"));
});
