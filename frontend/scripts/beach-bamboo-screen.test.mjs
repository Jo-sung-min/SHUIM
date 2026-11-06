import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

async function load(file, dependencies, names) {
  const source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "")
    .replace(/^export \{[^\n]+\} from [^\n]+$/gm, "").replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api={${names.join(",")}};`, context);
  return context.api;
}
const trail = await load("../lib/beach/bamboo-trail.ts", {}, ["BAMBOO_PAVILIONS", "DECK_YARD", "PAVILION_YARD_HALF", "SECRET_GARDEN", "SECRET_GARDEN_PATHS", "nearestOnTrail", "onTrail", "pavilionLocal", "seededRandom", "groundHeight"]);
const { secretGardenScreenSites, secretGardenEntranceCanopy, secretGardenLowScreen } = await load("../lib/beach/bamboo-garden-screen.ts", trail, ["secretGardenScreenSites", "secretGardenEntranceCanopy", "secretGardenLowScreen"]);
const sites = secretGardenScreenSites(trail.groundHeight);

test("tall bamboo screens use bounded instances with leafy depth on every exterior side", t => {
  assert.ok(sites.length > 220 && sites.length < 600);
  for (const site of sites) {
    assert.ok(Object.values(site).every(Number.isFinite)); assert.ok(site.height >= 14 && site.height <= 18);
    assert.equal(site.y, trail.groundHeight(site.x, site.z));
  }
  const east = sites.filter(p => p.x > trail.SECRET_GARDEN.maxX + .5 && p.z > 86);
  assert.ok(east.length > 45);
  assert.ok(Math.max(...east.map(p => p.x)) - Math.min(...east.map(p => p.x)) > 1.7, "overlapping depth layers hide the wall as the camera moves");
  for (const z of [87, 90, 94, 98, 102, 106, 110]) assert.ok(east.filter(p => Math.abs(p.z - z) < 2.2).length >= 6);
  assert.ok(sites.some(p => p.x < trail.SECRET_GARDEN.minX - 2));
  assert.ok(sites.some(p => p.z > trail.SECRET_GARDEN.maxZ + 2));
  t.diagnostic(`${sites.length} stems, ${sites.length * 5} existing-material leaf clusters, approximately ${sites.length * 30} added triangles`);
});

test("the entrance dogleg, pavilion yards and all footpaths remain free of bamboo trunks", () => {
  for (const site of sites) {
    assert.equal(trail.onTrail(site.x, site.z), false);
    assert.ok(trail.nearestOnTrail(site.x, site.z).distance >= 2.05);
    for (const p of trail.BAMBOO_PAVILIONS) {
      const { lx, lz } = trail.pavilionLocal(p, site.x, site.z), hx = p.kind === "deck" ? trail.DECK_YARD.x : trail.PAVILION_YARD_HALF;
      const hz = p.kind === "deck" ? trail.DECK_YARD.z : trail.PAVILION_YARD_HALF;
      assert.ok(Math.abs(lx) >= hx + .5 || Math.abs(lz) >= hz + .5);
    }
  }
});

test("crowns preserve the existing 36 degree central city opening from the whole lookout", () => {
  for (const site of sites) for (const x of [-3.75, 0, 3.75]) for (const z of [97.6, 102.2, 109.4]) {
    const distance = Math.hypot(site.x - x, site.z - z);
    assert.ok(Math.abs(Math.atan2(site.x - x, site.z - z)) - Math.asin(3.8 / distance) > Math.PI / 5);
  }
});

test("the leafy entrance arch has headroom and follows both bends without an opaque blocker", () => {
  const leaves = secretGardenEntranceCanopy(trail.groundHeight);
  assert.ok(leaves.length >= 30 && leaves.length <= 60);
  for (const leaf of leaves) {
    assert.ok(leaf.y - leaf.size / 2 - trail.groundHeight(leaf.x, leaf.z) > 2.3);
    assert.ok(trail.nearestOnTrail(leaf.x, leaf.z).distance < .8);
  }
});

test("low pavilion-side leaves cover the garden without filling the two metre entrance", () => {
  const leaves = secretGardenLowScreen(trail.groundHeight);
  assert.equal(leaves.length, 36);
  for (const leaf of leaves) {
    assert.ok(leaf.x >= -23.4 && leaf.x <= -21.8 && leaf.z >= 85.8 && leaf.z <= 91.6);
    assert.ok(trail.nearestOnTrail(leaf.x, leaf.z).distance - leaf.size / 2 >= 1,
      "the leafy bank stays outside the two metre walking corridor");
  }
});
