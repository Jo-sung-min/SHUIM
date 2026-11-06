import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

async function load(file, dependencies, names) {
  const source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/^export \{[^\n]+\} from [^\n]+$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api={${names.join(",")}};`, context);
  return context.api;
}
const trail = await load("../lib/beach/bamboo-trail.ts", {}, ["BAMBOO_BOUNDS", "BAMBOO_PAVILIONS", "SECRET_GARDEN_ZONES", "TRAIL_POLYLINES", "groundHeight", "bambooFloorHeight", "pavilionWorld", "pavilionHalf", "pavilionStepSign", "PAVILION_STEP_LENGTH"]);
const terrain = await load("../lib/beach/bamboo-terrain.ts", trail, ["BAMBOO_TERRAIN_GRID", "bambooTerrainHeight", "createHeightfieldData", "sampleHeightfield"]);
const fine = terrain.createHeightfieldData(terrain.BAMBOO_TERRAIN_GRID, terrain.bambooTerrainHeight);
const outerGrid = { minX: -100, maxX: 100, minZ: -60, maxZ: 180, cell: 6 };
const skirt = terrain.createHeightfieldData(outerGrid, (x, z) => terrain.bambooTerrainHeight(x, z) - .15, terrain.BAMBOO_TERRAIN_GRID);
function mesh(data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); object.updateMatrixWorld(); return object;
}
const fineMesh = mesh(fine), skirtMesh = mesh(skirt);
const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
function hit(x, z, objects = [fineMesh, skirtMesh]) {
  ray.ray.origin.set(x, 100, z);
  return ray.intersectObjects(objects, false)[0]?.point.y ?? null;
}
const heightAt = (x, z) => terrain.sampleHeightfield(fine, x, z);
const floorAt = (x, z) => trail.bambooFloorHeight(x, z, heightAt);
function pathSamples() {
  const samples = [];
  for (const line of trail.TRAIL_POLYLINES) {
    const points = line.points, count = line.closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (!length) continue;
      const steps = Math.max(1, Math.ceil(length / .8));
      for (let j = 0; j < steps; j++) for (const offset of [-1.2, 0, 1.2]) {
        const x = a[0] + dx * j / steps - dz / length * offset, z = a[1] + dz * j / steps + dx / length * offset;
        if (Math.abs(trail.bambooFloorHeight(x, z) - trail.groundHeight(x, z)) < 1e-7) samples.push([x, z]);
      }
    }
  }
  return samples;
}

test("uphill, downhill and stationary feet match the highest visible terrain triangle", t => {
  const samples = pathSamples(); let largestOldDifference = 0, worst = null;
  for (const [x, z] of [...samples, ...samples.slice().reverse()]) {
    const rendered = hit(x, z), contact = floorAt(x, z);
    assert.notEqual(rendered, null); assert.ok(Math.abs(contact - rendered) < 1e-5, `buried/floating at ${x},${z}: ${contact} vs ${rendered}`);
    assert.equal(floorAt(x, z), contact, "standing still does not drift");
    const difference = rendered - trail.groundHeight(x, z);
    if (difference > largestOldDifference) { largestOldDifference = difference; worst = [x, z]; }
  }
  assert.ok(samples.length > 800);
  assert.ok(largestOldDifference > .08, "route contains a real former analytic-vs-triangle contact error");
  t.diagnostic(`${samples.length} route samples; old foot point was up to ${largestOldDifference.toFixed(3)}m below the fine terrain near ${worst}`);
});

test("the coarse background is a true skirt and cannot cover any walkable terrain", t => {
  const old = mesh(terrain.createHeightfieldData(outerGrid, (x, z) => terrain.bambooTerrainHeight(x, z) - .15));
  let oldCover = 0;
  for (const [x, z] of pathSamples()) {
    const coarse = hit(x, z, [old]);
    if (coarse !== null) oldCover = Math.max(oldCover, coarse - heightAt(x, z));
    assert.equal(hit(x, z, [skirtMesh]), null, "background triangles must not overlap the walking corridor");
  }
  assert.ok(oldCover > .15, "the regression includes the coarse triangle that covered an uphill walker");
  assert.ok(skirt.indices.length < old.geometry.index.count);
  t.diagnostic(`old coarse layer rose ${oldCover.toFixed(3)}m above the fine terrain; skirt removes ${old.geometry.index.count / 3 - skirt.indices.length / 3} triangles`);
  old.geometry.dispose(); old.material.dispose();
});

test("western photo bays are supported by the fine plateau without an early cliff drop", () => {
  assert.ok(fine.minX <= trail.BAMBOO_BOUNDS.minX - 7);
  for (const zone of trail.SECRET_GARDEN_ZONES) for (const dx of [-1.5, 0, 1.5]) for (const dz of [-1.5, 0, 1.5]) {
    const x = zone.x + dx, z = zone.z + dz;
    assert.ok(Math.abs(hit(x, z) - trail.groundHeight(x, z)) < 1e-5);
    assert.equal(terrain.bambooTerrainHeight(x, z), trail.groundHeight(x, z));
  }
});

test("pavilion floors and access steps retain their existing exact heights", () => {
  for (const p of trail.BAMBOO_PAVILIONS) {
    const half = trail.pavilionHalf(p), sign = trail.pavilionStepSign(p);
    for (const [lx, lz] of [[0, 0], [half.x - .1, half.z - .1]]) {
      const q = trail.pavilionWorld(p, lx, lz);
      assert.equal(trail.bambooFloorHeight(q.x, q.z, () => -100), p.floorY);
    }
    for (const fraction of [.05, .25, .5, .75, .95]) {
      const q = trail.pavilionWorld(p, 0, sign * (half.z + trail.PAVILION_STEP_LENGTH * fraction));
      assert.equal(floorAt(q.x, q.z), trail.bambooFloorHeight(q.x, q.z));
    }
  }
});

test("grid corners, diagonals and out-of-range samples are well defined", () => {
  for (const [ix, iz] of [[0, 0], [fine.nx - 1, fine.nz - 1], [31, 34]]) {
    const i = (iz * (fine.nx + 1) + ix) * 3, x = fine.positions[i], z = fine.positions[i + 2];
    for (const [u, v] of [[0, 0], [.2, .3], [.75, .25], [.8, .7]]) {
      const dx = fine.positions[i + 3] - x, dz = fine.positions[i + (fine.nx + 1) * 3 + 2] - z;
      assert.ok(Math.abs(heightAt(x + dx * u, z + dz * v) - hit(x + dx * u, z + dz * v, [fineMesh])) < 1e-5);
    }
  }
  assert.equal(heightAt(fine.minX - 1, 0), null); assert.equal(heightAt(NaN, 0), null);
});
