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
const { HOT_SPRING_PATH: path, HOT_SPRING: spa, HOT_SPRING_COLLIDERS: walls, hotSpringFloorHeight: floor, hotSpringCeilingHeight: ceiling, buildHotSpring } = await loadModule("../lib/beach/hot-spring.ts", { THREE }, ["HOT_SPRING_PATH", "HOT_SPRING", "HOT_SPRING_COLLIDERS", "hotSpringFloorHeight", "hotSpringCeilingHeight", "buildHotSpring"]);
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

test("the east recess enters waist-deep water smoothly and the sea-facing rim stays low and solid", () => {
  let previous = spa.deckY;
  for (let index = 0; index <= 220; index++) {
    const x = 6 - index * 0.02, y = floor(x, 45);
    assertClear(x, 45, "recessed water access");
    assert.ok(y <= previous + 1e-8 && previous - y < 0.025, "ramp never jumps between deck and pool floor");
    previous = y;
  }
  assert.equal(floor(0, 45), spa.floorY);
  assert.equal(floor(5.7, 45), spa.deckY);
  assert.ok(spa.waterY - spa.floorY <= 1.05);
  for (const angle of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
    const x = Math.cos(angle) * 4.8, z = 45 + Math.sin(angle) * 4.8;
    const [nextX, nextZ] = resolveWalls(x, z, walls, 0.35);
    assert.ok(Math.hypot(nextX - x, nextZ - z) > 0.1, "stone rim prevents walking straight through its raised edge");
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
  for (const [x, z] of [[-12, 34], [0, 34], [7.7, 44], [10, 46], [10, 50], [-10, 46], [0, 54]]) {
    const [nextX, nextZ] = resolveWalls(x, z, walls, 0.35);
    assert.ok(Math.hypot(nextX - x, nextZ - z) > 0.01, `ground shortcut ${x},${z} is blocked`);
  }
  for (const [x, z] of [[0, 20], [13, 29], [-13, 29], [Number.NaN, 44], [0, Number.POSITIVE_INFINITY]]) assert.equal(floor(x, z), null);
  for (let z = 19; z <= 33.5; z += 0.1) assertClear(6.5, z, "the outside aisle reaches the concealed entrance without entering a house");
  assert.ok(walls.length < 225, "static collision work stays bounded on mobile");
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

test("the fence uses thin warm bamboo and three rails while leaving the sea opening unobstructed", () => {
  const scene = new THREE.Scene(), onsen = buildHotSpring(scene);
  const bamboo = onsen.group.getObjectByName("onsen-bamboo-screen");
  const posts = onsen.group.getObjectByName("onsen-fence-posts");
  const rails = onsen.group.getObjectByName("onsen-fence-rails");
  assert.ok(bamboo.count >= 240 && bamboo.count <= 320, `bamboo rods=${bamboo.count}`);
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
  let lights = 0, meshes = 0, triangles = 0, disposedGeometry = 0, disposedMaterial = 0;
  const geometries = new Set(), materials = new Set();
  onsen.group.traverse((object) => {
    if (object.isPointLight) { lights++; assert.equal(object.castShadow, false); }
    if (!object.isMesh) return;
    meshes++;
    const positions = object.geometry.getAttribute("position");
    assert.ok(Array.from(positions.array).every(Number.isFinite), object.name);
    triangles += (object.geometry.index?.count ?? positions.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  assert.equal(lights, 2);
  assert.ok(meshes <= 32, `draws=${meshes}`);
  assert.ok(triangles < 42000, `triangles=${triangles}`);
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
