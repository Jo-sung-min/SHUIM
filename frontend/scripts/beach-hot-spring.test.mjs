import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

async function loadModule(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|const\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(", ")} };`, context);
  return context.api;
}
const { HOT_SPRING_PATH: path, HOT_SPRING: spa, HOT_SPRING_COLLIDERS: walls, hotSpringFloorHeight: floor, hotSpringCeilingHeight: ceiling, HOT_SPRING_BATHS: baths, HOT_SPRING_STAIRS: stairs, HOT_SPRING_BACK: rearLimit, hotSpringBathIndex: bathIndex, hotSpringBathDistance: bathDistance, hotSpringInWater: inWater, buildHotSpring } = await loadModule("../lib/beach/hot-spring.ts", { THREE, ONSEN_BATHS: [{ x: 0, z: 45, lift: 0 }, { x: -7.6, z: 55, lift: 4 }, { x: 7.6, z: 55, lift: 4 }] }, ["HOT_SPRING_PATH", "HOT_SPRING", "HOT_SPRING_COLLIDERS", "hotSpringFloorHeight", "hotSpringCeilingHeight", "HOT_SPRING_BATHS", "HOT_SPRING_STAIRS", "HOT_SPRING_BACK", "hotSpringBathIndex", "hotSpringBathDistance", "hotSpringInWater", "buildHotSpring"]);
const { resolveWalls } = await loadModule("../lib/beach/navigation.ts", {}, ["resolveWalls"]);

function assertClear(x, z, message) {
  const [actualX, actualZ] = resolveWalls(x, z, walls, 0.35);
  assert.ok(Math.abs(actualX - x) < 1e-8 && Math.abs(actualZ - z) < 1e-8, `${message} at ${x}, ${z}`);
}

test("the entire hidden stair route clears an avatar and rises continuously through its landings", () => {
  let previous = path[0].y;
  for (let leg = 0; leg < path.length - 1; leg++) {
    const a = path[leg], b = path[leg + 1], distance = Math.hypot(b.x - a.x, b.z - a.z);
    assert.equal(floor(a.x, a.z), a.y);
    const samples = Math.ceil(distance / 0.02);
    for (let step = 0; step <= samples; step++) {
      const x = a.x + (b.x - a.x) * step / samples, z = a.z + (b.z - a.z) * step / samples;
      const height = floor(x, z);
      assert.ok(Number.isFinite(height));
      assert.ok(height >= previous - 1e-8 && height - previous < 0.025, "no step or backward height snap");
      assertClear(x, z, "route center is reachable");
      for (const side of [-0.2, 0.2]) assertClear(x + (b.z - a.z) / distance * side, z - (b.x - a.x) / distance * side, "comfortable lateral clearance");
      if (ceiling(x, z) !== null) assert.ok(Math.abs(ceiling(x, z) - height - 2.45) < 1e-8);
      previous = height;
    }
  }
  assert.equal(previous, 18);
  assert.equal(ceiling(0, 44), null, "the spa remains open to the sky");
});

test("turning across each corner keeps the landing height level", () => {
  for (const point of path.slice(1, -1)) {
    for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
      assert.equal(floor(point.x + dx, point.z + dz), point.y);
      assertClear(point.x + dx, point.z + dz, "turn landing");
    }
  }
});

test("the sloped bowl enters waist-deep water smoothly and the sea-facing rim stays low and solid", () => {
  let previous = spa.deckY;
  for (let index = 0; index <= 220; index++) {
    const x = 6 - index * 0.02, y = floor(x, 45);
    assertClear(x, 45, "recessed water access");
    assert.ok(y <= previous + 1e-8 && previous - y < 0.035, "the slope never jumps between deck and pool floor");
    previous = y;
  }
  assert.equal(floor(0, 45), spa.floorY);
  assert.equal(floor(5.7, 45), spa.deckY);
  assert.ok(spa.waterY - spa.floorY <= 1.05);
  for (const bath of baths) for (let degrees = 0; degrees < 360; degrees += 10) {
    const dx = Math.cos(degrees * Math.PI / 180), dz = Math.sin(degrees * Math.PI / 180);
    let previous = floor(bath.x + dx * 4.6, bath.z + dz * 4.6);
    for (let radius = 4.6; radius >= 3.6; radius -= 0.05) {
      const x = bath.x + dx * radius, z = bath.z + dz * radius, y = floor(x, z);
      assert.ok(Math.abs(y - previous) <= 0.1, `the bowl slopes evenly at ${degrees} degrees`);
      previous = y;
      const [nextX, nextZ] = resolveWalls(x, z, walls, 0.35);
      assert.ok(Math.hypot(nextX - x, nextZ - z) < 1e-6, `nothing blocks wading in at ${degrees} degrees`);
    }
  }
  for (const side of [-1, 1]) {
    for (let step = 0; step <= 40; step++) assertClear(5.35, 45 + side * step * 0.05, "stairs also open onto both dry deck aisles");
    for (let step = 0; step <= 160; step++) {
      const angle = side * (0.3 + step * (Math.PI - 0.3) / 160);
      assertClear(Math.cos(angle) * 5.8, 45 + Math.sin(angle) * 5.8, "the full dry deck circle remains walkable");
    }
  }
});

test("the high deck cannot be entered from the ground around the hillside", () => {
  for (const [x, z] of [[-12, 34], [0, 34], [7.7, 44], [10, 46], [16, 50], [-10, 46], [0, 59.6], [0, 60], [-16, 60], [9, 62.8]]) {
    const [nextX, nextZ] = resolveWalls(x, z, walls, 0.35);
    assert.ok(Math.hypot(nextX - x, nextZ - z) > 0.01, `ground shortcut ${x},${z} is blocked`);
  }
  for (const [x, z] of [[0, 20], [13, 29], [-13, 29], [Number.NaN, 44], [0, Number.POSITIVE_INFINITY]]) assert.equal(floor(x, z), null);
  for (let z = 19; z <= 33.5; z += 0.1) assertClear(6.5, z, "the outside aisle reaches the concealed entrance without entering a house");
  assert.ok(walls.length < 560, `static collision work stays bounded on mobile: ${walls.length}`);
});

test("actual tunnel meshes have continuous floors and ceilings without intersecting the walking body", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  scene.updateMatrixWorld(true);
  const solids = [];
  onsen.group.traverse((object) => { if (object.isMesh && !object.material.transparent) solids.push(object); });
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3();
  for (let leg = 0; leg < path.length - 1; leg++) {
    const a = path[leg], b = path[leg + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    const direction = new THREE.Vector3((b.x - a.x) / length, 0, (b.z - a.z) / length);
    const samples = Math.ceil(length / 0.1);
    for (let step = 0; step <= samples; step++) {
      const x = a.x + (b.x - a.x) * step / samples, z = a.z + (b.z - a.z) * step / samples;
      const y = floor(x, z);
      ray.set(origin.set(x, y + 0.08, z), new THREE.Vector3(0, -1, 0)); ray.far = 0.2;
      assert.ok(ray.intersectObjects(solids, false).length, `a visible floor supports (${x},${z})`);
      ray.set(origin.set(x, y + 0.22, z), new THREE.Vector3(0, 1, 0)); ray.far = 1.6;
      assert.equal(ray.intersectObjects(solids, false).length, 0, `no cliff or backing occupies the body at (${x},${z})`);
      if (ceiling(x, z) !== null) {
        ray.set(origin.set(x, y + 1.7, z), new THREE.Vector3(0, 1, 0)); ray.far = 1.3;
        assert.ok(ray.intersectObjects(solids, false).length, `closed roof at (${x},${z})`);
        if (step > 3 && step < samples - 3 && !(leg === path.length - 2 && x < 7.15)) {
          for (const side of [-1, 1]) {
            ray.set(origin.set(x, y + 1.7, z), new THREE.Vector3(direction.x * side * 0.25, 1, direction.z * side * 0.25).normalize()); ray.far = 1.6;
            assert.ok(ray.intersectObjects(solids, false).length, `no diagonal roof seam at (${x},${z})`);
          }
        }
        if (!(leg === path.length - 2 && x < 7.15)) {
          for (const side of [-1, 1]) {
            const across = new THREE.Vector3(direction.z * side, 0, -direction.x * side);
            if (leg === 0 && x <= 7.225 && across.z < 0) continue; // Concealed south-facing entrance.
            if (floor(x + across.x * 1.35, z + across.z * 1.35) !== null) continue;
            ray.set(origin.set(x, y + 1.2, z), across); ray.far = 1.6;
            assert.ok(ray.intersectObjects(solids, false).length, `closed side backing at (${x},${z})`);
          }
        }
      }
      if (step < samples) {
        for (const bodyY of [0.25, 0.9, 1.6]) {
          ray.set(origin.set(x, y + bodyY, z), direction); ray.far = Math.min(0.12, length / samples);
          assert.equal(ray.intersectObjects(solids, false).length, 0, `clear forward body volume at (${x},${z}) height ${bodyY}`);
        }
      }
    }
  }
  onsen.dispose();
});

test("bathing eye height sees the sea through a 140-degree opening without fences or tall stones", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  scene.updateMatrixWorld(true);
  const solids = [];
  onsen.group.traverse((object) => { if (object.isMesh && !object.material.transparent) solids.push(object); });
  const origin = new THREE.Vector3(0, spa.floorY + 1.55, 45), ray = new THREE.Raycaster();
  for (let degrees = -160; degrees <= -20; degrees += 2) {
    const radians = degrees * Math.PI / 180;
    ray.set(origin, new THREE.Vector3(Math.cos(radians), 0, Math.sin(radians))); ray.far = 12;
    assert.equal(ray.intersectObjects(solids, false).length, 0, `the sea horizon is visible at ${degrees} degrees from inside the water`);
  }
  const cliff = onsen.group.getObjectByName("onsen-cliff-core");
  const bounds = new THREE.Box3().setFromObject(cliff);
  assert.ok(Math.abs(bounds.min.y) < 1e-5, "the raised bath has a solid foundation down to ground level");
  assert.ok(spa.floorY - bounds.max.y >= 0.03, "the support cap cannot fight with the visible submerged floor");
  onsen.dispose();
});

test("offset camera positions never see through a tunnel seam in eight viewing directions", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  scene.updateMatrixWorld(true);
  const solids = [];
  onsen.group.traverse((object) => { if (object.isMesh && !object.material.transparent) solids.push(object); });
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), direction = new THREE.Vector3();
  for (let leg = 0; leg < path.length - 1; leg++) {
    const a = path[leg], b = path[leg + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const samples = Math.ceil(length / 0.45);
    for (let sample = 0; sample <= samples; sample++) {
      for (const lateral of [-0.3, 0, 0.3]) {
        const x = a.x + dx * length * sample / samples + dz * lateral;
        const z = a.z + dz * length * sample / samples - dx * lateral;
        if (ceiling(x, z) === null) continue;
        for (const eyeHeight of [0.7, 1.25, 1.8]) {
          origin.set(x, floor(x, z) + eyeHeight, z);
          for (let heading = 0; heading < 8; heading++) {
            for (const pitch of [0, 0.5, 1]) {
              direction.set(Math.cos(heading * Math.PI / 4), pitch, Math.sin(heading * Math.PI / 4)).normalize();
              let boundary = null;
              for (let distance = 0.025; distance <= 3.5; distance += 0.025) {
                const px = x + direction.x * distance, py = origin.y + direction.y * distance, pz = z + direction.z * distance;
                // The two doorways are deliberately open; all interior faces are sealed.
                if ((pz < 32.65 && Math.abs(px - 6.5) < 0.73) || (px < 7.05 && pz > 43.5 && pz < 46.5)) break;
                const top = ceiling(px, pz), bottom = floor(px, pz);
                if (top === null || bottom === null || py > top || py < bottom) { boundary = distance; break; }
              }
              if (boundary === null) continue;
              ray.set(origin, direction); ray.far = boundary + 0.16;
              assert.ok(ray.intersectObjects(solids, false).length, `sealed at (${x.toFixed(3)},${z.toFixed(3)}) eye=${eyeHeight}, heading=${heading}, pitch=${pitch}, boundary=${boundary.toFixed(3)}`);
            }
          }
        }
      }
    }
  }
  onsen.dispose();
});

test("the shrub-covered entrance is an unobstructed north-to-east turn with closed west and north caps", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  scene.updateMatrixWorld(true);
  const solids = [];
  onsen.group.traverse((object) => { if (object.isMesh && !object.material.transparent) solids.push(object); });
  const ray = new THREE.Raycaster();
  for (const x of [6.2, 6.5, 6.8]) {
    for (const y of [0.7, 1.25, 1.8]) {
      ray.set(new THREE.Vector3(x, y, 32.4), new THREE.Vector3(0, 0, 1)); ray.far = 1.1;
      assert.equal(ray.intersectObjects(solids, false).length, 0, `entry body is clear at x=${x}, y=${y}`);
    }
    for (const z of [32.7, 33, 33.4]) {
      assert.equal(floor(x, z), 0);
      assert.equal(ceiling(x, z), 2.45);
      ray.set(new THREE.Vector3(x, 1.7, z), new THREE.Vector3(0, 1, 0)); ray.far = 1.1;
      assert.ok(ray.intersectObjects(solids, false).length, "the entrance joins its roof without a corner hole");
    }
  }
  ray.set(new THREE.Vector3(6.2, 1.5, 33.5), new THREE.Vector3(1, 0, 0)); ray.far = 1.5;
  assert.equal(ray.intersectObjects(solids, false).length, 0, "the first ascent is visible through the right turn");
  for (const direction of [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
    ray.set(new THREE.Vector3(6.2, 1.5, 33.5), direction); ray.far = 1;
    assert.ok(ray.intersectObjects(solids, false).length, "the other ends of the entrance landing are closed");
  }
  onsen.dispose();
});

test("two upper baths sit behind and above the first, side by side, and every step up has a floor", () => {
  assert.deepEqual(baths.map((bath) => [bath.x, bath.z, bath.lift]), [[0, 45, 0], [-7.6, 55, 4], [7.6, 55, 4]]);
  assert.equal(rearLimit, 63);
  const key = (x, z) => `${Math.round(x * 4)},${Math.round(z * 4)}`, seen = new Set([key(6.3, 45)]);
  const reached = [];
  const directions = Array.from({ length: 8 }, (_, index) => [Math.cos(index * Math.PI / 4) * 0.25, Math.sin(index * Math.PI / 4) * 0.25]);
  let frontier = [[6.3, 45]];
  while (frontier.length) {
    const next = [];
    for (const [x, z] of frontier) {
      reached.push([x, z]);
      for (const [dx, dz] of directions) {
        const [nx, nz] = resolveWalls(x + dx, z + dz, walls, 0.35);
        if (nz < 35 || Math.hypot(nx - x, nz - z) < 0.06 || seen.has(key(nx, nz))) continue;
        seen.add(key(nx, nz));
        next.push([nx, nz]);
      }
    }
    frontier = next;
  }
  for (const [x, z] of reached) assert.notEqual(floor(x, z), null, `walkable point ${x},${z} has a floor`);
  assert.ok(Math.max(...reached.map(([, z]) => z)) < rearLimit, "the last bath closes the map");
  for (const [index, bath] of baths.entries()) {
    assert.ok(reached.some(([x, z]) => bathIndex(x, z) === index && Math.hypot(x - bath.x, z - bath.z) > 5.5), `bath ${index} deck is reached`);
    assert.ok(reached.some(([x, z]) => bathIndex(x, z) === index && Math.hypot(x - bath.x, z - bath.z) < 2), `bath ${index} water is reached`);
    assert.equal(floor(bath.x, bath.z), spa.floorY + bath.lift);
    assert.equal(inWater(bath.x, bath.z), true);
    assert.equal(inWater(bath.x + 6, bath.z), false, "the deck is dry");
  }
  for (const stair of stairs) {
    assert.equal(floor(stair.x, stair.startZ), spa.deckY, "the stair starts level with the first deck");
    assert.equal(floor(stair.x, stair.endZ), stair.topY, "and ends level with the upper deck");
    let previous = spa.deckY;
    for (let z = stair.startZ; z <= stair.endZ; z += 0.25) {
      const y = floor(stair.x, z);
      assert.ok(y >= previous && y - previous <= 0.25, `the climb is even at z=${z}`);
      previous = y;
      assert.equal(bathDistance(stair.x, z), 0, "a robe stays on between baths");
      assert.equal(ceiling(stair.x, z), null, "the stairs are open to the sky");
    }
    assert.equal(floor(stair.x, stair.startZ - 0.5), spa.deckY);
  }
  assert.ok(bathDistance(0, 30) > 7.65);
});

test("the open sea side of the first deck leads onto a short rock ledge", () => {
  const ledge = floor(0, 37);
  assert.ok(ledge < spa.deckY && ledge > spa.deckY - 1, `ledge floor ${ledge}`);
  assert.equal(floor(0, 35), null, "the ledge ends before the cliff face");
  assert.equal(floor(0, 37.5) === null, false);
  assert.equal(floor(-16, 50), null, "the land-side rim stays closed");
  const [x, z] = resolveWalls(0, 36.7, walls, 0.35);
  assert.ok(Math.hypot(x, z - 36.7) < 1e-6, "the ledge is walkable");
});

test("the entry floor is continuous and the dark wood photo is lifted to warm boards", () => {
  const scene = new THREE.Scene();
  const onsen = buildHotSpring(scene, { wood: new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture() }) });
  scene.updateMatrixWorld(true);
  const deckColor = onsen.group.getObjectByName("onsen-open-sky-deck").material.color;
  assert.ok(deckColor.r > 1 && deckColor.g > 1 && deckColor.b > 1, "a tint below 1 would multiply the dark photo to black");
  const samples = [[5.5, 45], [5.4, 46], [5.4, 44.05], [6.8, 45.95], [6.8, 44.05], [6.3, 46.22], [4.75, 45.92]];
  for (const bath of baths) for (const [x, z] of samples) {
    if (bath.lift && x >= 5.95) continue;
    const at = [x + bath.x, z - 45 + bath.z];
    const ray = new THREE.Raycaster(new THREE.Vector3(at[0], spa.deckY + bath.lift + 1, at[1]), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(onsen.group, true).find((candidate) => !candidate.object.name.includes("steam"));
    assert.ok(hit, `floor mesh above the hill at ${at}`);
    assert.ok(hit.point.y > spa.deckY + bath.lift - 0.02, `${hit.object.name} at ${at} is y=${hit.point.y}`);
  }
  onsen.dispose();
});

test("walking surfaces of different stone never share a plane, so the entry cannot flicker", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  scene.updateMatrixWorld(true);
  const solids = [];
  onsen.group.traverse((object) => { if (object.isMesh && !object.material.transparent) solids.push(object); });
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const surfaces = (x, z, y) => { ray.set(new THREE.Vector3(x, y + 0.3, z), down); ray.far = 0.5; return ray.intersectObjects(solids, false); };
  for (const [x, z, y] of [[6.2, 45, spa.deckY], [6.5, 44.6, spa.deckY], [6.4, 45.5, spa.deckY]]) {
    const hits = surfaces(x, z, y);
    assert.equal(hits[0].object.name, "onsen-arrival-landing");
    assert.equal(hits.filter((hit) => hit.object.name === "onsen-continuous-stone-stairs").length, 0, "the flight stops at the landing");
  }
  for (const point of path.slice(1, -1)) {
    let overlaps = 0;
    for (const [dx, dz] of [[0.11, 0.13], [-0.11, 0.13], [0.11, -0.13], [-0.11, -0.13]]) {
      const hits = surfaces(point.x + dx, point.z + dz, point.y);
      const flight = hits.find((hit) => hit.object.name === "onsen-continuous-stone-stairs");
      if (!flight) continue;
      overlaps++;
      assert.equal(hits[0].object.name, "onsen-level-turn-landings");
      assert.ok(hits[0].point.y - flight.point.y >= 0.008, `turn at ${point.x},${point.z} clears the flight below it`);
    }
    assert.ok(overlaps > 0, `turn at ${point.x},${point.z} was sampled`);
  }
  onsen.dispose();
});

test("each upper bath falls past a rock face into the first, and neither level leaks into the other", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  scene.updateMatrixWorld(true);
  const cascade = onsen.group.getObjectByName("onsen-cascade-water"), terrace = onsen.group.getObjectByName("onsen-waterfall-cliffs");
  assert.ok(cascade.material.isShaderMaterial && cascade.material.transparent);
  const position = cascade.geometry.getAttribute("position");
  let highest = -Infinity, lowest = Infinity;
  for (let index = 0; index < position.count; index++) { highest = Math.max(highest, position.getY(index)); lowest = Math.min(lowest, position.getY(index)); }
  assert.ok(highest > spa.waterY + 4 && highest < spa.deckY + 4.1, `the stream starts at the upper water, y=${highest}`);
  assert.ok(lowest < spa.waterY + 0.02, `and ends on the first bath's water, y=${lowest}`);
  for (const bath of baths.slice(1)) {
    const gap = Math.hypot(bath.x, bath.z - 45) - 2 * spa.poolRadius;
    assert.ok(gap > 2 && gap < 4.5, `the pools stand close together: ${gap}`);
    const towardX = -bath.x / Math.hypot(bath.x, bath.z - 45), towardZ = (45 - bath.z) / Math.hypot(bath.x, bath.z - 45);
    const lower = [towardX * -5.6, 45 + towardZ * -5.6], upper = [bath.x + towardX * 5.3, bath.z + towardZ * 5.3];
    assert.equal(floor(...lower), spa.deckY, "the shelf at the foot of the curtain belongs to the first deck");
    assert.ok(floor(...upper) > spa.deckY + 3.4, "the lip above it belongs to the upper bath");
    assert.ok(Math.hypot(...resolveWalls((lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, walls, 0.35).map((value, index) => value - (index ? (lower[1] + upper[1]) / 2 : (lower[0] + upper[0]) / 2))) > 0.05, "the curtain cannot be walked through");
    const ray = new THREE.Raycaster(new THREE.Vector3(towardX * -5.6, spa.deckY + 1.2, 45 + towardZ * -5.6), new THREE.Vector3(-towardX, 0, -towardZ), 0, 2);
    assert.ok(ray.intersectObject(terrace).length, "seen from the first deck it is a real wall");
  }
  onsen.dispose();
});

