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
  "BAMBOO_BOUNDS", "TRAIL_WALK_HALF", "PAVILION_REACH", "PAVILION_SEAT_CAPACITY", "PAVILION_RISE", "DECK_RISE", "DECK_BENCH_HEIGHT",
  "MOUNTAIN", "SUMMIT", "MEADOW", "SUMMIT_HEIGHT",
  "BAMBOO_PAVILIONS", "BAMBOO_PAVILION_SEATS", "BAMBOO_PAVILION_OBSTACLES", "BAMBOO_PAVILION_COLLIDERS", "BAMBOO_LANTERNS", "BAMBOO_FENCES",
  "TRAIL_POLYLINES", "pavilionWorld", "pavilionLocal", "pavilionSeat", "claimedPavilionSeat", "nearbyBambooPavilion",
  "mountainHeight", "groundHeight", "bambooFloorHeight", "bambooCeilingHeight", "nearestOnTrail", "onTrail", "resolveTrail", "bambooStalkSites", "trailLength",
]);
const { daylightAt, bambooDaylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt", "bambooDaylightAt"]);
const maps = await load("../lib/beach/maps.ts", {}, ["MAPS", "mapHref"]);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
const byId = id => trail.BAMBOO_PAVILIONS.find(p => p.id === id);

test("the loop is a long climb that starts at the shared arrival point and stays inside the wider room", () => {
  const loop = trail.TRAIL_POLYLINES.find(line => line.id === "loop");
  assert.ok(loop.closed && loop.points.length >= 100);
  const length = trail.trailLength(loop);
  assert.ok(length > 200 && length < 280, `loop length ${length}`);
  for (const [x, z] of loop.points) {
    assert.ok(x > trail.BAMBOO_BOUNDS.minX + 1.5 && x < trail.BAMBOO_BOUNDS.maxX - 1.5, `x ${x}`);
    assert.ok(z > trail.BAMBOO_BOUNDS.minZ + 1 && z < trail.BAMBOO_BOUNDS.maxZ - 1, `z ${z}`);
  }
  assert.deepEqual([trail.BAMBOO_BOUNDS.minX, trail.BAMBOO_BOUNDS.maxX, trail.BAMBOO_BOUNDS.minZ, trail.BAMBOO_BOUNDS.maxZ], [-44, 44, -4, 115]);
  assert.ok(trail.onTrail(0, 3), "the server's arrival point is on the entrance stem");
  assert.ok(trail.onTrail(0.8, 3.4) && trail.onTrail(-1.2, 3.2));
  assert.deepEqual([...trail.TRAIL_POLYLINES].map(line => line.id), ["loop", "entrance", "spur-step", "spur-wind", "spur-pine", "spur-moon", "spur-summit"]);
});

test("the mountain rises from a flat trailhead to a flat summit, with the path terraced across the slope", () => {
  assert.ok(Math.abs(trail.mountainHeight(0, 3)) < 0.8, "the trailhead is level ground");
  assert.ok(trail.SUMMIT_HEIGHT > 18 && trail.SUMMIT_HEIGHT < 22, `summit ${trail.SUMMIT_HEIGHT}`);
  const foot = trail.groundHeight(0, 7), middle = trail.groundHeight(-26, 40), top = trail.groundHeight(0, 90);
  assert.ok(foot < middle && middle < top, `the loop climbs: ${foot} < ${middle} < ${top}`);
  assert.ok(top > trail.SUMMIT_HEIGHT - 0.5, "the top of the loop is on the summit plateau");
  for (const [x, z] of [[-26, 40], [25, 56], [19, 26]]) {
    const hit = trail.nearestOnTrail(x, z);
    const across = { x: -hit.tz, z: hit.tx };
    const left = trail.groundHeight(hit.x + across.x, hit.z + across.z), right = trail.groundHeight(hit.x - across.x, hit.z - across.z);
    assert.ok(Math.abs(left - right) < 0.05, `no sideways tilt across the path at (${x}, ${z}): ${left} vs ${right}`);
  }
  for (const clearing of [trail.SUMMIT, trail.MEADOW]) {
    const centre = trail.groundHeight(clearing.x, clearing.z);
    for (const [dx, dz] of [[3, 0], [-3, 2], [0, -4]]) assert.ok(Math.abs(trail.groundHeight(clearing.x + dx, clearing.z + dz) - centre) < 0.02, "clearings are flat");
  }
  assert.ok(trail.groundHeight(0, 140) < trail.SUMMIT_HEIGHT - 6, "beyond the summit the slope falls away toward the city");
});

test("the corridor slides a walker back toward the path, a yard or a clearing instead of stopping", () => {
  assert.deepEqual([...trail.resolveTrail(0, 3)], [0, 3]);
  const [x, z] = trail.resolveTrail(3, 1);
  assert.ok(trail.onTrail(x, z));
  assert.ok(Math.abs(trail.nearestOnTrail(x, z).distance - trail.TRAIL_WALK_HALF) < 0.02, "pushed back to the inside of the fence line");
  assert.ok(Math.abs(z - 1) < 0.3 && x > 1.3, "the push is perpendicular to the entrance stem");
  const moon = byId("moon");
  assert.ok(trail.onTrail(moon.x, moon.z), "the deck itself is walkable");
  const outside = trail.pavilionWorld(moon, 1, -5);
  const [yx, yz] = trail.resolveTrail(outside.x, outside.z);
  const local = trail.pavilionLocal(moon, yx, yz);
  assert.ok(Math.abs(local.lz + 3.4) < 0.01, `clamped to the yard edge (${local.lz})`); near(local.lx, 1, "the other axis is untouched");
  assert.ok(trail.onTrail(trail.SUMMIT.x + 9, trail.SUMMIT.z - 6), "the open summit can be walked freely");
  assert.ok(trail.onTrail(trail.MEADOW.x + 3, trail.MEADOW.z + 4), "so can the meadow");
  const [sx, sz] = trail.resolveTrail(trail.SUMMIT.x + 30, trail.SUMMIT.z);
  assert.ok(trail.onTrail(sx, sz) && Math.hypot(sx - trail.SUMMIT.x, sz - trail.SUMMIT.z) < trail.SUMMIT.radius, "pushed back inside the summit edge");
  for (let i = 0; i < 400; i++) {
    const px = -44 + (i * 7919) % 88, pz = -4 + (i * 104729) % 119;
    const [rx, rz] = trail.resolveTrail(px, pz);
    assert.ok(trail.onTrail(rx, rz), `resolved point (${rx}, ${rz}) from (${px}, ${pz}) is walkable`);
  }
});

test("pavilion seats mirror the server table; the summit deck seats a row facing the city", () => {
  assert.equal(trail.BAMBOO_PAVILIONS.length, 5);
  assert.equal(trail.BAMBOO_PAVILION_SEATS.length, 30);
  assert.equal(trail.PAVILION_SEAT_CAPACITY, 6);
  const moon = byId("moon");
  const moonSeats = trail.BAMBOO_PAVILION_SEATS.filter(seat => seat.spotId === "pavilion-moon");
  const expected = [[-15.58, 78.3, -Math.PI / 2], [-15.58, 81.7, -Math.PI / 2], [-18.9, 77.58, 0], [-17.1, 77.58, 0], [-18.9, 82.42, Math.PI], [-17.1, 82.42, Math.PI]];
  moonSeats.forEach((seat, slot) => {
    assert.equal(seat.slot, slot);
    near(seat.x, expected[slot][0], `seat ${slot} x`); near(seat.z, expected[slot][1], `seat ${slot} z`); near(seat.yaw, expected[slot][2], `seat ${slot} yaw`);
    near(seat.avatarY, moon.floorY, "hips rest on the deck edge");
    near(seat.baseY, moon.groundY, "folded legs reach the flattened ground");
    const ahead = { x: seat.x - Math.sin(seat.yaw) * 1.5, z: seat.z - Math.cos(seat.yaw) * 1.5 };
    assert.ok(trail.bambooFloorHeight(ahead.x, ahead.z) < moon.floorY - 0.3, "every seat looks out over the edge of the deck");
    near(trail.bambooFloorHeight(seat.x, seat.z), moon.floorY, "the seat itself is on the deck");
  });
  near(moon.floorY, moon.groundY + trail.PAVILION_RISE, "the deck stands on its flattened pad");
  const wind = trail.pavilionSeat("pavilion-wind", 0);
  near(wind.x, -30.58, "meadow pavilion step seat x"); near(wind.z, 48.3, "meadow pavilion step seat z"); near(wind.yaw, -Math.PI / 2, "faces +X toward the loop");
  const deck = byId("summit");
  assert.equal(deck.kind, "deck");
  near(deck.floorY, deck.groundY + trail.DECK_RISE, "the deck is raised on the summit");
  for (let slot = 0; slot < 6; slot++) {
    const seat = trail.pavilionSeat("pavilion-summit", slot);
    near(seat.x, 3.75 - 1.5 * slot, `deck seat ${slot} x`); near(seat.z, 102.2, `deck seat ${slot} z`); near(seat.yaw, Math.PI, "every deck seat faces north, toward the city");
    near(seat.avatarY, deck.floorY + trail.DECK_BENCH_HEIGHT, "the bench is above the deck"); near(seat.baseY, deck.floorY, "feet rest on the deck");
    near(trail.bambooFloorHeight(seat.x, seat.z), deck.floorY, "the bench stands on the deck");
  }
  assert.equal(trail.pavilionSeat("pavilion-wind", 6), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "lying", spotId: "pavilion-wind", slot: 0 }), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "sitting", spotId: "fire-benches", slot: 0 }), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "sitting", spotId: "pavilion-pine", slot: 5 }).id, "pavilion-pine-seat-5");
  assert.equal(trail.nearbyBambooPavilion(-19.0, 77.7)?.id, "moon");
  assert.equal(trail.nearbyBambooPavilion(3.6, 101.9)?.id, "summit");
  assert.equal(trail.nearbyBambooPavilion(-18, 75), null);
  assert.equal(trail.nearbyBambooPavilion(0, 3), null);
});

