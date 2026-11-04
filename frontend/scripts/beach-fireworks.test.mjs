import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";
import { readAssetBytes } from "./asset-bytes-fixture.mjs";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/fireworks.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=function\b|class\b|const\b)/g, "");
const event = (id = "one", startedAt = 100_000, seed = 1785) => ({ id, seed, startedAt, durationMs: 12_000 });

function fixture({ mobile = false, dom = true, height = 844 } = {}) {
  let time = 100_000;
  const requests = [];
  class TextureLoader {
    load(url, onLoad, _progress, onError) {
      const texture = new THREE.Texture();
      requests.push({ url, texture, onLoad, onError });
      return texture;
    }
  }
  const context = { THREE: { ...THREE, TextureLoader }, Date: { now: () => time }, ...assets };
  if (dom) { context.document = {}; context.window = { innerHeight: height }; }
  vm.runInNewContext(`${source}\nglobalThis.api = { BeachFireworks, fireworkGeometry, FIREWORK_SPARK_URL, FIREWORK_TEXT, FIREWORK_TEXT_CENTER, FIREWORK_SKY_TEXT_CENTER };`, context);
  const scene = new THREE.Scene(), fireworks = new context.api.BeachFireworks(scene, { mobile });
  return { ...context.api, scene, fireworks, requests, setTime(value) { time = value; },
    load(index = 0) { requests[index].onLoad(requests[index].texture); } };
}

// Evaluate the production shader's scalar expressions, rather than a separate approximation.
function shimmerFunctions(vertexShader) {
  const names = ["fireworkTwinkle", "fireworkSparkFade", "fireworkLetterShimmer"];
  const declarations = names.map(name => {
    const match = vertexShader.match(new RegExp(`float ${name}\\(([^)]*)\\)\\s*\\{([^}]*)\\}`));
    assert.ok(match, `the particle shader uses ${name}`);
    return `function ${name}(${match[1].replace(/\bfloat\s+/g, "")}) { ${match[2].replace(/\bfloat\s+/g, "let ")} }`;
  }).join("\n");
  const context = { sin: Math.sin, pow: Math.pow, sqrt: Math.sqrt, max: Math.max,
    mix: (a, b, t) => a * (1 - t) + b * t,
    step: (edge, x) => x < edge ? 0 : 1,
    smoothstep: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
  };
  vm.runInNewContext(`${declarations}\nglobalThis.api = { ${names.join(", ")} };`, context);
  return context.api;
}

