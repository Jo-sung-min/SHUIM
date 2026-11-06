import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/daylight.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=function\b|const\b)/g, "");
const context = {};
vm.runInNewContext(`${source}\nglobalThis.api = { daylightAt, uyuniDaylightAt, bambooDaylightAt, bambooSunsetAmount };`, context);
const { daylightAt, uyuniDaylightAt, bambooDaylightAt, bambooSunsetAmount } = context.api;
const energy = rgb => rgb.reduce((sum, value) => sum + value, 0);

test("bamboo sunset combines a warm amber horizon and deep blue ceiling only in the evening", () => {
  const sunset = bambooDaylightAt(18);
  assert.ok(sunset.skyHorizon[0] > .95 && sunset.skyHorizon[1] > .5 && sunset.skyHorizon[2] < .5);
  assert.ok(sunset.skyTop[2] > sunset.skyTop[1] * 1.5 && sunset.skyTop[1] > sunset.skyTop[0]);
  for (const hour of [0, 6, 12, 16, 17.5, 20, 23]) {
    const original = daylightAt(hour), forest = bambooDaylightAt(hour);
    assert.equal(bambooSunsetAmount(hour), 0);
    for (const channel of ["skyTop", "skyHorizon", "cloud", "sunColor", "stars", "deepNight"])
      assert.deepEqual(forest[channel], original[channel], `${channel} stays unchanged at ${hour}`);
  }
});

test("bamboo sunset joins the original sky continuously without changing lantern or night timing", () => {
  for (const hour of [17.5, 18, 19, 20]) {
    const before = bambooDaylightAt(hour - .00001), after = bambooDaylightAt(hour + .00001);
    for (const channel of ["skyTop", "skyHorizon", "cloud", "fog", "sunColor"])
      before[channel].forEach((value, i) => assert.ok(Math.abs(value - after[channel][i]) < .0001));
  }
  for (let minute = 0; minute < 1440; minute += 5) {
    const hour = minute / 60, base = daylightAt(hour), forest = bambooDaylightAt(hour);
    assert.equal(forest.lanterns, base.lanterns);
    assert.equal(forest.deepNight, base.deepNight);
  }
});

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

test("Uyuni sunset has an orange horizon, dark blue upper sky and first stars with the sun below the horizon", () => {
  const sunset = uyuniDaylightAt(18);
  const [r, g, b] = sunset.skyHorizon;
  assert.ok(r > 0.85 && r > g * 1.5 && g > b * 1.5, "the horizon is warm orange rather than rose");
  assert.ok(sunset.skyTop[2] > sunset.skyTop[1] && sunset.skyTop[1] > sunset.skyTop[0]);
  assert.ok(Math.max(...sunset.skyTop) < 0.3, "the upper sky is already dark enough for the first stars");
  assert.ok(sunset.stars >= 0.35 && sunset.stars <= 0.5);
  assert.ok(sunset.sun[1] < -0.025 && sunset.sun[1] > -0.05, "the sun disc is just below the shader's visibility cutoff");
  assert.ok(Math.abs(Math.hypot(...sunset.sun) - 1) < 1e-12);
  assert.equal(sunset.label, "노을");
  assert.ok(daylightAt(18).stars < 0.15, "the beach keeps its own sunset");
});

test("Uyuni preserves every original daytime and nighttime value outside its sunset, including wrapped hours", () => {
  for (let minute = -1440; minute <= 2880; minute += 5) {
    const hour = minute / 60;
    const original = daylightAt(hour);
    if (original.hour > 17.5 && original.hour < 20) continue;
    assert.deepEqual(uyuniDaylightAt(hour), original, `unchanged daylight at ${hour}:00`);
  }
});

test("Uyuni evening colors, stars and celestial directions remain finite and continuous through 20:00", () => {
  const numericEntries = daylight => Object.entries(daylight).filter(([, value]) => typeof value !== "string");
  for (const boundary of [17.5, 18, 19, 19.5, 20]) {
    const before = uyuniDaylightAt(boundary - 1e-5), after = uyuniDaylightAt(boundary + 1e-5);
    for (const [channel, value] of numericEntries(before)) {
      const a = Array.isArray(value) ? value : [value];
      const b = Array.isArray(after[channel]) ? after[channel] : [after[channel]];
      a.forEach((part, index) => assert.ok(Number.isFinite(part) && Math.abs(part - b[index]) < 0.0001,
        `${channel} stays continuous around ${boundary}:00`));
    }
  }
  let brightness = Infinity, stars = 0;
  for (let minute = 0; minute <= 150; minute++) {
    const value = uyuniDaylightAt(17.5 + minute / 60);
    const nextBrightness = energy(value.skyTop) + energy(value.skyHorizon) + energy(value.cloud);
    assert.ok(nextBrightness <= brightness + 1e-10, "the evening sky never brightens abruptly");
    assert.ok(value.stars >= stars - 1e-10 && value.stars <= 1);
    for (const [channel, parts] of numericEntries(value)) {
      for (const part of Array.isArray(parts) ? parts : [parts]) assert.ok(Number.isFinite(part), channel);
    }
    assert.ok(Math.abs(Math.hypot(...value.sun) - 1) < 1e-12);
    brightness = nextBrightness; stars = value.stars;
  }
});