test("decks, steps, posts, railings and the roof clearance keep walking and the camera consistent", () => {
  const wind = byId("wind");
  const steps = trail.pavilionWorld(wind, 0, 3.1);
  const height = trail.bambooFloorHeight(steps.x, steps.z);
  assert.ok(height > wind.groundY && height < wind.floorY, `ramp height ${height}`);
  const beside = trail.pavilionWorld(wind, 2, 3.1);
  near(trail.bambooFloorHeight(beside.x, beside.z), trail.groundHeight(beside.x, beside.z), "the ramp is only in front of the steps");
  const deck = byId("summit"), deckSteps = trail.pavilionWorld(deck, 0, -3.3);
  const deckRamp = trail.bambooFloorHeight(deckSteps.x, deckSteps.z);
  assert.ok(deckRamp > deck.groundY && deckRamp < deck.floorY, "the deck's steps are on the side away from the view");
  assert.equal(trail.bambooCeilingHeight(0, 3), null);
  assert.equal(trail.bambooCeilingHeight(deck.x, deck.z), null, "the viewing deck has no roof");
  const edge = trail.pavilionWorld(wind, 3.2, 0);
  const centre = trail.bambooCeilingHeight(wind.x, wind.z), eave = trail.bambooCeilingHeight(edge.x, edge.z);
  assert.ok(centre > eave && eave > wind.floorY + 2.5, `ceiling ${centre} / ${eave}`);
  assert.equal(trail.BAMBOO_PAVILION_OBSTACLES.length, 24);
  assert.equal(trail.BAMBOO_PAVILION_COLLIDERS.length, 7);
  for (const wall of trail.BAMBOO_PAVILION_COLLIDERS) {
    assert.ok(wall.maxX > wall.minX && wall.maxZ > wall.minZ);
    const seatInside = trail.BAMBOO_PAVILION_SEATS.some(seat => seat.x > wall.minX - 0.3 && seat.x < wall.maxX + 0.3 && seat.z > wall.minZ - 0.3 && seat.z < wall.maxZ + 0.3);
    assert.equal(seatInside, false, "no seat sits inside a railing");
  }
  for (const seat of trail.BAMBOO_PAVILION_SEATS) {
    assert.ok(trail.onTrail(seat.x, seat.z), "seats are reachable inside the yard corridor");
    assert.ok(trail.BAMBOO_PAVILION_OBSTACLES.every(post => Math.hypot(post.x - seat.x, post.z - seat.z) > 0.16 + 0.3), "seats are clear of the posts");
  }
});

