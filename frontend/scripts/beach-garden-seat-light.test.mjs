import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { hotSpring } from "./beach-world-fixture.mjs";

const typed = await readFile(new URL("../lib/beach/garden-seat-light.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" })
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=class\b)/g, "");
const context = { THREE, ...hotSpring };
vm.runInNewContext(`${source}\nglobalThis.api = { GardenSeatLight };`, context);
const { GardenSeatLight } = context.api;
const seats = hotSpring.GARDEN_SEATS.filter(seat => seat.spotId.startsWith("hall-tier-"));

function build() {
  const root = new THREE.Group();
  const shade = new THREE.Mesh(new THREE.SphereGeometry(.16, 6, 4), new THREE.MeshStandardMaterial());
  shade.name = "garden-ivory-lamp-shades";
  root.add(shade);
  const previousCompile = shade.material.onBeforeCompile, previousCacheKey = shade.material.customProgramCacheKey;
  const controller = new GardenSeatLight(root);
  const light = root.getObjectByName("garden-personal-reading-light"), glow = root.getObjectByName("garden-personal-lamp-glow");
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  shade.material.onBeforeCompile(shader, {});
  return { root, shade, controller, light, glow, shader, previousCompile, previousCacheKey };
}

function advance(controller, seconds = 2, night = 1, rain = 0) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) controller.update(1 / 60, night, rain);
}

function clean(fixture) {
  fixture.controller.dispose(); fixture.shade.geometry.dispose(); fixture.shade.material.dispose();
}

test("all 24 confirmed hall seats illuminate their own physical desk lamp", () => {
  const fixture = build(), { controller, light, glow, shader } = fixture;
  assert.equal(seats.length, 24);
  for (const seat of seats) {
    controller.setSeat({ spotId: seat.spotId, slot: seat.slot });
    advance(controller, 4);
    const lamp = shader.uniforms.uReadingLamp.value;
    const expected = new THREE.Vector3(seat.x + Math.sign(seat.x - hotSpring.HALL.x) * .5, seat.baseY + 1.12, seat.z - 1.05);
    assert.ok(new THREE.Vector3(lamp.x, lamp.y, lamp.z).distanceTo(expected) < 1e-9, `${seat.id} shade is the active source`);
    assert.ok(light.position.distanceTo(new THREE.Vector3(expected.x, expected.y - .1, expected.z)) < 1e-9);
    assert.ok(glow.visible && light.intensity > 1 && lamp.w > .5);
    for (const other of seats.filter(other => other !== seat)) {
      const otherShade = new THREE.Vector3(other.x + Math.sign(other.x - hotSpring.HALL.x) * .5, other.baseY + 1.12, other.z - 1.05);
      assert.ok(otherShade.distanceTo(expected) > 1, "neighboring desk shades stay outside the localized emissive source");
    }
  }
  clean(fixture);
});

test("walking, pavilion seating and invalid claims never turn on a personal hall lamp", () => {
  const fixture = build(), { controller, light, glow, shader } = fixture;
  const pavilion = hotSpring.GARDEN_SEATS.find(seat => !seat.spotId.startsWith("hall-tier-"));
  const claims = [null, undefined, { spotId: pavilion.spotId, slot: pavilion.slot }, { spotId: "hall-tier-99", slot: 0 },
    { spotId: seats[0].spotId, slot: -1 }, { spotId: seats[0].spotId, slot: 6 }, { spotId: seats[0].spotId, slot: .5 },
    { spotId: seats[0].spotId, slot: NaN }, { spotId: seats[0].spotId, slot: "0" }];
  for (const claim of claims) {
    controller.setSeat(claim); advance(controller);
    assert.equal(light.intensity, 0);
    assert.equal(glow.visible, false);
    assert.equal(shader.uniforms.uReadingLamp.value.w, 0);
  }
  clean(fixture);
});

