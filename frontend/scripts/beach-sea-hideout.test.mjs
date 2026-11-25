import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

async function load(file, bindings, names) {
  const source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"), { mode: "transform" })
    .replace(/^import .*?;\r?$/gm, "").replace(/^export /gm, "");
  return vm.runInNewContext(`${source}\n({${names.join(",")}})`, bindings);
}
const layout = await load("../lib/beach/sea-hideout-layout.ts", {}, ["resolveHideoutWalk", "HIDEOUT_SEATS", "hideoutCameraFree"]);
const { HideoutWater } = await load("../lib/beach/sea-hideout-water.ts", { THREE }, ["HideoutWater"]);
const { SeaHideoutWorld } = await load("../lib/beach/sea-hideout.ts", { THREE, RoundedBoxGeometry, mergeGeometries, HideoutWater }, ["SeaHideoutWorld"]);
const scene = new THREE.Scene();
new SeaHideoutWorld(scene);
scene.updateMatrixWorld(true);

test("the approach is physically open from the ledge around the blind corner to the bench", () => {
  const stops = [[14,-6],[14,7.25],[7.65,7.25],[7.65,4.9],[2,4.9],[-2.7,.25]];
  for (let i = 1; i < stops.length; i++) {
    const [ax,az] = stops[i-1], [bx,bz] = stops[i], distance = Math.hypot(bx-ax,bz-az);
    const dir = new THREE.Vector3(bx-ax,0,bz-az).normalize();
    for (const y of [.35,1.65]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(ax,y,az), dir, .01, distance);
      assert.equal(ray.intersectObjects(scene.children).length,0,`obstruction before ${bx},${bz} at height ${y}`);
    }
    for(let t=0;t<=1;t+=.025){
      const x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      assert.deepEqual(Array.from(layout.resolveHideoutWalk(x,z)),[x,z]);
      assert.ok(layout.hideoutCameraFree(x,1.65,z));
    }
  }
  assert.deepEqual(Array.from(layout.resolveHideoutWalk(20,-4)),[15.4,-4]);
});

test("each seated visitor can see the ocean through the opening at eye level", () => {
  for(const seat of layout.HIDEOUT_SEATS){
    const ray = new THREE.Raycaster(new THREE.Vector3(seat.x,seat.avatarY+.78,seat.z),
      new THREE.Vector3(0,-.13,-1).normalize());
    const hit = ray.intersectObjects(scene.children)[0];
    assert.ok(hit && hit.distance > 20, "the window and curtain do not block the sea");
    assert.ok(hit.object.material.isShaderMaterial, "the first surface in sight is the animated sea");
  }
});
