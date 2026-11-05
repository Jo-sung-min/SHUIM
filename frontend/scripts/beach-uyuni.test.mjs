import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { hotSpring } from "./beach-world-fixture.mjs";

async function load(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(",")} };`, context);
  return context.api;
}

const sky = await load("../lib/beach/sky-shader.ts", {}, ["SKY_UNIFORMS", "SKY_FUNCTIONS"]);
const shader = await load("../lib/beach/uyuni-shader.ts", sky, ["UYUNI_SURFACE", "UYUNI_SKY_UNIFORMS", "UYUNI_SKY_FUNCTIONS", "UYUNI_SKY_FRAGMENT", "UYUNI_WATER_VERTEX", "UYUNI_WATER_FRAGMENT", "uyuniDryAmount"]);
const { UyuniWorld } = await load("../lib/beach/uyuni.ts", { THREE, ...shader, uyuniHotelFloorHeight: hotSpring.uyuniHotelFloorHeight }, ["UyuniWorld"]);
const { daylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt"]);
const { STARGAZING, stargazingSlot, stargazingBodyPoint } = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "stargazingSlot", "stargazingBodyPoint"]);

function fixture() {
  const uniforms = {};
  for (const [, type, key] of shader.UYUNI_SKY_UNIFORMS.matchAll(/uniform (sampler2D|vec3|float) (\w+);/g)) {
    uniforms[key] = { value: type === "sampler2D" ? new THREE.Texture() : type === "vec3" ? new THREE.Vector3() : 0 };
  }
  const sand = new THREE.Texture(), scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 390 / 844, 0.05, 520);
  camera.position.set(0, 1.6, 12);
  return { scene, camera, sand, uniforms, world: new UyuniWorld(scene, uniforms, sand) };
}

test("the endless salt mirror is two triangles, tracks the camera and covers its entire 520m range", () => {
  const { world, scene, camera } = fixture();
  const surface = world.surface;
  assert.equal(scene.children.filter(object => object.isMesh).length, 1);
  assert.equal(surface.geometry.getAttribute("position").count, 4);
  assert.equal(surface.geometry.index.count, 6);
  assert.equal(surface.material.transparent, false);
  assert.equal(surface.material.depthWrite, true);
  assert.equal(surface.material.toneMapped, false);
  assert.ok(surface.position.y > 0 && surface.position.y < 0.015, "mats and avatar ground shadows remain above the water");
  assert.equal(surface.frustumCulled, false);
  const cameraRig = new THREE.Group();
  cameraRig.position.set(450, 0, -680);
  cameraRig.add(camera);
  scene.add(cameraRig);
  for (const [x, z] of [[0, 12], [30, -40], [-1400, 900]]) {
    camera.position.set(x, 1.6, z);
    world.update(1, camera);
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(surface);
    const origin = camera.getWorldPosition(new THREE.Vector3());
    assert.equal(surface.position.x, origin.x);
    assert.equal(surface.position.z, origin.z);
    assert.ok(bounds.min.x <= origin.x - camera.far && bounds.max.x >= origin.x + camera.far);
    assert.ok(bounds.min.z <= origin.z - camera.far && bounds.max.z >= origin.z + camera.far);
    const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, camera.far).intersectObject(surface)[0];
    assert.ok(hit, "a camera parent transform does not leave an empty hole below the viewer");
    const normal = hit.face.normal.clone().transformDirection(surface.matrixWorld);
    assert.ok(normal.dot(new THREE.Vector3(0, 1, 0)) > 0.999999);
  }
  world.dispose();
});

test("sky and water share every sky uniform and the exact same longitude, image seam and star functions", () => {
  const { world, uniforms, sand, camera } = fixture();
  for (const [key, uniform] of Object.entries(uniforms)) assert.equal(world.surface.material.uniforms[key], uniform, key);
  assert.equal(world.surface.material.uniforms.uSand.value, sand);
  assert.ok(shader.UYUNI_SKY_FRAGMENT.includes(shader.UYUNI_SKY_FUNCTIONS));
  assert.ok(shader.UYUNI_WATER_FRAGMENT.includes(shader.UYUNI_SKY_FUNCTIONS));
  assert.ok(shader.UYUNI_SKY_FUNCTIONS.includes(sky.SKY_FUNCTIONS));
  uniforms.uGalaxyReady.value = 1;
  uniforms.uGalaxyYaw.value = 0.75;
  world.update(12.25, camera);
  assert.equal(uniforms.uTime.value, 12.25);
  assert.equal(world.surface.material.uniforms.uGalaxyReady.value, 1);
  assert.equal(world.surface.material.uniforms.uGalaxyYaw.value, 0.75);
  const waterMain = shader.UYUNI_WATER_FRAGMENT.slice(shader.UYUNI_WATER_FRAGMENT.lastIndexOf("void main()"));
  assert.match(waterMain, /incoming = normalize\(vWorld - uCamPos\)/);
  assert.match(waterMain, /uyuniSky\(reflect\(incoming, normal\)\)/);
  // Rays reaching the actual plane retain longitude and reflect to the upper sky.
  world.surface.updateMatrixWorld(true);
  for (const point of [[-8, 0, 4], [0, 0, -10], [5, 0, 18]]) {
    const incoming = new THREE.Vector3(...point).sub(camera.position).normalize();
    const hit = new THREE.Raycaster(camera.position, incoming, 0, 520).intersectObject(world.surface)[0];
    assert.ok(hit);
    const reflected = incoming.clone().reflect(hit.face.normal.clone().transformDirection(world.surface.matrixWorld));
    assert.ok(reflected.y > 0);
    assert.ok(Math.abs(reflected.x - incoming.x) < 1e-8 && Math.abs(reflected.z - incoming.z) < 1e-8);
    assert.ok(Math.abs(reflected.y + incoming.y) < 1e-8);
  }
  world.dispose();
});

test("all eight resting places remain within a small dry island while the nearby lake stays reflective", () => {
  const { world, camera } = fixture();
  assert.equal(shader.UYUNI_SURFACE.islandX, STARGAZING.x);
  assert.equal(shader.UYUNI_SURFACE.islandZ, STARGAZING.z);
  for (let slot = 0; slot < STARGAZING.capacity; slot++) {
    const place = stargazingSlot(slot);
    for (const distance of [0, 0.9, 1.8]) {
      const point = stargazingBodyPoint(place, distance);
      assert.equal(shader.uyuniDryAmount(point.x, point.z), 1);
    }
  }
  assert.equal(shader.uyuniDryAmount(7, 7), 1);
  assert.equal(shader.uyuniDryAmount(0, 12), 0);
  assert.ok(shader.uyuniDryAmount(10.65, 7) > 0 && shader.uyuniDryAmount(10.65, 7) < 1);
  world.update(0, camera, { x: 6, z: 7, moving: true });
  world.update(0.4, camera, { x: 6.5, z: 7, moving: true });
  world.update(0.8, camera, { x: 7, z: 7, moving: true });
  assert.equal(world.surface.material.uniforms.uRipples.value.filter(ripple => ripple.w > 0).length, 0);
  world.dispose();
});

test("footstep rings stay bounded, expire, and never allocate new per-frame ripple vectors", () => {
  const { world, camera } = fixture();
  const ripples = world.surface.material.uniforms.uRipples.value;
  const references = [...ripples];
  world.update(0, camera, { x: 0, z: 12, moving: true });
  for (let step = 1; step <= 40; step++) world.update(step * 0.24, camera, { x: step * 0.4, z: 12, moving: true });
  assert.equal(ripples.length, 10);
  assert.equal(ripples.filter(ripple => ripple.w > 0).length, 10);
  ripples.forEach((ripple, index) => {
    assert.equal(ripple, references[index]);
    assert.ok(ripple.toArray().every(Number.isFinite));
    assert.ok(ripple.x >= 12 && ripple.y === 12 && ripple.z <= 9.6 && ripple.w <= 1);
  });
  world.update(15, camera, { x: 16, z: 12, moving: false });
  assert.equal(ripples.filter(ripple => ripple.w > 0).length, 0);
  world.dispose();
});

test("stationary, invalid, teleported and rewound walkers do not create phantom or immortal rings", () => {
  const { world, camera } = fixture();
  const ripples = world.surface.material.uniforms.uRipples.value;
  for (let time = 0; time < 1; time += 0.1) world.update(time, camera, { x: 0, z: 12, moving: true });
  assert.ok(ripples.every(ripple => ripple.w === 0));
  world.update(1, camera, { x: 100, z: 12, moving: true });
  assert.ok(ripples.every(ripple => ripple.w === 0), "teleports do not look like footsteps");
  world.update(1.3, camera, { x: 100.5, z: 12, moving: true });
  assert.equal(ripples.filter(ripple => ripple.w > 0).length, 1);
  world.update(1.5, camera, { x: NaN, z: 12, moving: true });
  assert.ok(ripples.every(ripple => ripple.toArray().every(Number.isFinite)));
  world.update(0, camera, { x: 100.5, z: 12, moving: true });
  assert.ok(ripples.every(ripple => ripple.w === 0));
  world.update(NaN, camera, { x: 101, z: 12, moving: true });
  assert.equal(world.surface.material.uniforms.uTime.value, 0);
  world.dispose();
});

test("hotel decks and ramps suppress water footsteps until the walker reaches the lake again", () => {
  for (const hotel of hotSpring.UYUNI_HOTELS) {
    const { world, camera } = fixture();
    const ripples = world.surface.material.uniforms.uRipples.value;
    for (let step = 0; step <= 12; step++) {
      world.update(step * 0.25, camera, { x: hotel.x, z: hotel.z - 11 + step * 0.5, moving: true });
    }
    assert.ok(ripples.every(ripple => ripple.w === 0), "walking on an elevated hotel ramp cannot ripple the water below it");
    world.update(4, camera, { x: hotel.x, z: hotel.z - 12, moving: true });
    world.update(4.4, camera, { x: hotel.x, z: hotel.z - 12.5, moving: true });
    assert.equal(ripples.filter(ripple => ripple.w > 0).length, 1);
    world.dispose();
  }
});

test("low quality caps ring processing at six without adding meshes, downloads or render targets", () => {
  const { world, camera, scene } = fixture();
  world.update(0, camera, { x: 0, z: 12, moving: true });
  for (let step = 1; step <= 12; step++) world.update(step * 0.25, camera, { x: step * 0.5, z: 12, moving: true });
  const uniforms = world.surface.material.uniforms;
  const resources = [world.surface.geometry, world.surface.material, uniforms.uRipples.value];
  world.setQuality(true);
  assert.equal(uniforms.uRippleLimit.value, 6);
  assert.equal(uniforms.uWaveScale.value, 0.7);
  assert.ok(uniforms.uRipples.value.slice(6).every(ripple => ripple.w === 0));
  for (let step = 13; step <= 30; step++) world.update(step * 0.25, camera, { x: step * 0.5, z: 12, moving: true });
  assert.ok(uniforms.uRipples.value.filter(ripple => ripple.w > 0).length <= 6);
  world.setQuality(false);
  assert.equal(uniforms.uRippleLimit.value, 10);
  assert.equal(scene.children.length, 3);
  [world.surface.geometry, world.surface.material, uniforms.uRipples.value].forEach((resource, index) => assert.equal(resource, resources[index]));
  assert.ok(Object.values(uniforms).every(uniform => !uniform.value?.isWebGLRenderTarget));
  world.dispose();
});

test("night fill keeps avatars readable with two bounded non-shadow lights and no campfire illumination", () => {
  const { world, scene } = fixture();
  const lights = scene.children.filter(object => object.isLight);
  const fill = scene.getObjectByName("uyuni-sky-fill"), moon = scene.getObjectByName("uyuni-sun-moon");
  assert.equal(lights.length, 2);
  for (let hour = 0; hour <= 24; hour += 0.25) {
    const daylight = daylightAt(hour);
    world.applyDaylight(daylight);
    assert.ok(lights.every(light => Number.isFinite(light.intensity) && light.intensity > 0 && light.intensity < 2));
    assert.ok(lights.every(light => !light.castShadow), "the brighter night never allocates shadow maps");
    if (daylight.stars >= 0.99) {
      assert.ok(fill.intensity >= 1.5, `mirror bounce keeps faces readable at ${hour}:00`);
      assert.ok(moon.intensity >= 0.5, `moonlight preserves character shape at ${hour}:00`);
    }
    assert.ok(world.surface.material.uniforms.uSandTint.value.toArray().every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  }
  world.applyDaylight(daylightAt(0));
  const night = lights.map(light => light.intensity);
  world.setFireState(12, "rose"); world.setFireFlare(1); world.setFireTint(new THREE.Color(0xff0000));
  assert.deepEqual(lights.map(light => light.intensity), night);
  world.dispose();
});

test("world disposal releases only its own geometry and material once, retaining injected textures", () => {
  const { world, scene, sand, uniforms, camera } = fixture();
  const retained = new THREE.Group(); scene.add(retained);
  let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0;
  world.surface.geometry.addEventListener("dispose", () => geometryDisposals++);
  world.surface.material.addEventListener("dispose", () => materialDisposals++);
  for (const texture of [sand, uniforms.uPhoto.value, uniforms.uGalaxy.value]) texture.addEventListener("dispose", () => textureDisposals++);
  world.dispose(); world.dispose();
  world.update(20, camera, { x: 0, z: 12, moving: true });
  world.applyDaylight(daylightAt(12)); world.setQuality(true);
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1); assert.equal(textureDisposals, 0);
  assert.deepEqual(scene.children, [retained]);
});