test("the fence uses thin warm bamboo and three rails while leaving the sea opening unobstructed", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  const bamboo = onsen.group.getObjectByName("onsen-bamboo-screen");
  const posts = onsen.group.getObjectByName("onsen-fence-posts");
  const rails = onsen.group.getObjectByName("onsen-fence-rails");
  assert.ok(bamboo.count >= 40 && bamboo.count <= 120, `bamboo rods=${bamboo.count}`);
  assert.equal(bamboo.geometry.parameters.radialSegments, 6);
  assert.equal(bamboo.geometry.parameters.openEnded, true);
  assert.ok(bamboo.instanceColor, "slight material variation distinguishes individual bamboo stalks");
  assert.equal(rails.count, posts.count * 3);
  const transform = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (let index = 0; index < bamboo.count; index++) {
    bamboo.getMatrixAt(index, transform); transform.decompose(position, rotation, scale);
    assert.ok(scale.x < 0.09 && scale.z < 0.09, "the screen has slim round stalks instead of broad solid planks");
    assert.ok(position.z - 45 >= -Math.sin(Math.PI / 9) * 7.25 - 1e-5, "no bamboo blocks the open sea sector");
  }
  onsen.dispose();
});

test("stone and timber variants retain shared world-space shader projection hooks", () => {
  const source = new THREE.MeshStandardMaterial();
  source.onBeforeCompile = (shader) => { shader.vertexShader = `world-space-projection\n${shader.vertexShader}`; };
  source.customProgramCacheKey = () => "shared-world-projection";
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene, { stone: source, wood: source });
  for (const name of ["onsen-natural-rim-stones", "onsen-submerged-stone-floor", "onsen-continuous-wall-backing", "onsen-bamboo-screen", "onsen-open-sky-deck"]) {
    const material = onsen.group.getObjectByName(name).material;
    assert.notEqual(material, source, "tints remain independently editable");
    const shader = { vertexShader: "base", fragmentShader: "base" };
    material.onBeforeCompile(shader, null);
    assert.equal(shader.vertexShader, "world-space-projection\nbase");
    assert.equal(material.customProgramCacheKey(), source.customProgramCacheKey());
  }
  onsen.dispose(); source.dispose();
});