test("burst sparks twinkle at separate seeded phases and tempos instead of flashing the whole blossom", () => {
  const { fireworks, scene } = fixture({ mobile: true, dom: false });
  fireworks.apply([event()], 100_000);
  const object = scene.children[0], detail = object.geometry.getAttribute("detail"), timing = object.geometry.getAttribute("timing");
  const { fireworkTwinkle } = shimmerFunctions(object.material.vertexShader);
  const phases = [];
  for (let i = 0; i < detail.count; i++) if ((timing.getW(i) === 0 || timing.getW(i) === 2) && detail.getX(i) > .8) phases.push(detail.getY(i));
  assert.ok(phases.length > 500);
  for (const age of [.18, .6, 1.4, 2.6, 3.4]) {
    const values = phases.map(phase => fireworkTwinkle(age, phase));
    assert.ok(values.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    assert.ok(values.filter(value => value > .8).length > values.length * .025, "some individual stars visibly catch the light");
    assert.ok(values.filter(value => value > .8).length < values.length * .35, "bright peaks never synchronize into a full-screen flash");
    assert.ok(values.filter(value => value < .08).length > values.length * .3, "quiet particles separate the bright glints");
  }
  const peakFrames = phases.slice(0, 40).map(phase => {
    const values = Array.from({ length: 120 }, (_, frame) => fireworkTwinkle(frame / 60, phase));
    assert.ok(Math.max(...values) - Math.min(...values) > .9, "each spark visibly changes over time");
    return values.indexOf(Math.max(...values));
  });
  assert.ok(new Set(peakFrames).size > 20, "particle timing is varied, not a single shared pulse");
  assert.equal(scene.children.length, 1);
  fireworks.dispose();
});

test("late glitter stays visible while glyph strokes remain steady and all sparks expire on time", () => {
  const { fireworks, scene } = fixture({ mobile: true, dom: false });
  fireworks.apply([{ ...event(), variant: "songi" }], 100_000);
  const { fireworkSparkFade, fireworkLetterShimmer } = shimmerFunctions(scene.children[0].material.vertexShader);
  const phases = Array.from({ length: 256 }, (_, index) => index * Math.PI * 2 / 256);
  const late = phases.map(phase => fireworkSparkFade(4.2, 4.8, phase));
  assert.ok(Math.max(...late) > .15, "the falling willow leaves a few distinct last sparkles");
  assert.ok(Math.max(...late) < .3 && Math.min(...late) < .1, "the tail becomes quiet instead of staying fully lit");
  for (const phase of phases) {
    assert.equal(fireworkSparkFade(-.001, 4.8, phase), 0);
    assert.equal(fireworkSparkFade(4.8, 4.8, phase), 0);
    assert.equal(fireworkSparkFade(12, 4.8, phase), 0);
    for (const age of [.2, .8, 2, 4, 6]) {
      const brightness = fireworkLetterShimmer(age, phase);
      assert.ok(brightness >= .86 && brightness <= 1, "Hangul strokes shimmer gently without blinking out");
    }
  }
  assert.equal(scene.children[0].geometry.getAttribute("position").count, 3939, "glitter reuses the existing mobile particles");
  fireworks.dispose();
});

test("seeded trajectories are deterministic and mobile uses fewer finite particles at the same burst centers", () => {
  const { fireworkGeometry } = fixture({ dom: false });
  const geometry = fireworkGeometry(1785), copy = fireworkGeometry(1785), different = fireworkGeometry(1786);
  const mobile = fireworkGeometry(1785, true), zero = fireworkGeometry(0, true), max = fireworkGeometry(2_147_483_646, true);
  for (const name of Object.keys(geometry.attributes)) assert.deepEqual(geometry.attributes[name].array, copy.attributes[name].array, name);
  assert.notDeepEqual(geometry.getAttribute("velocity").array, different.getAttribute("velocity").array);
  assert.ok(mobile.getAttribute("position").count < geometry.getAttribute("position").count * 0.6);
  assert.ok(mobile.getAttribute("position").count < 4000 && geometry.getAttribute("position").count < 8000);
  const centers = mesh => {
    const p = mesh.getAttribute("position"), values = new Set();
    for (let index = 0; index < p.count; index++) values.add([p.getX(index), p.getY(index), p.getZ(index)].join(","));
    return [...values].sort();
  };
  assert.deepEqual(centers(mobile), centers(geometry));
  for (const candidate of [geometry, mobile, zero, max]) {
    const count = candidate.getAttribute("position").count;
    for (const attribute of Object.values(candidate.attributes)) {
      assert.equal(attribute.count, count);
      assert.ok(attribute.array.every(Number.isFinite), "no invalid seed-derived vertex or color reaches the shader");
    }
    const p = candidate.getAttribute("position"), timing = candidate.getAttribute("timing"), details = candidate.getAttribute("detail");
    let overSea = 0, overhead = 0;
    for (let index = 0; index < count; index++) {
      assert.ok(p.getY(index) >= 40, "explosions stay far above visitors");
      if (p.getZ(index) < -40) overSea++; else if (p.getY(index) > 60) overhead++;
      assert.ok(timing.getX(index) + timing.getY(index) + timing.getZ(index) <= 12, "all tails expire inside the authoritative show duration");
      assert.ok(details.getX(index) > 0 && details.getZ(index) >= 0 && details.getZ(index) <= 1);
    }
    assert.ok(overSea > count / 2 && overhead > 0, "ocean bursts and an overhead finale serve both standing and lying viewers");
  }
  for (const candidate of [geometry, copy, different, mobile, zero, max]) candidate.dispose();
});

test("festival shells burst in three simultaneous groups with large radial expansion, willow trails and shockwave flashes", () => {
  const { fireworkGeometry } = fixture({ dom: false });
  const geometry = fireworkGeometry(371, true), timing = geometry.getAttribute("timing"), velocity = geometry.getAttribute("velocity");
  const groups = new Map(); let willows = 0, rings = 0, radius = 0;
  for (let index = 0; index < timing.count; index++) {
    const mode = timing.getW(index), start = timing.getX(index);
    if (mode === 3) groups.set(start, (groups.get(start) ?? 0) + 1);
    if (mode === 5) rings++;
    if (mode === 2) willows++;
    if (mode === 0 || mode === 2) {
      const speed = new THREE.Vector3().fromBufferAttribute(velocity, index).length();
      radius = Math.max(radius, speed * (1 - Math.exp(-0.45 * 2)) / 0.45);
    }
  }
  assert.deepEqual([...groups.values()], [3, 2, 3], "two or three shells share each exact detonation time");
  assert.equal(rings, 8); assert.ok(willows > 500);
  assert.ok(radius > 32, `the broadest blossom is over 64 metres across after two seconds: ${radius}`);
  assert.equal(geometry.userData.phrase, ""); geometry.dispose();
});

test("both exact Korean messages use deterministic glyph particles and stay within the mobile budget", () => {
  const { fireworkGeometry, FIREWORK_TEXT, FIREWORK_TEXT_CENTER } = fixture({ dom: false });
  assert.equal(FIREWORK_TEXT.songi, "송이 안녕?"); assert.equal(FIREWORK_TEXT.love, "사랑해");
  for (const [variant, expectedPoints] of [["songi", 659], ["love", 440]]) {
    const mobile = fireworkGeometry(7, true, variant), desktop = fireworkGeometry(99, false, variant);
    const letters = geometry => {
      const points = [], timing = geometry.getAttribute("timing"), velocity = geometry.getAttribute("velocity"), origin = geometry.getAttribute("position");
      for (let index = 0; index < timing.count; index++) if (timing.getW(index) === 4) {
        points.push([velocity.getX(index), velocity.getY(index)]);
        assert.deepEqual([origin.getX(index), origin.getY(index), origin.getZ(index)], Array.from(FIREWORK_TEXT_CENTER));
        assert.ok(timing.getX(index) + timing.getY(index) + timing.getZ(index) < 12);
      }
      return points;
    };
    const points = letters(mobile);
    assert.equal(points.length, expectedPoints);
    assert.deepEqual(points, letters(desktop), "text strokes do not depend on seed, density, DOM or device font");
    assert.equal(mobile.userData.phrase, FIREWORK_TEXT[variant]);
    assert.ok(mobile.getAttribute("position").count <= 4000);
    assert.ok(desktop.getAttribute("position").count <= 8000);
    assert.ok(mobile.userData.textWidth > 25 && mobile.userData.textWidth < 60);
    assert.ok(new Set(points.map(p => p[1])).size >= 20, "full multi-row glyph strokes retain Hangul detail");
    mobile.dispose(); desktop.dispose();
  }
});

test("message planes face standing and lying viewers and fit even a narrow phone frame", () => {
  for (const variant of ["songi", "love"]) for (const aspect of [320 / 900, 390 / 844, 16 / 9]) {
    const { fireworks, scene, setTime, FIREWORK_TEXT_CENTER } = fixture({ mobile: true });
    fireworks.apply([{ ...event(), variant }], 100_000); setTime(105_000);
    const object = scene.children[0], camera = new THREE.PerspectiveCamera(78, aspect, 0.1, 520);
    for (const [x, y, z] of [[0, 1.8, 8], [0, 18.4, 45], [-2.4, 17.92, 41.88]]) {
      camera.position.set(x, y, z); camera.lookAt(...FIREWORK_TEXT_CENTER); fireworks.update(camera);
      const { uTextRight: right, uTextUp: up, uTextScale: scale, uAge: age } = object.material.uniforms;
      assert.ok(Math.abs(right.value.dot(up.value)) < 1e-6);
      assert.ok(new THREE.Vector3().crossVectors(right.value, up.value).dot(camera.getWorldDirection(new THREE.Vector3())) < -0.999);
      assert.equal(age.value, 5); assert.ok(scale.value > 0 && scale.value <= 1);
      const timing = object.geometry.getAttribute("timing"), points = object.geometry.getAttribute("velocity");
      for (let index = 0; index < timing.count; index++) if (timing.getW(index) === 4) {
        const point = new THREE.Vector3(...FIREWORK_TEXT_CENTER)
          .addScaledVector(right.value, points.getX(index) * scale.value)
          .addScaledVector(up.value, points.getY(index) * scale.value).project(camera);
        assert.ok(Math.abs(point.x) < 0.85 && Math.abs(point.y) < 0.8, "no part of a glyph is clipped on a portrait phone");
      }
    }
    assert.equal(object.geometry.userData.variant, variant); fireworks.dispose();
  }
  const legacy = fixture(); legacy.fireworks.apply([event()], 100_000);
  assert.equal(legacy.scene.children[0].geometry.userData.variant, "festival"); legacy.fireworks.dispose();
});

test("default upward sky views keep both messages in frame without moving the shared burst geometry", () => {
  for (const variant of ["songi", "love"]) for (const aspect of [320 / 900, 390 / 844]) {
    const { fireworks, scene, FIREWORK_SKY_TEXT_CENTER, FIREWORK_TEXT_CENTER } = fixture({ mobile: true });
    fireworks.apply([{ ...event(), variant }], 100_000);
    const object = scene.children[0], positions = object.geometry.getAttribute("position").array.slice();
    const camera = new THREE.PerspectiveCamera(82, aspect, 0.1, 520);
    camera.layers.set(1);
    for (const [x, y, z] of [[0, 17.92, 41.88], [-2.4, 17.92, 41.88], [7, 0.285, 5.58]]) {
      camera.position.set(x, y, z);
      // The actual default lying view looks straight up, rather than at the fireworks.
      camera.rotation.set(Math.PI / 2, 0, 0, "YXZ");
      fireworks.update(camera, 105_000, 1688);
      const { uTextRight: right, uTextUp: up, uTextScale: scale, uTextCenter: center } = object.material.uniforms;
      assert.deepEqual(center.value.toArray(), Array.from(FIREWORK_SKY_TEXT_CENTER));
      const timing = object.geometry.getAttribute("timing"), points = object.geometry.getAttribute("velocity");
      for (let index = 0; index < timing.count; index++) if (timing.getW(index) === 4) {
        const point = center.value.clone()
          .addScaledVector(right.value, points.getX(index) * scale.value)
          .addScaledVector(up.value, points.getY(index) * scale.value).project(camera);
        assert.ok(Math.abs(point.x) < 0.85 && Math.abs(point.y) < 0.95,
          `the complete ${variant} message remains visible from the beach and onsen: ${point.toArray()}`);
      }
    }
    camera.rotation.y = 0.25;
    fireworks.update(camera, 105_000, 1688);
    assert.deepEqual(object.material.uniforms.uTextCenter.value.toArray(), Array.from(FIREWORK_SKY_TEXT_CENTER), "dragging does not make the message follow the camera");
    assert.deepEqual(object.geometry.getAttribute("position").array, positions, "ordinary shells keep their shared world trajectories");
    camera.layers.set(0); fireworks.update(camera, 105_000, 844);
    assert.deepEqual(object.material.uniforms.uTextCenter.value.toArray(), Array.from(FIREWORK_TEXT_CENTER), "standing and third-person views restore the seaward anchor");
    fireworks.dispose();
  }
});

test("higher drawing-buffer resolution preserves the CSS size of sparks, text dots and large flashes", () => {
  const { fireworks, scene } = fixture({ mobile: true, height: 844 });
  fireworks.apply([{ ...event(), variant: "songi" }], 100_000);
  const object = scene.children[0], camera = new THREE.PerspectiveCamera(82, 390 / 844, 0.1, 520);
  camera.position.set(0, 17.92, 41.88); camera.rotation.x = Math.PI / 2; camera.layers.set(1);
  const detail = object.geometry.getAttribute("detail"), timing = object.geometry.getAttribute("timing");
  const sampleModes = [0, 4, 3, 5];
  const sizesAt = bufferHeight => {
    fireworks.update(camera, 105_000, bufferHeight);
    const { uViewport: viewport, uPointScale: pointScale, uTextScale: textScale } = object.material.uniforms;
    assert.equal(viewport.value, bufferHeight, "actual render heights above 1400 are retained");
    assert.equal(pointScale.value, bufferHeight / 844);
    return sampleModes.flatMap(mode => {
      let index = 0; while (timing.getW(index) !== mode) index++;
      const size = detail.getX(index) * (mode === 4 ? textScale.value : 1);
      return [1, 72, 520].map(depth => Math.max(1.6 * pointScale.value,
        Math.min(96 * pointScale.value, size * camera.projectionMatrix.elements[5] * viewport.value / depth)) / (bufferHeight / 844));
    });
  };
  const normal = sizesAt(844), high = sizesAt(1688);
  for (let index = 0; index < normal.length; index++) assert.ok(Math.abs(normal[index] - high[index]) < 1e-6);
  fireworks.update(camera, 105_000, Number.NaN);
  assert.equal(object.material.uniforms.uViewport.value, 844, "an invalid optional height safely uses the CSS fallback");
  fireworks.dispose();
});

test("late joiners start at the shared age and duplicate or delayed snapshots never rewind an existing show", () => {
  const { fireworks, scene, setTime } = fixture();
  fireworks.apply([event("show", 195_000)], 200_000);
  fireworks.update();
  const points = scene.children[0];
  assert.equal(points.material.uniforms.uAge.value, 5, "the initial server-local clock offset is respected");
  setTime(101_000); fireworks.update();
  assert.equal(points.material.uniforms.uAge.value, 6);
  fireworks.apply([event("show", 195_000)], 200_000);
  fireworks.update();
  assert.equal(points.material.uniforms.uAge.value, 6, "an equal server timestamp cannot reset the clock offset");
  setTime(102_000);
  fireworks.apply([event("show", 195_000)], 200_500);
  fireworks.update();
  assert.equal(points.material.uniforms.uAge.value, 7, "even a newer but delayed snapshot cannot turn the current animation backward");
  fireworks.apply([event("old-response", 195_000)], 199_000);
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0], points, "duplicates retain one existing geometry and material");
  setTime(107_000); fireworks.update();
  assert.equal(scene.children.length, 0, "the shared show expires at its absolute end, not twelve seconds after joining");
  fireworks.apply([event("show", 195_000)], 207_000);
  assert.equal(scene.children.length, 0, "the completed event cannot replay");
  fireworks.dispose();
});

