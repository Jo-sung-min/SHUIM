import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import { hotSpring } from "./beach-world-fixture.mjs";

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
  "GARDEN_BOUNDS", "GARDEN_WALK_RADIUS", "GROUND_Y", "BRIDGE_Y", "PIER_Y", "BOAT_DECK_Y", "GARDEN_SPAWN", "LAKE", "ISLAND", "HALL", "HALL_TIERS", "HALL_BENCH_HEIGHT",
  "lakeSigned", "lakeRadiusAt", "isWater", "hallFloorHeight", "GARDEN_PAVILIONS", "GARDEN_SEATS", "gardenSeat", "claimedGardenSeat", "nearbyGardenPavilion",
  "gardenPavilionForSpot", "GARDEN_PIERS", "pierEnd", "onPier", "GARDEN_BRIDGE", "onBridge", "GARDEN_LOOP_POINTS", "GARDEN_POLYLINES",
  "onGardenGround", "resolveGardenWalk", "gardenFloorHeight", "gardenCeilingHeight", "GARDEN_WALLS", "BOAT_STOPS", "BOAT_ROUTE", "boatPoseAt",
  "nextBoatStop", "nearestBoatStop", "gardenRainAt", "RAIN_PERIOD_MS", "GARDEN_WILLOWS", "GARDEN_LANTERNS", "lotusPads", "reedSites", "GARDEN_OBSTACLES",
]);
const { daylightAt, gardenDaylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt", "gardenDaylightAt"]);
const maps = await load("../lib/beach/maps.ts", {}, ["MAPS", "mapHref"]);
const near = (actual, expected, message, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${message}: ${actual} vs ${expected}`);
const navigation = await load("../lib/beach/navigation.ts", {}, ["resolveWalls"]);
const engineSource = await readFile(new URL("../lib/beach/engine.ts", import.meta.url), "utf8");
const collisionStart = engineSource.indexOf("  private collide("), collisionEnd = engineSource.indexOf("  private deckHeight(", collisionStart);
assert.ok(collisionStart >= 0 && collisionEnd > collisionStart, "the actual engine collision method is exercised");
const collisionContext = { ...hotSpring, ...garden, ...navigation };
vm.runInNewContext(stripTypeScriptTypes(`class WalkingEngine { ${engineSource.slice(collisionStart, collisionEnd)} }\nglobalThis.collide = WalkingEngine.prototype.collide;`), collisionContext);
const walkingEngine = { uyuni: null, bamboo: null, garden: {}, obstacles: garden.GARDEN_OBSTACLES };
const collide = (x, z) => collisionContext.collide.call(walkingEngine, x, z);

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
  const outside = garden.resolveGardenWalk(-16, 68);
  assert.ok(garden.onGardenGround(...outside));
  near(outside[0], -16, "walking on exterior grass does not teleport through the hall wall");
  const yard = garden.resolveGardenWalk(0, -11);
  assert.ok(yard[0] === 0 && yard[1] === -11);
  const door = garden.resolveGardenWalk(-16.5, 76);
  assert.ok(door[0] === -16.5 && door[1] === 76, "the west door ramp is walkable");
  assert.ok(garden.onGardenGround(garden.ISLAND.x, garden.ISLAND.z));
  const island = garden.resolveGardenWalk(garden.ISLAND.x - 9, garden.ISLAND.z);
  assert.ok(!garden.isWater(...island));
});

test("the entrance photo court reaches both sculptures and keeps the old gate passage open", () => {
  for (const [x, z] of [[-10, -14.4], [10, -14.4], [0, -18], [0, -16], [0, -11], [0, -3]]) {
    assert.ok(garden.onGardenGround(x, z), `photo approach ${x},${z}`);
    const resolved = garden.resolveGardenWalk(x, z);
    near(resolved[0], x, "open photo approach x"); near(resolved[1], z, "open photo approach z");
    near(garden.gardenFloorHeight(x, z), garden.GROUND_Y, "no hidden step at the former wall");
  }
  for (const [x, z] of [[-16, -14.4], [16, -14.4], [0, -23]]) {
    const resolved = garden.resolveGardenWalk(x, z);
    assert.ok(garden.onGardenGround(...resolved));
    assert.ok(Math.hypot(resolved[0] - x, resolved[1] - z) < 6, "outside edge slides onto nearby court");
  }
});

test("open lawn remains freely walkable well away from the old narrow paths", () => {
  near(garden.GARDEN_WALK_RADIUS, 52, "the lawn includes the full photo platforms on the SOROW arch circle");
  for (const side of [-1, 1]) {
    for (let step = 0; step <= 100; step++) {
      const x = side * (20 + 11 * step / 100), z = 5 * step / 100;
      assert.ok(trail.nearestOnTrail(x, z, garden.GARDEN_POLYLINES).distance > trail.TRAIL_WALK_HALF + .5,
        "this walk exercises grass beyond the former path corridor");
      assert.ok(garden.onGardenGround(x, z) && !garden.isWater(x, z));
      const actual = garden.resolveGardenWalk(x, z);
      near(actual[0], x, "lawn movement keeps its requested x");
      near(actual[1], z, "lawn movement keeps its requested z");
    }
  }
});

test("small outward steps slide along the lawn edge without snapping to a distant path", () => {
  let blocked = 0;
  for (let degrees = 0; degrees < 360; degrees += 2) {
    const a = degrees * Math.PI / 180, dx = Math.cos(a), dz = Math.sin(a);
    let x = garden.LAKE.x + dx * (garden.GARDEN_WALK_RADIUS - .2);
    let z = garden.LAKE.z + dz * (garden.GARDEN_WALK_RADIUS - .2);
    const initial = collide(x, z);
    if (Math.hypot(initial[0] - x, initial[1] - z) > 1e-6) continue; // Do not spawn inside a solid wall.
    for (let frame = 0; frame < 12; frame++) {
      const requested = [x + dx * .12, z + dz * .12];
      const next = collide(...requested);
      assert.ok(Math.hypot(next[0] - x, next[1] - z) <= .25,
        `boundary movement stays local at ${degrees} degrees`);
      assert.ok(garden.onGardenGround(...next) && !garden.isWater(...next));
      if (Math.hypot(next[0] - requested[0], next[1] - requested[1]) > .05) blocked++;
      [x, z] = next;
    }
  }
  assert.ok(blocked > 100, "the actual circular boundary is exercised, not just existing paths");
  for (const point of [[NaN, 0], [0, Infinity], [1000, 1000], [-1000, -1000]]) {
    assert.equal(garden.onGardenGround(...point), false);
    const next = garden.resolveGardenWalk(...point);
    assert.ok(next.every(Number.isFinite) && garden.onGardenGround(...next));
  }
});

test("walking toward every shore stops safely while the original northern paths stay open", () => {
  let shores = 0;
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const a = degrees * Math.PI / 180, dx = Math.cos(a), dz = Math.sin(a);
    const radius = garden.lakeRadiusAt(a) + .4;
    let x = garden.LAKE.x + dx * radius, z = garden.LAKE.z + dz * radius;
    const initial = collide(x, z);
    if (Math.hypot(initial[0] - x, initial[1] - z) > 1e-6) continue; // Existing walls and trunks cannot be starting positions.
    shores++;
    for (let frame = 0; frame < 120; frame++) {
      const next = collide(x - dx * .06, z - dz * .06);
      assert.ok(garden.onGardenGround(...next) && !garden.isWater(...next), `shore remains dry at ${degrees} degrees`);
      assert.ok(Math.hypot(next[0] - x, next[1] - z) <= .35, `shore movement stays local at ${degrees} degrees`);
      [x, z] = next;
    }
  }
  assert.ok(shores > 50, "walk toward all accessible shore sectors, including both sides and the south bank");
  const north = garden.GARDEN_LOOP_POINTS.filter(([x, z]) => Math.hypot(x - garden.LAKE.x, z - garden.LAKE.z) > garden.GARDEN_WALK_RADIUS);
  assert.ok(north.length > 3, "the old north loop extends beyond the new lawn circle");
  for (const [x, z] of north) {
    assert.ok(garden.onGardenGround(x, z));
    const next = garden.resolveGardenWalk(x, z);
    near(next[0], x, "north path x is preserved");
    near(next[1], z, "north path z is preserved");
  }
});

test("production walking collisions keep lawn walkers outside hall walls and willow trunks while doors stay open", () => {
  const { HALL } = garden;
  for (const side of [-1, 1]) {
    let x = HALL.x + side * (HALL.halfX + 2), z = HALL.glassZ + 8;
    for (let frame = 0; frame < 80; frame++) {
      [x, z] = collide(x - side * .08, z);
      assert.ok(side * (x - HALL.x) >= HALL.halfX + .5, "grass beside the hall cannot bypass its side wall");
    }
    x = HALL.x + side * (HALL.halfX + 2); z = HALL.doorZ;
    for (let frame = 0; frame < 55; frame++) [x, z] = collide(x - side * .08, z);
    assert.ok(side * (x - HALL.x) < HALL.halfX - 2, "the existing side doorway remains passable");
  }
  for (const [edge, direction] of [[HALL.glassZ, -1], [HALL.backZ, 1]]) {
    let x = HALL.x, z = edge - direction * 2;
    for (let frame = 0; frame < 80; frame++) {
      [x, z] = collide(x, z + direction * .08);
      assert.ok(direction * (z - edge) <= -.5, "the window and back wall remain solid from inside");
    }
  }
  for (const tree of garden.GARDEN_WILLOWS) {
    const obstacle = garden.GARDEN_OBSTACLES.find(o => o.x === tree.x && o.z === tree.z);
    assert.ok(obstacle?.r > .1, "each newly reachable willow has a solid trunk");
    const distance = Math.hypot(tree.x - garden.LAKE.x, tree.z - garden.LAKE.z);
    const dx = (tree.x - garden.LAKE.x) / distance, dz = (tree.z - garden.LAKE.z) / distance;
    let x = tree.x + dx * 1.4, z = tree.z + dz * 1.4;
    for (let frame = 0; frame < 40; frame++) {
      const next = collide(x - dx * .06, z - dz * .06);
      assert.ok(Math.hypot(next[0] - tree.x, next[1] - tree.z) >= obstacle.r + .35 - 1e-8, "walking cannot pass through the trunk");
      assert.ok(Math.hypot(next[0] - x, next[1] - z) <= .2, "trunk contact does not snap the walker away");
      assert.ok(!garden.isWater(...next));
      [x, z] = next;
    }
  }
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

test("original thirty seats stay aligned alongside twelve new pond bench seats", () => {
  assert.equal(garden.GARDEN_PAVILIONS.length, 11);
  assert.equal(garden.GARDEN_SEATS.length, 42);
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
  assert.equal(garden.GARDEN_OBSTACLES.length, 6 + garden.GARDEN_WILLOWS.length, "original pavilion posts and newly reachable willow trunks stay solid");
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