test("lanterns, fences and stalks keep off the walkway, the yards and the open clearings", () => {
  const stones = trail.BAMBOO_LANTERNS.filter(l => l.kind === "stone"), paper = trail.BAMBOO_LANTERNS.filter(l => l.kind === "paper");
  assert.ok(stones.length >= 45 && stones.length <= 80, `stone lanterns ${stones.length}`);
  assert.equal(paper.length, 10);
  for (const lantern of stones) {
    const d = trail.nearestOnTrail(lantern.x, lantern.z).distance;
    assert.ok(d > 1.8 && d < 2.3, `lantern beside the path, not on it (${d})`);
    near(lantern.y, trail.groundHeight(lantern.x, lantern.z), "stone lanterns stand on the ground");
  }
  for (const lantern of paper) assert.ok(lantern.y > trail.groundHeight(lantern.x, lantern.z) + 1.5, "paper lanterns hang above head height");
  assert.ok(trail.BAMBOO_FENCES.length > 120, `fence runs ${trail.BAMBOO_FENCES.length}`);
  for (const run of trail.BAMBOO_FENCES) {
    const mx = (run.ax + run.bx) / 2, mz = (run.az + run.bz) / 2, d = trail.nearestOnTrail(mx, mz).distance;
    assert.ok(d > 1.2 && d < 2.0, `fence offset ${d}`);
    assert.ok(Math.hypot(mx - trail.SUMMIT.x, mz - trail.SUMMIT.z) > trail.SUMMIT.radius - 1.1, "no fence crosses the open summit");
  }
  const sites = trail.bambooStalkSites();
  assert.ok(sites.length > 2500 && sites.length < 8000, `stalk count ${sites.length}`);
  assert.ok(sites.every(site => site.z < trail.SUMMIT.z + 1 || Math.abs(site.x) >= 70), "the north face below the summit is bare");
  for (const site of sites) {
    assert.ok(trail.nearestOnTrail(site.x, site.z).distance >= 2.6, "no stalk stands on the lanterns, fence or brush");
    assert.equal(trail.onTrail(site.x, site.z), false);
    assert.ok(Math.hypot(site.x - trail.SUMMIT.x, site.z - trail.SUMMIT.z) > trail.SUMMIT.radius + 3.9, "the summit is clear of bamboo");
    assert.ok(site.height >= 8.5 && site.height <= 13 && site.radius >= 0.055 && site.radius <= 0.1);
    near(site.y, trail.groundHeight(site.x, site.z), "stalks grow out of the slope");
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
    assert.equal(forest.fogNear, 14); assert.equal(forest.fogFar, 62);
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
  assert.match(scene, /전망대에 앉기/, "the summit deck has its own wording");
  assert.match(net, /pavilionEnabled: mapId === "bamboo"/);
  assert.match(net, /"pavilion-wind", "pavilion-moon", "pavilion-pine", "pavilion-step", "pavilion-summit"/, "pavilion claims are validated like the other seats");
});
