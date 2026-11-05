import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

async function load(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(",")} };`, context);
  return context.api;
}

const trail = await load("../lib/beach/bamboo-trail.ts", {}, [
  "BAMBOO_BOUNDS", "TRAIL_WALK_HALF", "PAVILION_REACH", "PAVILION_SEAT_CAPACITY", "PAVILION_FLOOR_Y",
  "BAMBOO_PAVILIONS", "BAMBOO_PAVILION_SEATS", "BAMBOO_PAVILION_OBSTACLES", "BAMBOO_PAVILION_COLLIDERS", "BAMBOO_LANTERNS", "BAMBOO_FENCES",
  "TRAIL_POLYLINES", "pavilionWorld", "pavilionLocal", "pavilionSeat", "claimedPavilionSeat", "nearbyBambooPavilion",
  "bambooFloorHeight", "bambooCeilingHeight", "nearestOnTrail", "onTrail", "resolveTrail", "bambooStalkSites", "trailLength",
]);
const { daylightAt, bambooDaylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt", "bambooDaylightAt"]);
const maps = await load("../lib/beach/maps.ts", {}, ["MAPS", "mapHref"]);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);

test("the loop is a long closed walk that starts at the shared arrival point and never leaves the room", () => {
  const loop = trail.TRAIL_POLYLINES.find(line => line.id === "loop");
  assert.ok(loop.closed && loop.points.length >= 80);
  const length = trail.trailLength(loop);
  assert.ok(length > 110 && length < 180, `loop length ${length}`);
  for (const [x, z] of loop.points) {
    assert.ok(x > trail.BAMBOO_BOUNDS.minX + 1.5 && x < trail.BAMBOO_BOUNDS.maxX - 1.5, `x ${x}`);
    assert.ok(z > trail.BAMBOO_BOUNDS.minZ + 1 && z < trail.BAMBOO_BOUNDS.maxZ - 1, `z ${z}`);
  }
  assert.ok(trail.onTrail(0, 3), "the server's arrival point is on the entrance stem");
  assert.ok(trail.onTrail(0.8, 3.4) && trail.onTrail(-1.2, 3.2));
  assert.deepEqual([...trail.TRAIL_POLYLINES].map(line => line.id), ["loop", "entrance", "spur-wind", "spur-moon", "spur-pine", "spur-step"]);
});

test("the corridor slides a walker back toward the path or into a pavilion yard instead of stopping", () => {
  assert.deepEqual([...trail.resolveTrail(0, 3)], [0, 3]);
  const [x, z] = trail.resolveTrail(3, 1);
  assert.ok(trail.onTrail(x, z));
  assert.ok(Math.abs(trail.nearestOnTrail(x, z).distance - trail.TRAIL_WALK_HALF) < 0.02, "pushed back to the inside of the fence line");
  assert.ok(Math.abs(z - 1) < 0.3 && x > 1.3, "the push is perpendicular to the entrance stem");
  const moon = trail.BAMBOO_PAVILIONS.find(p => p.id === "moon");
  assert.ok(trail.onTrail(moon.x, moon.z), "the deck itself is walkable");
  const outside = trail.pavilionWorld(moon, -5, -1);
  const [yx, yz] = trail.resolveTrail(outside.x, outside.z);
  const local = trail.pavilionLocal(moon, yx, yz);
  assert.ok(Math.abs(local.lx + 3.4) < 0.01, `clamped to the yard edge (${local.lx})`); near(local.lz, -1, "the other axis is untouched");
  for (let i = 0; i < 400; i++) {
    const px = -22 + (i * 7919) % 44, pz = -4 + (i * 104729) % 59;
    const [rx, rz] = trail.resolveTrail(px, pz);
    assert.ok(trail.onTrail(rx, rz), `resolved point (${rx}, ${rz}) from (${px}, ${pz}) is walkable`);
  }
});

test("pavilion seats mirror the server table and surround three open edges facing outward", () => {
  assert.equal(trail.BAMBOO_PAVILIONS.length, 4);
  assert.equal(trail.BAMBOO_PAVILION_SEATS.length, 24);
  assert.equal(trail.PAVILION_SEAT_CAPACITY, 6);
  const moonSeats = trail.BAMBOO_PAVILION_SEATS.filter(seat => seat.spotId === "pavilion-moon");
  const expected = [[2.7, 46.92, Math.PI], [-0.7, 46.92, Math.PI], [3.42, 43.6, -Math.PI / 2], [3.42, 45.4, -Math.PI / 2], [-1.42, 43.6, Math.PI / 2], [-1.42, 45.4, Math.PI / 2]];
  moonSeats.forEach((seat, slot) => {
    assert.equal(seat.slot, slot);
    near(seat.x, expected[slot][0], `seat ${slot} x`); near(seat.z, expected[slot][1], `seat ${slot} z`); near(seat.yaw, expected[slot][2], `seat ${slot} yaw`);
    assert.equal(seat.avatarY, trail.PAVILION_FLOOR_Y);
    const ahead = { x: seat.x - Math.sin(seat.yaw) * 1.5, z: seat.z - Math.cos(seat.yaw) * 1.5 };
    assert.equal(trail.bambooFloorHeight(ahead.x, ahead.z), 0, "every seat looks out over the edge of the deck");
    assert.equal(trail.bambooFloorHeight(seat.x, seat.z), trail.PAVILION_FLOOR_Y, "the seat itself is on the deck");
  });
  const west = trail.pavilionSeat("pavilion-wind", 0);
  near(west.x, -15.78, "west pavilion step seat x"); near(west.z, 24.3, "west pavilion step seat z"); near(west.yaw, -Math.PI / 2, "faces +X toward the loop");
  assert.equal(trail.pavilionSeat("pavilion-wind", 6), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "lying", spotId: "pavilion-wind", slot: 0 }), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "sitting", spotId: "fire-benches", slot: 0 }), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "sitting", spotId: "pavilion-pine", slot: 5 }).id, "pavilion-pine-seat-5");
  assert.equal(trail.nearbyBambooPavilion(3.3, 43.5)?.id, "moon");
  assert.equal(trail.nearbyBambooPavilion(1, 40), null);
  assert.equal(trail.nearbyBambooPavilion(0, 3), null);
});

test("decks, steps, posts, railings and the roof clearance keep walking and the camera consistent", () => {
  const wind = trail.BAMBOO_PAVILIONS.find(p => p.id === "wind");
  const steps = trail.pavilionWorld(wind, 0, 3.1);
  const height = trail.bambooFloorHeight(steps.x, steps.z);
  assert.ok(height > 0 && height < trail.PAVILION_FLOOR_Y, `ramp height ${height}`);
  assert.equal(trail.bambooFloorHeight(...Object.values(trail.pavilionWorld(wind, 2, 3.1))), 0, "the ramp is only in front of the steps");
  assert.equal(trail.bambooCeilingHeight(0, 3), null);
  const centre = trail.bambooCeilingHeight(wind.x, wind.z), eave = trail.bambooCeilingHeight(...Object.values(trail.pavilionWorld(wind, 3.2, 0)));
  assert.ok(centre > eave && eave > trail.PAVILION_FLOOR_Y + 2.5, `ceiling ${centre} / ${eave}`);
  assert.equal(trail.BAMBOO_PAVILION_OBSTACLES.length, 24);
  assert.equal(trail.BAMBOO_PAVILION_COLLIDERS.length, 4);
  for (const wall of trail.BAMBOO_PAVILION_COLLIDERS) {
    assert.ok(wall.maxX > wall.minX && wall.maxZ > wall.minZ);
    const seatInside = trail.BAMBOO_PAVILION_SEATS.some(seat => seat.x > wall.minX - 0.3 && seat.x < wall.maxX + 0.3 && seat.z > wall.minZ - 0.3 && seat.z < wall.maxZ + 0.3);
    assert.equal(seatInside, false, "no seat sits inside the back railing");
  }
  for (const seat of trail.BAMBOO_PAVILION_SEATS) {
    assert.ok(trail.onTrail(seat.x, seat.z), "seats are reachable inside the yard corridor");
    assert.ok(trail.BAMBOO_PAVILION_OBSTACLES.every(post => Math.hypot(post.x - seat.x, post.z - seat.z) > 0.16 + 0.3), "seats are clear of the posts");
  }
});

test("lanterns, fences and stalks keep off the walkway and the pavilion yards", () => {
  const stones = trail.BAMBOO_LANTERNS.filter(l => l.kind === "stone"), paper = trail.BAMBOO_LANTERNS.filter(l => l.kind === "paper");
  assert.ok(stones.length >= 26 && stones.length <= 40, `stone lanterns ${stones.length}`);
  assert.equal(paper.length, 8);
  for (const lantern of stones) {
    const d = trail.nearestOnTrail(lantern.x, lantern.z).distance;
    assert.ok(d > 1.8 && d < 2.3, `lantern beside the path, not on it (${d})`);
    assert.equal(trail.onTrail(lantern.x, lantern.z), false, "lanterns stand outside the walkable corridor");
  }
  assert.ok(trail.BAMBOO_FENCES.length > 150);
  for (const run of trail.BAMBOO_FENCES) {
    const d = trail.nearestOnTrail((run.ax + run.bx) / 2, (run.az + run.bz) / 2).distance;
    assert.ok(d > 1.2 && d < 2.0, `fence offset ${d}`);
  }
  const sites = trail.bambooStalkSites();
  assert.ok(sites.length > 1800 && sites.length < 4200, `stalk count ${sites.length}`);
  for (const site of sites) {
    assert.ok(trail.nearestOnTrail(site.x, site.z).distance >= 2.6, "no stalk stands on the lanterns, fence or brush");
    assert.equal(trail.onTrail(site.x, site.z), false);
    assert.ok(site.height >= 8.5 && site.height <= 13 && site.radius >= 0.055 && site.radius <= 0.1);
  }
  assert.equal(JSON.stringify(trail.bambooStalkSites().slice(0, 3)), JSON.stringify(sites.slice(0, 3)), "placement is deterministic");
});

test("the forest palette keeps the shared clock, closes the fog in and turns the lanterns on with the stars", () => {
  for (const hour of [6, 12, 17.75, 19, 21, 2]) {
    const base = daylightAt(hour), forest = bambooDaylightAt(hour);
    assert.equal(forest.hour, base.hour);
    assert.equal(forest.lanterns, base.lanterns);
    assert.equal(forest.stars, base.stars);
    assert.deepEqual([...forest.sun], [...base.sun]);
    assert.equal(forest.fogNear, 12); assert.equal(forest.fogFar, 54);
    assert.ok(forest.fog.every((v, i) => v >= 0 && v <= 1 && Number.isFinite(base.fog[i])));
  }
  assert.ok(bambooDaylightAt(12).fog[1] > bambooDaylightAt(12).fog[2], "daytime haze is green, not blue");
  assert.ok(bambooDaylightAt(23).fog.every(v => v < 0.12), "deep night fog is dark");
  assert.ok(bambooDaylightAt(12).tint[1] >= bambooDaylightAt(12).tint[0], "canopy shade favours green on the sprites");
  assert.equal(bambooDaylightAt(13).lanterns, 0); assert.equal(bambooDaylightAt(22).lanterns, 1);
  assert.equal(maps.MAPS.bamboo.name, "대나무숲");
  assert.equal(maps.mapHref("bamboo", "circle / one"), "/bamboo?communityId=circle%20%2F%20one");
});

test("bamboo is a private fullscreen route that reuses the scene with its own map id", async () => {
  const [route, layout, tabbar, scene, net] = await Promise.all(["../app/bamboo/page.tsx", "../app/bamboo/layout.tsx", "../components/TabBar.tsx", "../components/beach/BeachScene.tsx", "../lib/beach/net.ts"]
    .map(file => readFile(new URL(file, import.meta.url), "utf8")));
  assert.match(route, /search\.get\("communityId"\)/);
  assert.match(route, /<BeachScene[^>]+communityId=\{communityId\}[^>]+mapId="bamboo"/);
  assert.match(layout, /robots:\s*\{ index: false, follow: false \}/);
  assert.match(tabbar, /path === "\/bamboo"/);
  assert.match(scene, /mapId === "bamboo" && \(pavilion\.near \|\| pavilion\.seated/, "the pavilion seat button only appears in the forest");
  assert.match(net, /pavilionEnabled: mapId === "bamboo"/);
  assert.match(net, /"pavilion-wind", "pavilion-moon", "pavilion-pine", "pavilion-step"/, "pavilion claims are validated like the other seats");
});
