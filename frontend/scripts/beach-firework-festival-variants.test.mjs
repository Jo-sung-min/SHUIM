import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import vm from "node:vm";
import * as THREE from "three";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/firework-festival-variants.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
const context = { THREE };
vm.runInNewContext(`${source}\nglobalThis.make = festivalVariantGeometry;`, context);
const make = context.make, variants = ["bloom", "saturn", "willow", "stardust", "offbeat", "aurora", "jewels"];
const digest = geometry => {
  const hash = createHash("sha256");
  for (const name of ["position", "velocity", "sparkColor", "timing", "detail"]) hash.update(new Uint8Array(geometry.attributes[name].array.buffer));
  return hash.digest("hex");
};
function samples(geometry, predicate = () => true) {
  const p = geometry.attributes.position, v = geometry.attributes.velocity, t = geometry.attributes.timing, d = geometry.attributes.detail;
  const result = [];
  for (let i = 0; i < p.count; i++) {
    const sample = { p: [p.getX(i), p.getY(i), p.getZ(i)], v: [v.getX(i), v.getY(i), v.getZ(i)], start: t.getX(i), delay: t.getY(i), life: t.getZ(i), mode: t.getW(i), alpha: d.getZ(i) };
    if (predicate(sample)) result.push(sample);
  }
  return result;
}
const close = (actual, expected, tolerance = 1e-4) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);

test("all shows are deterministic, seeded, and expose the existing reflection attribute contract", () => {
  for (const variant of variants) for (const mobile of [false, true]) {
    const first = make(1234567, mobile, variant), repeat = make(1234567, mobile, variant), changed = make(1729, mobile, variant);
    assert.equal(digest(first), digest(repeat), `${variant}/${mobile} deterministic`);
    assert.notEqual(digest(first), digest(changed), `${variant}/${mobile} seed varies the show`);
    assert.deepEqual(Object.keys(first.attributes).sort(), ["detail", "position", "sparkColor", "timing", "velocity"]);
    assert.equal(first.userData.variant, variant); assert.equal(first.userData.phrase, "");
    assert.equal(first.userData.textWidth, 0); assert.equal(first.userData.grand, true);
    first.dispose(); repeat.dispose(); changed.dispose();
  }
});

test("finite particles stay within the mobile/desktop budget and every tail expires before twelve seconds", () => {
  for (const variant of variants) for (const mobile of [false, true]) for (const seed of [0, 2_147_483_646]) {
    const geometry = make(seed, mobile, variant), count = geometry.attributes.position.count;
    const newShow = ["offbeat", "aurora", "jewels"].includes(variant);
    assert.ok(count >= (mobile ? newShow ? 20000 : 29000 : newShow ? 45000 : 75000), `${variant} has a complete particle show`);
    assert.ok(count <= (mobile ? 40000 : 90000), `${variant}/${mobile} budget ${count}`);
    for (const attribute of Object.values(geometry.attributes)) {
      assert.equal(attribute.count, count);
      for (const value of attribute.array) assert.ok(Number.isFinite(value));
    }
    const t = geometry.attributes.timing, d = geometry.attributes.detail, c = geometry.attributes.sparkColor;
    let first = Infinity, last = 0;
    for (let i = 0; i < count; i++) {
      assert.ok([1, 3, 6, 7].includes(t.getW(i)), "no text, fan or new shader mode");
      assert.ok(t.getX(i) >= 1 && t.getY(i) >= 0 && t.getZ(i) > 0);
      assert.ok(t.getX(i) + t.getY(i) + t.getZ(i) < 12);
      assert.ok(d.getX(i) > 0 && d.getZ(i) > 0 && d.getZ(i) <= 1);
      for (const value of [c.getX(i), c.getY(i), c.getZ(i)]) assert.ok(value >= 0 && value <= 1);
      if (t.getW(i) >= 6) { first = Math.min(first, t.getX(i)); last = Math.max(last, t.getX(i) + t.getY(i) + t.getZ(i)); }
    }
    assert.ok(first < 1.5 && last >= 11.3, `${variant} spans the full shared twelve-second event`);
    geometry.dispose();
  }
});