test("expired, future and malformed events never create a show or download its image", () => {
  const { fireworks, scene, requests } = fixture();
  for (const invalid of [null, event("expired", 88_000), event("future", 100_001), { ...event(), id: "" },
    { ...event(), id: 42 }, { ...event(), seed: -1 }, { ...event(), seed: Number.NaN },
    { ...event(), seed: 1.5 }, { ...event(), seed: Number.MAX_SAFE_INTEGER + 1 },
    { ...event(), startedAt: Number.POSITIVE_INFINITY }, { ...event(), durationMs: 120_000 }, { ...event(), variant: "other" }]) {
    fireworks.apply([invalid], 100_000);
  }
  fireworks.apply([event()], Number.NaN);
  fireworks.apply([event()], Number.POSITIVE_INFINITY);
  assert.equal(scene.children.length, 0); assert.equal(requests.length, 0);
  fireworks.apply([event("zero-seed", 100_000, 0)], 100_000);
  assert.equal(scene.children.length, 1, "a supported integer zero seed remains deterministic");
  fireworks.dispose();
});

test("active point draws stay bounded across repeated batches and expired shows free the next allocation", () => {
  const { fireworks, scene, setTime } = fixture({ mobile: true });
  fireworks.apply([event("one"), event("two"), event("ignored-third")], 100_000);
  assert.equal(scene.children.length, 2);
  const resources = scene.children.flatMap(object => [object.geometry, object.material]);
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener("dispose", () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  fireworks.apply([event("three"), event("four")], 100_001);
  assert.equal(scene.children.length, 2, "successive two-event responses cannot create unbounded simultaneous shows");
  for (const object of scene.children) {
    assert.equal(object.isPoints, true);
    assert.equal(object.castShadow, false); assert.equal(object.receiveShadow, false);
    assert.equal(object.layers.isEnabled(1), true, "sky-view cameras retain the show");
    assert.equal(object.frustumCulled, false, "shader-expanded trajectories are not clipped by undeformed positions");
    assert.equal(object.material.depthWrite, false); assert.equal(object.material.depthTest, true);
    assert.equal(object.material.blending, THREE.AdditiveBlending);
  }
  assert.equal(scene.children.some(object => object.isLight), false);
  setTime(112_010); fireworks.apply([event("next", 112_010)], 112_010);
  assert.equal(scene.children.length, 1);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
  for (let index = 0; index < 80; index++) {
    const now = 130_000 + index * 15_000;
    setTime(now); fireworks.apply([event(`bounded-${index}`, now)], now);
    assert.ok(scene.children.length <= 2);
  }
  assert.ok(fireworks.seen.size <= 64, "finished-show identities use a bounded retry history");
  fireworks.dispose();
});

test("the optional alpha image loads once, while shader glow remains usable during loading or failure", () => {
  const { fireworks, scene, requests, load, FIREWORK_SPARK_URL } = fixture({ height: 2200 });
  fireworks.apply([event("one"), event("two")], 100_000); fireworks.update();
  assert.equal(requests.length, 1); assert.equal(requests[0].url, assets.assetUrl(FIREWORK_SPARK_URL));
  for (const object of scene.children) {
    assert.equal(object.material.uniforms.uImage.value, 0);
    assert.equal(object.material.uniforms.uViewport.value, 1400, "point sizes have a bounded viewport multiplier");
  }
  load(); fireworks.update();
  assert.equal(requests[0].texture.colorSpace, THREE.SRGBColorSpace);
  for (const object of scene.children) {
    assert.equal(object.material.uniforms.uImage.value, 1);
    assert.equal(object.material.uniforms.uSpark.value, requests[0].texture);
  }
  fireworks.dispose();
  const failed = fixture();
  failed.fireworks.apply([event()], 100_000);
  failed.requests[0].onError(new Error("image unavailable")); failed.fireworks.update();
  assert.equal(failed.scene.children.length, 1);
  assert.equal(failed.scene.children[0].material.uniforms.uImage.value, 0);
  failed.fireworks.dispose();
});

test("disposing releases every owned GPU resource once and a late texture cannot revive the effect", () => {
  const ready = fixture();
  ready.fireworks.apply([event("one"), event("two")], 100_000); ready.load(); ready.fireworks.update();
  const resources = [...ready.scene.children.flatMap(object => [object.geometry, object.material]), ready.requests[0].texture];
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener("dispose", () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  ready.fireworks.dispose(); ready.fireworks.dispose(); ready.fireworks.update();
  ready.fireworks.apply([event("post-close")], 100_001);
  assert.equal(ready.scene.children.length, 0);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
  const delayed = fixture();
  delayed.fireworks.apply([event()], 100_000);
  let textureDisposals = 0;
  delayed.requests[0].texture.addEventListener("dispose", () => textureDisposals++);
  delayed.fireworks.dispose(); delayed.load(); delayed.fireworks.update();
  assert.equal(textureDisposals, 1); assert.equal(delayed.scene.children.length, 0);
});

test("the actual spark asset is a compact 256-pixel WebP with real transparency", async () => {
  const bytes = await readAssetBytes("/beach/fx/firework-spark-v1.webp");
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.toString("ascii", 12, 16), "VP8X");
  assert.ok(bytes[20] & 0x10, "the WebP alpha feature bit is enabled");
  assert.equal(bytes.readUIntLE(24, 3) + 1, 256); assert.equal(bytes.readUIntLE(27, 3) + 1, 256);
  assert.ok(bytes.length < 32 * 1024, `mobile spark download is ${bytes.length} bytes`);
});