test("the onsen keeps a modest draw budget, no shadow lights, and releases only its own resources", () => {
  const sharedMap = new THREE.Texture();
  const stone = new THREE.MeshStandardMaterial({ map: sharedMap }), wood = new THREE.MeshStandardMaterial({ map: sharedMap });
  let mapDisposals = 0;
  sharedMap.addEventListener("dispose", () => mapDisposals++);
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene, { stone, wood });
  const annex = onsen.group.getObjectByName("onsen-upper-bath-details");
  let lights = 0, meshes = 0, triangles = 0, rearMeshes = 0, rearTriangles = 0, disposedGeometry = 0, disposedMaterial = 0;
  const geometries = new Set(), materials = new Set();
  onsen.group.traverse((object) => {
    if (object.isPointLight) { lights++; assert.equal(object.castShadow, false); }
    if (!object.isMesh) return;
    let rear = false;
    object.traverseAncestors((parent) => { rear ||= parent === annex; });
    const positions = object.geometry.getAttribute("position");
    assert.ok(Array.from(positions.array).every(Number.isFinite), object.name);
    const drawn = (object.geometry.index?.count ?? positions.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    if (rear) { rearMeshes++; rearTriangles += drawn; } else { meshes++; triangles += drawn; }
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  assert.equal(lights, 2);
  assert.ok(meshes <= 32, `draws=${meshes}`);
  assert.ok(triangles < 42000, `triangles=${triangles}`);
  assert.ok(rearMeshes <= 12, `upper detail draws=${rearMeshes}`);
  assert.ok(rearTriangles < 30000, `rear triangles=${rearTriangles}`);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 10); onsen.update(1, camera);
  assert.equal(annex.visible, false, "close upper details cost nothing from the beach");
  assert.equal(onsen.group.getObjectByName("onsen-upper-stair-walls").visible, true, "the stairs still read from the sea");
  camera.position.set(0, 19.5, 48); onsen.update(2, camera);
  assert.equal(annex.visible, true);
  assert.equal(onsen.group.getObjectByName("onsen-pool-warm-light").position.z, 45);
  camera.position.set(-7.6, 23.5, 54); onsen.update(3, camera);
  assert.deepEqual(onsen.group.getObjectByName("onsen-pool-warm-light").position.toArray(), [-7.6, spa.deckY + 4 + 2.7, 55], "one light follows the visitor between baths");
  assert.equal(onsen.group.getObjectByName("onsen-soft-rising-steam").count, 12);
  onsen.applyDaylight(0); onsen.update(123); onsen.applyDaylight(1); onsen.update(Number.NaN);
  for (const geometry of geometries) geometry.addEventListener("dispose", () => disposedGeometry++);
  for (const material of materials) material.addEventListener("dispose", () => disposedMaterial++);
  onsen.dispose(); onsen.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposedGeometry, geometries.size);
  assert.equal(disposedMaterial, materials.size);
  assert.equal(mapDisposals, 0, "cove-shared textures remain valid");
  assert.equal(stone.map, sharedMap);
  stone.dispose(); wood.dispose(); sharedMap.dispose();
});