test("bloom preserves three differently sized complete shells at every flower center", () => {
  const geometry = make(1729, true, "bloom");
  const rays = samples(geometry, p => p.mode === 7 && p.delay === 0);
  const center = rays[0].p.join(","), firstFlower = rays.filter(p => p.p.join(",") === center);
  const layers = new Map();
  for (const particle of firstFlower) {
    const group = layers.get(particle.start) ?? []; group.push(particle); layers.set(particle.start, group);
  }
  assert.equal(layers.size, 3);
  const radii = [...layers.values()].map(layer => {
    assert.ok(layer.some(p => p.v[1] > 7) && layer.some(p => p.v[1] < -7), "each shell surrounds its center");
    return Math.max(...layer.map(p => Math.hypot(...p.v)));
  }).sort((a, b) => a - b);
  assert.ok(radii[1] / radii[0] > 1.65 && radii[2] / radii[1] > 1.4, "three rings remain visually separated");
  geometry.dispose();
});

test("saturn has a three-dimensional core and two distinct inclined planar orbits", () => {
  const geometry = make(1729, true, "saturn");
  const rays = samples(geometry, p => p.mode === 7 && p.delay === 0);
  const center = rays[0].p.join(","), planet = rays.filter(p => p.p.join(",") === center);
  const core = planet.filter(p => Math.hypot(...p.v) < 10), rings = planet.filter(p => Math.hypot(...p.v) > 14);
  assert.ok(core.some(p => p.v[2] > 5) && core.some(p => p.v[2] < -5));
  let unassigned = rings;
  for (let orbit = 0; orbit < 2; orbit++) {
    const a = new THREE.Vector3(...unassigned[0].v), b = new THREE.Vector3(...unassigned[1].v);
    const normal = a.clone().cross(b).normalize();
    const ring = unassigned.filter(point => Math.abs(normal.dot(new THREE.Vector3(...point.v))) < 2e-4);
    unassigned = unassigned.filter(point => !ring.includes(point));
    assert.equal(ring.length, 144, "each of the two orbits remains a distinct plane");
    assert.ok(Math.abs(normal.x) > .1 && Math.abs(normal.z) > .1, "the ring is inclined in depth and on screen");
    assert.ok(new Set(ring.map(point => point.start)).size > 100, "embers ignite separately instead of drawing a single smooth ring");
    assert.ok(Math.max(...ring.map(point => point.start)) - Math.min(...ring.map(point => point.start)) > .12);
    assert.ok(Math.max(...ring.map(point => point.life)) - Math.min(...ring.map(point => point.life)) > .9);
    assert.ok(Math.max(...ring.map(point => point.alpha)) - Math.min(...ring.map(point => point.alpha)) > .3);
    const lengths = ring.map(point => Math.hypot(...point.v));
    assert.ok(Math.max(...lengths) / Math.min(...lengths) > 1.25, "radial gaps break the filled neon band");
  }
  assert.equal(unassigned.length, 0);
  geometry.dispose();
});

test("willow uses long gold trails that are all descending by the late part of each shell", () => {
  const geometry = make(1729, true, "willow"), points = samples(geometry, p => p.mode >= 6);
  assert.ok(points.every(p => p.mode === 6));
  assert.ok(points.some(p => p.life > 5) && Math.max(...points.map(p => p.delay)) > 1.15);
  assert.ok(points.every(p => p.v[1] * Math.exp(-.33 * 3.2) - 2 * 1.28 * 3.2 < 0), "slow-drag paths turn into falling rain");
  const color = geometry.attributes.sparkColor;
  for (let i = 0; i < color.count; i++) assert.ok(color.getX(i) > color.getY(i) && color.getY(i) > color.getZ(i), "gold, amber and warm ember colors only");
  geometry.dispose();
});

test("stardust reblooms at the parent comet trajectory instead of spawning disconnected constellations", () => {
  const geometry = make(1729, true, "stardust");
  const parents = samples(geometry, p => p.mode === 7 && p.delay === 0 && p.life < 1.7);
  const children = samples(geometry, p => p.mode === 3 && p.start > 2);
  let reblooms = 0;
  for (const child of children) {
    const match = parents.find(parent => {
      const age = child.start - parent.start;
      if (age < 1.1 || age > 1.5) return false;
      const travel = (1 - Math.exp(-.46 * age)) / .46;
      const expected = [parent.p[0] + parent.v[0] * travel, parent.p[1] + parent.v[1] * travel - .88 * age * age, parent.p[2] + parent.v[2] * travel];
      return expected.every((value, axis) => Math.abs(value - child.p[axis]) < .0001);
    });
    if (match) reblooms++;
  }
  assert.equal(reblooms, 96, "eight shells each produce twelve physically connected satellite bursts");
  assert.ok(new Set(children.map(p => p.start.toFixed(3))).size > 70, "satellites twinkle in a staggered chain");
  geometry.dispose();
});