test("seating fades in smoothly, repeated snapshots keep the fade, and standing fades completely out", () => {
  const fixture = build(), { controller, light, glow } = fixture;
  controller.setSeat(seats[0]);
  controller.update(1 / 60, 1, 0);
  const first = light.intensity;
  assert.ok(first > 0 && first < .3, "the first seated frame is not a full-power flash");
  for (let frame = 0; frame < 30; frame++) {
    const previous = light.intensity;
    controller.setSeat({ spotId: seats[0].spotId, slot: seats[0].slot });
    controller.update(1 / 60, 1, 0);
    assert.ok(light.intensity >= previous, "same-seat updates never restart or interrupt the fade");
  }
  advance(controller);
  const seated = light.intensity;
  controller.setSeat(null); controller.update(1 / 60, 1, 0);
  assert.ok(light.intensity > 0 && light.intensity < seated, "standing dims instead of cutting immediately");
  advance(controller);
  assert.equal(light.intensity, 0);
  assert.equal(glow.visible, false);
  clean(fixture);
});

test("a seat change dims the old desk before lighting the new desk, without crossing other tables", () => {
  const fixture = build(), { controller, light } = fixture;
  controller.setSeat(seats[0]); advance(controller);
  const oldPosition = light.position.clone();
  const next = seats[seats.length - 1];
  const nextPosition = new THREE.Vector3(next.x + .5, next.baseY + 1.02, next.z - 1.05);
  controller.setSeat(next);
  let moved = false;
  for (let frame = 0; frame < 120; frame++) {
    const previousIntensity = light.intensity;
    controller.update(1 / 60, 1, 0);
    const atOld = light.position.distanceTo(oldPosition) < 1e-9, atNext = light.position.distanceTo(nextPosition) < 1e-9;
    assert.ok(atOld || atNext, "the light must not slide across unoccupied seats");
    if (atNext && !moved) {
      assert.ok(previousIntensity < .03, "the old lamp is almost dark before relocation");
      moved = true;
    }
  }
  assert.ok(moved);
  assert.ok(light.intensity > 1);
  clean(fixture);
});

test("large, negative and invalid frame or weather inputs cannot produce invalid lighting", () => {
  const fixture = build(), { controller, light, glow, shader } = fixture;
  controller.setSeat(seats[0]); advance(controller);
  for (const [dt, night, rain] of [[-1, -2, -3], [10, 9, 12], [NaN, NaN, Infinity], [Infinity, -Infinity, NaN], [1 / 60, undefined, undefined]]) {
    controller.update(dt, night, rain);
    for (const number of [light.intensity, glow.material.opacity, ...light.position.toArray(), ...shader.uniforms.uReadingLamp.value.toArray()]) {
      assert.ok(Number.isFinite(number), `finite light output for ${dt}, ${night}, ${rain}`);
    }
    assert.ok(light.intensity >= 0 && light.intensity <= 2);
    assert.ok(glow.material.opacity >= 0 && glow.material.opacity <= .24);
  }
  clean(fixture);
});

test("one unshadowed light and one glow release owned resources once without disposing shared geometry or shade", () => {
  const fixture = build(), { root, controller, light, glow, shade, previousCompile, previousCacheKey } = fixture;
  const lights = [], sprites = [];
  root.traverse(object => { if (object.isLight) lights.push(object); if (object.isSprite) sprites.push(object); });
  assert.equal(lights.length, 1); assert.equal(sprites.length, 1);
  assert.ok(light.isPointLight); assert.equal(light.castShadow, false);
  assert.equal(glow.material.depthWrite, false); assert.equal(glow.material.depthTest, true);
  const resources = [glow.material, glow.material.map], counts = new Map(resources.map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
  let sharedDisposals = 0;
  const sharedGeometry = glow.geometry;
  const onSharedDispose = () => sharedDisposals++;
  for (const resource of [sharedGeometry, shade.geometry, shade.material]) resource.addEventListener("dispose", onSharedDispose);
  controller.dispose(); controller.dispose();
  assert.equal(root.children.length, 1); assert.equal(root.children[0], shade);
  assert.ok([...counts.values()].every(count => count === 1));
  assert.equal(sharedDisposals, 0);
  assert.equal(shade.material.onBeforeCompile, previousCompile);
  assert.equal(shade.material.customProgramCacheKey, previousCacheKey);
  controller.setSeat(seats[0]); controller.update(.1, 1, 1);
  assert.equal(root.children.length, 1, "disposed effects cannot attach themselves again");
  for (const resource of [sharedGeometry, shade.geometry, shade.material]) resource.removeEventListener("dispose", onSharedDispose);
  shade.geometry.dispose(); shade.material.dispose();
});
