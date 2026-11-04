import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/daylight.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=function\b|const\b)/g, "");
const context = {};
vm.runInNewContext(`${source}\nglobalThis.api = { daylightAt };`, context);
const { daylightAt } = context.api;
const energy = rgb => rgb.reduce((sum, value) => sum + value, 0);

test("18:00 fills the sky and reflection palette with rose pink, sustained through 19:00", () => {
  for (let hour = 18; hour <= 19; hour += 1 / 60) {
    const color = daylightAt(hour);
    for (const channel of ["skyTop", "skyHorizon", "cloud", "seaShallow", "fog"]) {
      const [r, g, b] = color[channel];
      assert.ok(r > g * 1.2 && b > g * 1.05, `${channel} has a rose rather than yellow cast at ${hour}`);
    }
    assert.ok(color.skyHorizon[0] > .9, "the red horizon stays luminous through the requested sunset hour");
    assert.ok(color.skyTop[0] > .5, "rose extends above the horizon instead of leaving a blue daytime ceiling");
    assert.ok(color.stars < .15 && color.deepNight === 0);
  }
  assert.ok(daylightAt(17.5).skyTop[0] < daylightAt(18).skyTop[0]);
  assert.ok(daylightAt(17.75).skyTop[0] > daylightAt(17.5).skyTop[0]);
});

test("rose afterglow fades through purple dusk into full dark night by 20:00 without a brightness jump", () => {
  let previousBrightness = Infinity, previousStars = 0;
  for (let minute = 0; minute <= 120; minute++) {
    const color = daylightAt(18 + minute / 60);
    const brightness = energy(color.skyTop) + energy(color.skyHorizon) + energy(color.cloud);
    assert.ok(brightness <= previousBrightness + 1e-10, "the evening gradually darkens");
    assert.ok(color.stars >= previousStars - 1e-10, "stars arrive gradually");
    previousBrightness = brightness; previousStars = color.stars;
  }
  const dusk = daylightAt(19.5);
  assert.ok(dusk.skyTop[2] > dusk.skyTop[0] && dusk.skyTop[0] > dusk.skyTop[1], "the last afterglow is violet");
  daylightAt(20).skyTop.forEach((value, index) => assert.ok(Math.abs(value - daylightAt(0).skyTop[index]) < 1e-10));
  for (const hour of [20, 20.5, 21, 22, 23, 0, 4.5]) {
    const night = daylightAt(hour);
    assert.equal(night.deepNight, 1);
    assert.equal(night.stars, 1);
    assert.equal(night.lanterns, 1);
    assert.equal(night.fire, 1);
    assert.equal(night.sunGlow, 0, "sunset glow has completely faded by 20:00");
    assert.equal(night.label, "밤", "the visible time label agrees with the dark sky");
    assert.ok(Math.max(...night.skyTop) < .08 && Math.max(...night.skyHorizon) < .16);
    assert.ok(Math.max(...night.fog) < .15, "pink twilight never leaks into the dark night fill");
  }
});

test("all color and lighting channels remain continuous at every new sunset boundary", () => {
  const channels = ["skyTop", "skyHorizon", "sunColor", "cloud", "cloudAmount", "seaDeep", "seaShallow", "foam", "sandTint", "tint", "fog", "stars", "sunGlow", "specular", "fire", "lanterns", "deepNight"];
  for (const boundary of [16, 17.5, 18, 19, 19.5, 20, 24, 4.5, 5.5]) {
    const before = daylightAt(boundary - 1e-5), after = daylightAt(boundary + 1e-5);
    for (const channel of channels) {
      const a = Array.isArray(before[channel]) ? before[channel] : [before[channel]];
      const b = Array.isArray(after[channel]) ? after[channel] : [after[channel]];
      a.forEach((value, index) => assert.ok(Number.isFinite(value) && Math.abs(value - b[index]) < .0001,
        `${channel} is continuous around ${boundary}:00`));
    }
  }
});