test("mobile preserves the same major launch choreography while reducing sampling density", () => {
  for (const variant of variants) {
    const mobile = make(1234567, true, variant), desktop = make(1234567, false, variant);
    const launches = geometry => samples(geometry, p => p.mode === 1 && p.delay === 0).map(p => [p.p, p.start]);
    assert.deepEqual(launches(mobile), launches(desktop));
    assert.ok(desktop.attributes.position.count > mobile.attributes.position.count * 2);
    mobile.dispose(); desktop.dispose();
  }
});

test("offbeat sends one large crown first, then separately launched satellites while its embers fall", () => {
  const geometry = make(1729, true, "offbeat");
  const launches = samples(geometry, p => p.mode === 1 && p.delay === 0);
  assert.equal(launches.length, 9);
  assert.ok(launches.slice(1).every((p, i) => p.start - launches[i].start > .75), "each satellite has its own audible detonation");
  const gaps = launches.slice(1).map((p, i) => Number((p.start - launches[i].start).toFixed(2)));
  assert.ok(new Set(gaps).size > 5, "the beat varies rather than repeating one interval");
  const crown = samples(geometry, p => p.mode === 6 && p.delay === 0);
  const satellites = samples(geometry, p => p.mode === 7 && p.delay === 0);
  assert.ok(crown.every(p => p.start + p.life > launches[3].start), "early satellites still surround the first crown's falling embers");
  assert.ok(crown.every(p => p.start + p.life < 5.6), "the main crown burns out before the late satellites instead of blocking the whole show");
  assert.ok(Math.max(...crown.map(p => Math.hypot(...p.v))) > Math.max(...satellites.map(p => Math.hypot(...p.v))) * 1.6);
  assert.ok(launches.every(p => p.p[1] >= 75 && p.p[2] < -295), "the full display is staged higher and farther out over the sea");
  for (const p of crown) for (let age = 0; age <= p.life; age += .2) {
    const travel = (1 - Math.exp(-.33 * age)) / .33;
    assert.ok(p.p[1] + p.v[1] * travel - 1.28 * age * age > 25, "even the lowest dying tips remain well above the horizon");
    assert.ok(p.p[2] + p.v[2] * travel < -290, "the large crown never moves into the foreground");
  }
  geometry.dispose();
});

test("aurora and jewels fill round crowns with volumetric irregular rays, distinct colours and timing", () => {
  for (const variant of ["aurora", "jewels"]) {
    const geometry = make(1729, true, variant);
    const rays = samples(geometry, p => p.mode === 7 && p.delay === 0);
    const first = rays[0].p.join(","), layers = new Map();
    for (const p of rays.filter(p => p.p.join(",") === first)) {
      const group = layers.get(p.start) ?? []; group.push(p); layers.set(p.start, group);
    }
    assert.equal(layers.size, 3);
    for (const ring of layers.values()) {
      const radii = ring.map(p => Math.hypot(p.v[0], p.v[1]));
      const outer = Math.max(...radii);
      assert.ok(radii.filter(radius => radius < outer * .55).length >= 8, "near/far rays fill the interior rather than leaving an empty ring");
      assert.ok(radii.filter(radius => radius > outer * .8).length >= 20, "the full crown retains a broad round silhouette");
      assert.ok(ring.some(p => p.v[2] > outer * .4) && ring.some(p => p.v[2] < -outer * .4), "each crown has depth in both directions");
      const depth = variant === "aurora" ? .58 : .55;
      const speeds = ring.map(p => Math.hypot(p.v[0], p.v[1], p.v[2] / depth));
      assert.ok(Math.max(...speeds) / Math.min(...speeds) > 1.2, "seeded speed variations break evenly spaced concentric outlines");
      const sectors = new Set(ring.map(p => Math.floor((Math.atan2(p.v[1], p.v[0]) + Math.PI) / (Math.PI / 4)) % 8));
      assert.equal(sectors.size, 8, "all directions of the circle remain visible");
    }
    const colours = geometry.attributes.sparkColor, timing = geometry.attributes.timing;
    let cool = 0, pink = 0, gold = 0;
    for (let i = 0; i < colours.count; i++) if (timing.getW(i) === 7) {
      const r = colours.getX(i), g = colours.getY(i), b = colours.getZ(i);
      if (b > r || g > r) cool++;
      if (r > .6 && b > .2 && g < .4) pink++;
      if (r > .6 && g > .4 && b < .3) gold++;
    }
    assert.ok(variant === "aurora" ? cool > 20000 : pink > 15000 && gold > 7000, "each show has its own palette");
    geometry.dispose();
  }
});
