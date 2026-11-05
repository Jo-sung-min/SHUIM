import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/beach/uyuni-coast.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=const\b)/g, "");
const context = {};
vm.runInNewContext(`${source}\nglobalThis.result = { UYUNI_COAST_LAYOUT, UYUNI_COAST_FUNCTIONS };`, context);
const { UYUNI_COAST_LAYOUT: layout, UYUNI_COAST_FUNCTIONS: shader } = context.result;
const ray = (azimuth, elevation, scale = 1) => ({
  x: Math.sin(azimuth) * Math.cos(elevation) * scale,
  y: Math.sin(elevation) * scale,
  z: Math.cos(azimuth) * Math.cos(elevation) * scale,
});
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = (low, high, value) => {
  const x = clamp((value - low) / (high - low), 0, 1);
  return x * x * (3 - 2 * x);
};

// Execute the actual generated GLSL's scalar branch body, replacing only GLSL
// type declarations/math builtins. This catches changes to direction convention,
// early returns or shader constants without maintaining a second coast model.
const body = shader.match(/vec3 uyuniCoast\(vec3 direction, vec3 skyColor, float night\) \{([\s\S]*)\n\}/)[1]
  .replace(/\b(?:vec3|float)\s+(\w+)\s*=/g, "let $1 =");
const coast = new Function("normalize", "atan", "abs", "clamp", "uyuniCoastIsland", `return function(direction, skyColor, night) { ${body} }`)(
  vector => {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
  }, Math.atan2, Math.abs, clamp,
  (_azimuth, _elevation, _sky, night, center, halfWidth, peak, seed) => ({ center, halfWidth, peak, seed, night }),
);

test("three separated asymmetric islands occupy less than 120 degrees behind the hotels", () => {
  assert.equal(layout.islands.length, 3);
  const intervals = layout.islands.map(island => [island.azimuth - island.halfWidth, island.azimuth + island.halfWidth]);
  assert.ok(intervals[0][0] > -Math.PI / 2 && intervals.at(-1)[1] < Math.PI / 2);
  assert.ok(intervals.at(-1)[1] - intervals[0][0] < Math.PI * 2 / 3);
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i][0] - intervals[i - 1][1] >= 0.09);
  assert.equal(new Set(layout.islands.map(island => island.height)).size, 3);
  assert.ok(layout.islands.every(island => island.height > 0 && island.height <= 0.06));
});

test("the generated shader leaves the front, open gaps and high reflected galaxy exactly unchanged", () => {
  const sky = { r: 0.35, g: 0.13, b: 0.63 };
  for (const azimuth of [-Math.PI, -Math.PI / 2, -0.95, -0.39, 0.32, 0.9, Math.PI / 2, Math.PI]) {
    for (const night of [0, 0.5, 1]) assert.equal(coast(ray(azimuth, 0.01), sky, night), sky);
  }
  for (let azimuth = -Math.PI; azimuth <= Math.PI; azimuth += 0.03) {
    for (const elevation of [-0.2, -0.01, 0.08, 0.3, 0.8, Math.PI / 2]) {
      assert.equal(coast(ray(azimuth, elevation), sky, 1), sky);
    }
  }
  for (const island of layout.islands) {
    const unit = coast(ray(island.azimuth, 0.01), sky, 1);
    assert.equal(unit.center, island.azimuth);
    assert.equal(unit.peak, island.height);
    assert.deepEqual(coast(ray(island.azimuth, 0.01, 1500), sky, 1), unit);
  }
});

test("the actual ridge formula stays continuous, low and finite with a lower foreground layer", () => {
  const prefix = shader.match(/float q =([\s\S]*?)  float aa =/)[0].replace(/  float aa =$/, "")
    .replace(/\bfloat\s+(\w+)\s*=/g, "let $1 =");
  const ridge = new Function("smoothstep", "abs", "max", "exp", "pow", "beachSkyNoise", "vec2", `
    return function(azimuth, center, halfWidth, peak, seed) {
      ${prefix}
      return { ridge, nearRidge, edge };
    };`)(smoothstep, Math.abs, Math.max, Math.exp, Math.pow, ([x, y]) => 0.5 + Math.sin(x * 0.73 + y * 0.29) * 0.5, (x, y) => [x, y]);
  for (const island of layout.islands) {
    let previous = 0;
    const heights = [];
    for (let i = 0; i <= 400; i++) {
      const q = -1 + i / 200;
      const result = ridge(island.azimuth + q * island.halfWidth, island.azimuth, island.halfWidth, island.height, island.seed);
      assert.ok(Number.isFinite(result.ridge) && result.ridge >= 0 && result.ridge <= island.height);
      assert.ok(result.nearRidge >= 0 && result.nearRidge <= result.ridge * 0.7000001);
      assert.ok(Math.abs(result.ridge - previous) < 0.002, "no angular mountain steps");
      if (i === 0 || i === 400) assert.ok(result.edge < 1e-12);
      previous = result.ridge;
      heights.push(result.ridge);
    }
    const peaks = heights.filter((height, index) => index > 0 && index < heights.length - 1
      && height > heights[index - 1] && height >= heights[index + 1]);
    assert.ok(peaks.length >= 2 && peaks.length <= 3, "a few gentle shoulders replace the single oval");
  }
  assert.doesNotMatch(shader, /\b(?:texture\w*|sampler\w*|uniform|uTime|discard)\b/);
});
