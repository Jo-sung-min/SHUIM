import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as THREE from "three";

async function source(name) {
  return stripTypeScriptTypes(await readFile(new URL(`../lib/beach/${name}.ts`, import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
}
const [soundSource, variantSource, fireworksSource, recordingSource, finaleSource] = await Promise.all(
  ["firework-audio", "firework-festival-variants", "fireworks", "field-recording", "firework-songi-finale"].map(source));
const geometryContext = { THREE };
vm.runInNewContext(`${variantSource}\n${finaleSource}\n${fireworksSource}\nglobalThis.make = fireworkGeometry;`, geometryContext);
const makeGeometry = geometryContext.make;
const start = 100_000, listener = { x: 0, y: 0, z: 0 };
const settle = () => new Promise(resolve => setImmediate(resolve));
const daylightContext = {};
vm.runInNewContext(`${await source("daylight")}\nglobalThis.daylightAt = daylightAt;`, daylightContext);

// Two primary flashes at 1 and 3 seconds, exactly one second of sound travel away.
function twoShells() {
  const geometry = new THREE.BufferGeometry();
  const put = (name, values, size) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  put("timing", [1, 0, .2, 3, 3, 0, .2, 3], 4);
  put("position", [343, 0, 0, 343, 0, 0], 3);
  put("detail", [4, 0, 1, 4, 0, 1], 3);
  return geometry;
}
function harness({ muted = false, savedVolume, savedMusicVolume, noWebAudio = false, slowDownload = false, bamboo = false, map = bamboo ? "bamboo" : "uyuni", delayedStream = false, running = true } = {}) {
  let localTime = 15_000, release;
  const download = slowDownload ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const requests = [], contexts = [], played = [], storage = new Map(muted ? [["sorow:fireworks-muted", "1"]] : []);
  if (savedVolume !== undefined) storage.set(`sorow:${map}-field-volume`, savedVolume);
  if (savedMusicVolume !== undefined) storage.set("sorow:uyuni-background-volume", savedMusicVolume);
  const streams = [];
  let finishStream;
  const streamGate = delayedStream ? new Promise(resolve => { finishStream = resolve; }) : Promise.resolve();
  class Stream {
    paused = true; plays = 0; loads = 0; src = ""; currentTime = 0;
    constructor() { streams.push(this); }
    async play() { this.plays++; await streamGate; this.paused=false; }
    pause() { this.paused=true; }
    removeAttribute(key) { if(key === "src") this.src=""; }
    load() { this.loads++; }
  }
  const window = new EventTarget(), document = Object.assign(new EventTarget(), { hidden: false });
  window.AudioContext = class {
    state = "suspended"; destination = {}; closes = 0;
    constructor() { contexts.push(this); }
    async resume() { this.state = "running"; }
    async close() { this.state = "closed"; this.closes++; }
    async decodeAudioData(bytes) { return { sample: new Uint8Array(bytes)[0] === 1 ? "boom" : "crackle" }; }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() { this.disconnected = true; } };
    }
    createMediaElementSource(media) {
      return { connect(gain) { media.gain=gain; return gain; }, disconnect() { media.disconnected=true; } };
    }
    createBufferSource() {
      return {
        playbackRate: { value: 1 }, stops: 0, onended: null,
        connect(gain) { this.gain = gain; return gain; }, disconnect() { this.disconnected = true; },
        start() { played.push(this); }, stop() { this.stops++; this.onended?.(); },
      };
    }
  };
  if (noWebAudio) delete window.AudioContext;
  const ctx = { window, document, AbortController, Audio:Stream, setTimeout, clearTimeout, Date: { now: () => localTime },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    assetUrl: path => "https://cdn.sorow.co.kr" + path,
    async fetch(url, options) {
      requests.push({ url, options });
      await download;
      return { ok: true, arrayBuffer: async () => new Uint8Array([url.includes("boom") ? 1 : 2]).buffer };
    },
  };
  vm.runInNewContext(`${recordingSource}\n${soundSource}\nglobalThis.api = { FireworkAudio, fireworkSoundCues };`, ctx);
  const audio = new ctx.api.FireworkAudio(listener, map, running), geometry = twoShells();
  const jump = elapsed => { localTime = 15_000 + elapsed; };
  return { audio, geometry, requests, played, contexts, storage, streams, finishStream, cues: ctx.api.fireworkSoundCues,
    release: () => release?.(), unlock: (type = "pointerup", trusted = true) => {
      const event = new Event(type); Object.defineProperty(event, "isTrusted", { value: trusted }); window.dispatchEvent(event);
    },
    add(elapsed = 0) { jump(elapsed); audio.addShow(geometry, start, start + elapsed, 1729); },
    update(elapsed) { jump(elapsed); audio.update(start + elapsed); },
    visibility(hidden, elapsed) { jump(elapsed); document.hidden = hidden; document.dispatchEvent(new Event("visibilitychange")); },
    dispose() { audio.dispose(); geometry.dispose(); },
  };
}

test("only a bamboo gesture streams the long loop; hide, mute, return and leave preserve one quiet media element", async () => {
  const ordinary=harness(); ordinary.unlock(); await settle();
  assert.ok(ordinary.streams.every(stream => !stream.src.includes("crickets"))); ordinary.dispose();
  const h=harness({bamboo:true}); h.visibility(true,0); h.unlock(); h.visibility(false,0);
  assert.equal(h.streams.length,0);
  h.unlock("keydown"); h.unlock(); await settle();
  const media=h.streams[0];
  assert.equal(h.streams.length,1); assert.equal(h.contexts.length,1); assert.equal(h.requests.length,0);
  assert.equal(media.src,"https://cdn.sorow.co.kr/beach/fx/bamboo-field-crickets-v3.mp3");
  assert.ok(media.loop); assert.equal(media.crossOrigin,"anonymous"); assert.equal(media.gain.gain.value,.43);
  assert.equal(media.plays,1); media.currentTime=78;
  h.visibility(true,1000); assert.ok(media.paused);
  h.visibility(false,2000); await settle(); assert.equal(media.paused,false); assert.equal(media.currentTime,78);
  h.audio.setMuted(true); h.visibility(true,2500); h.visibility(false,3000); h.unlock();
  assert.ok(media.paused);
  h.audio.setMuted(false); await settle(); assert.equal(media.paused,false); assert.equal(h.streams.length,1);
  h.dispose(); h.unlock(); assert.ok(media.paused); assert.equal(media.src,""); assert.equal(media.disconnected,true);
});

test("a delayed stream cannot start after the user mutes or leaves bamboo",async()=>{
  for (const stop of ["mute","leave"]) {
    const h=harness({bamboo:true, delayedStream:true}); h.unlock();
    const media=h.streams[0]; assert.equal(media.plays,1);
    if(stop==="mute") h.audio.setMuted(true); else h.dispose();
    h.finishStream(); await settle(); assert.ok(media.paused);
    if(stop==="mute") h.dispose();
  }
});

test("bamboo levels adjust the existing stream and in-flight reports together, independently of other maps", async () => {
  const h = harness({bamboo:true, muted:true, savedVolume:"25"});
  assert.equal(h.audio.muted,false); assert.equal(h.audio.fieldVolume,25);
  h.unlock(); h.add(); h.update(50); await settle(); h.update(2000);
  assert.equal(h.streams[0].gain.gain.value,.215); assert.equal(h.played[0].gain.gain.value,.24);
  h.audio.setFieldVolume(80);
  assert.equal(h.streams[0].gain.gain.value,.43 * 1.6); assert.equal(h.played[0].gain.gain.value,.48 * 1.6);
  assert.equal(h.streams.length,1); assert.equal(h.streams[0].plays,1);
  h.audio.setFieldVolume(0); assert.ok(h.streams[0].paused); assert.equal(h.played[0].stops,1);
  assert.equal(h.storage.get('sorow:bamboo-field-volume'),'0'); assert.equal(h.storage.get('sorow:fireworks-muted'),'1');
  h.audio.setMuted(false); await settle(); assert.equal(h.audio.fieldVolume,80); assert.equal(h.streams[0].paused,false); h.dispose();
  const reentry=harness({bamboo:true,savedVolume:'0'}); reentry.unlock(); assert.equal(reentry.streams.length,0);
  reentry.audio.setFieldVolume(10); await settle(); assert.equal(reentry.streams[0].gain.gain.value,.43*.2); reentry.dispose();
  const ordinary=harness({savedVolume:'0'}); assert.equal(ordinary.audio.muted,false); ordinary.audio.setFieldVolume(0);
  assert.equal(ordinary.audio.muted,false); ordinary.dispose();
});

test("fallback element follows the latest slider level during pending loads, mute and hidden intervals", async () => {
  const h=harness({bamboo:true,noWebAudio:true,delayedStream:true,muted:true});
  assert.equal(h.audio.fieldVolume,0); h.unlock(); h.audio.setFieldVolume(30); h.audio.setFieldVolume(72);
  const stream=h.streams[0]; assert.equal(stream.volume,.43*1.44); assert.equal(stream.plays,1);
  h.audio.setFieldVolume(0); h.finishStream(); await settle(); assert.ok(stream.paused);
  h.visibility(true,100); h.audio.setFieldVolume(65); assert.ok(stream.paused);
  h.visibility(false,200); await settle(); assert.equal(stream.volume,.43*1.3); assert.equal(stream.paused,false); h.dispose();
});

function bambooTime(h, hour, frames = 360) {
  h.audio.setBambooNight(daylightContext.daylightAt(hour).deepNight);
  for (let i = 0; i < frames; i++) h.audio.updateBambooSound(1 / 60);
}

test("bamboo arrives on daylight wind or original night crickets without downloading the inactive loop", async () => {
  for (const hour of [6, 12, 18, 19, 20, 22, 2]) {
    const h = harness({ bamboo: true }); bambooTime(h, hour);
    assert.equal(h.streams.length, 0, "weather changes cannot unlock playback");
    h.unlock(); await settle();
    assert.equal(h.streams.length, 1);
    assert.ok(h.streams[0].src.endsWith(hour >= 20 || hour < 5 ? "bamboo-field-crickets-v3.mp3" : "bamboo-field-wind-day-v1.mp3"));
    assert.equal(h.streams[0].gain.gain.value, .43); assert.ok(h.streams[0].loop);
    h.dispose(); assert.ok(h.streams[0].paused && !h.streams[0].src);
  }
});

test("bamboo sunset, 20:00 night and dawn crossfade at constant total gain and reuse both loops", async () => {
  const h = harness({ bamboo: true }); bambooTime(h, 18); h.unlock(); await settle();
  const day = h.streams[0]; day.currentTime = 23;
  bambooTime(h, 19.75, 1); await settle(); const night = h.streams[1];
  assert.ok(day.gain.gain.value > .4 && night.gain.gain.value > 0);
  for (let i = 0; i < 360; i++) {
    h.audio.updateBambooSound(1 / 60);
    assert.ok(Math.abs(day.gain.gain.value + night.gain.gain.value - .43) < 1e-9);
  }
  assert.equal(day.gain.gain.value, .215); assert.equal(night.gain.gain.value, .215);
  bambooTime(h, 20); assert.ok(day.paused && !night.paused); assert.equal(night.gain.gain.value, .43);
  bambooTime(h, 5); await settle(); assert.equal(day.gain.gain.value, .215);
  bambooTime(h, 6); assert.ok(!day.paused && night.paused);
  assert.equal(day.currentTime, 23); assert.equal(day.plays, 2); assert.equal(h.streams.length, 2);
  h.dispose(); assert.ok(h.streams.every(s => s.disconnected));
});

test("bamboo day/night transitions respect slider mute, visibility, scene pause and pending playback", async () => {
  const h = harness({ bamboo: true, delayedStream: true, savedVolume: "70" });
  bambooTime(h, 12); h.unlock(); const day = h.streams[0];
  h.audio.setFieldVolume(0); bambooTime(h, 22); h.finishStream(); await settle();
  assert.ok(day.paused); assert.equal(h.streams.length, 1, "muted night transition does not fetch crickets");
  h.visibility(true, 0); h.audio.setFieldVolume(70); assert.equal(h.streams.length, 1);
  h.visibility(false, 1); await settle(); const night = h.streams[1];
  assert.ok(!night.paused && day.paused); assert.equal(night.gain.gain.value, .43 * 1.4);
  h.audio.setSceneRunning(false); bambooTime(h, 12); assert.ok(h.streams.every(s => s.paused));
  h.audio.setSceneRunning(true); await settle(); assert.ok(!day.paused && night.paused);
  h.audio.setFieldVolume(0); h.dispose(); assert.ok(h.streams.every(s => s.paused && !s.src));
  const saved = harness({ bamboo: true, savedVolume: "0" }); bambooTime(saved, 12); saved.unlock(); assert.equal(saved.streams.length, 0); saved.dispose();
});

test("bamboo day/night levels also crossfade with element-volume fallback and ignore invalid updates", async () => {
  const h = harness({ bamboo: true, noWebAudio: true }); bambooTime(h, 12); h.unlock(); await settle();
  bambooTime(h, 22, 1); await settle();
  assert.equal(h.contexts.length, 0); assert.equal(h.streams.length, 2);
  assert.ok(Math.abs(h.streams.reduce((sum, s) => sum + s.volume, 0) - .43) < 1e-9);
  const levels = h.streams.map(s => s.volume);
  h.audio.setBambooNight(NaN); h.audio.updateBambooSound(NaN); h.audio.updateBambooSound(-1);
  assert.deepEqual(h.streams.map(s => s.volume), levels);
  h.audio.setFieldVolume(30); assert.ok(Math.abs(h.streams.reduce((sum, s) => sum + s.volume, 0) - .43 * .6) < 1e-9);
  h.dispose();
});

const fireSite = { x: 0, z: 12 };
function gardenWeather(h, inside, rain = 1, frames = 240) {
  for (let i = 0; i < frames; i++) h.audio.updateGardenSound(inside, rain, 1 / 60);
}

test("garden rain waits for wet weather and crossfades the two recordings without restarting loops", async () => {
  const h = harness({ map: "garden" }); h.unlock(); await settle();
  gardenWeather(h, false, 0); assert.equal(h.streams.length, 0, "dry weather downloads neither recording");
  gardenWeather(h, false); await settle(); const outdoor = h.streams[0];
  assert.ok(outdoor.src.endsWith("garden-rain-outdoor-v1.mp3"));
  assert.equal(outdoor.gain.gain.value, .43); assert.ok(outdoor.loop);
  outdoor.currentTime = 24;
  gardenWeather(h, true, 1, 1); await settle(); const indoor = h.streams[1];
  assert.ok(indoor.src.endsWith("garden-rain-indoor-v1.mp3"));
  assert.ok(outdoor.gain.gain.value < .43 && outdoor.gain.gain.value > .4);
  assert.ok(indoor.gain.gain.value > 0 && indoor.gain.gain.value < .03);
  assert.ok(Math.abs(outdoor.gain.gain.value + indoor.gain.gain.value - .43) < 1e-6, "doorway transition does not double the volume");
  gardenWeather(h, true); assert.ok(outdoor.paused && !indoor.paused);
  assert.equal(indoor.gain.gain.value, .43);
  gardenWeather(h, false); await settle(); assert.ok(!outdoor.paused && indoor.paused);
  assert.equal(outdoor.currentTime, 24); assert.equal(outdoor.plays, 2); assert.equal(h.streams.length, 2);
  gardenWeather(h, false, .25); assert.equal(outdoor.gain.gain.value, .43 * .25);
  gardenWeather(h, false, 0); assert.ok(h.streams.every(s => s.paused && s.gain.gain.value === 0));
  h.dispose(); assert.ok(h.streams.every(s => !s.src && s.disconnected));
});

test("an indoor garden arrival plays only window rain and persists its own field slider including mute", async () => {
  const h = harness({ map: "garden", savedVolume: "35" });
  gardenWeather(h, true); assert.equal(h.streams.length, 0);
  h.unlock(); await settle(); const indoor = h.streams[0];
  assert.equal(h.streams.length, 1); assert.ok(indoor.src.endsWith("garden-rain-indoor-v1.mp3"));
  assert.equal(indoor.gain.gain.value, .43 * .7);
  h.audio.setFieldVolume(80); assert.equal(indoor.gain.gain.value, .43 * 1.6);
  assert.equal(h.storage.get("sorow:garden-field-volume"), "80");
  assert.equal(h.storage.has("sorow:bamboo-field-volume"), false);
  h.audio.setFieldVolume(0); assert.ok(h.audio.muted && indoor.paused);
  gardenWeather(h, false); assert.equal(h.streams.length, 1, "muted boundary crossings do not start media");
  h.audio.setMuted(false); await settle(); assert.equal(h.audio.fieldVolume, 80);
  const outdoor = h.streams[1]; assert.ok(outdoor.src.endsWith("garden-rain-outdoor-v1.mp3") && !outdoor.paused && indoor.paused);
  h.dispose();
  const muted = harness({ map: "garden", savedVolume: "0" }); gardenWeather(muted, true); muted.unlock();
  assert.ok(muted.audio.muted); assert.equal(muted.streams.length, 0); muted.dispose();
});

test("garden rain obeys hidden/stopped scenes and delayed play cannot escape mute, dry weather or disposal", async () => {
  for (const stop of ["mute", "hidden", "scene", "dry", "dispose"]) {
    const h = harness({ map: "garden", delayedStream: true, noWebAudio: true });
    gardenWeather(h, false); h.unlock(); gardenWeather(h, true, 1, 1);
    assert.equal(h.streams.length, 2);
    if (stop === "mute") h.audio.setFieldVolume(0);
    if (stop === "hidden") h.visibility(true, 0);
    if (stop === "scene") h.audio.setSceneRunning(false);
    if (stop === "dry") gardenWeather(h, true, 0);
    if (stop === "dispose") h.dispose();
    h.finishStream(); await settle();
    assert.ok(h.streams.every(s => s.paused), stop + " prevents pending playback");
    if (stop === "hidden" || stop === "scene") {
      gardenWeather(h, true);
      if (stop === "hidden") h.visibility(false, 100); else h.audio.setSceneRunning(true);
      await settle(); assert.ok(h.streams[0].paused && !h.streams[1].paused, "only the current indoor track resumes");
    }
    if (stop !== "dispose") h.dispose();
  }
});

function standAt(h, x, z, logs, frames = 200) {
  for (let i = 0; i < frames; i++) h.audio.updateBeachSound({ x, z }, fireSite, logs, 1 / 60);
}

test("surf remains audible around the entire beach, attenuates smoothly inland and reuses one stream", async () => {
  const h = harness({ map: "beach" });
  standAt(h, 0, 45, 0); assert.equal(h.streams.length, 0, "a new visit still requires a gesture");
  h.unlock(); await settle();
  const waves = h.streams[0]; assert.ok(waves.src.endsWith("/beach-shore-waves-v1.mp3"));
  const inland = waves.gain.gain.value; assert.ok(inland > .09 && inland < .12);
  standAt(h, 0, 25, 0); const hut = waves.gain.gain.value;
  standAt(h, 0, 12, 0); const fire = waves.gain.gain.value;
  assert.ok(fire > hut * 1.4 && hut > inland * 1.4, 'the fade continues from the campfire past the huts to the spring');
  standAt(h, 7, 7, 0, 1); assert.ok(waves.gain.gain.value > fire && waves.gain.gain.value < .4);
  standAt(h, 7, 7, 0); const mats = waves.gain.gain.value; assert.ok(mats > inland && mats < .43);
  standAt(h, -12, -.7, 0); assert.equal(waves.gain.gain.value, .43);
  standAt(h, 0, 54.6, 0); assert.ok(waves.gain.gain.value > 0 && waves.gain.gain.value < mats);
  assert.equal(waves.plays, 1); assert.equal(h.streams.length, 1); assert.equal(waves.paused, false);
  h.dispose(); assert.equal(waves.src, "");
});

test("fire needs confirmed logs and proximity; one log reaches the benches while waves keep their own gain", async () => {
  const h = harness({ map: "beach" }); h.unlock(); await settle();
  standAt(h, 0, 12, 0); standAt(h, 0, 12, NaN); standAt(h, 19, 12, 6);
  assert.equal(h.streams.length, 1);
  standAt(h, 4, 12, 1, 1); await settle(); const [waves, fire] = h.streams;
  assert.ok(fire.src.endsWith("/beach-campfire-crackle-v1.mp3")); assert.ok(fire.gain.gain.value > 0 && fire.gain.gain.value < .03);
  standAt(h, 4, 12, 1); const oneLog = fire.gain.gain.value; assert.ok(oneLog > .17);
  const waveAtFire = waves.gain.gain.value;
  standAt(h, 4, 12, 6); const full = fire.gain.gain.value; assert.ok(full > oneLog); assert.equal(waves.gain.gain.value, waveAtFire);
  h.audio.setFieldVolume(80); assert.ok(Math.abs(fire.gain.gain.value - full * 1.6) < 1e-6);
  assert.ok(Math.abs(waves.gain.gain.value - waveAtFire * 1.6) < 1e-6);
  assert.equal(h.storage.get("sorow:beach-field-volume"), "80"); assert.equal(h.storage.has("sorow:bamboo-field-volume"), false);
  standAt(h, 18, 12, 6, 1); assert.ok(!fire.paused && fire.gain.gain.value < full * 1.6);
  standAt(h, 18, 12, 6); assert.ok(fire.paused && !waves.paused);
  standAt(h, 1, 12, 1); await settle(); assert.equal(fire.plays, 2);
  standAt(h, 1, 12, 0, 1); assert.ok(fire.paused && !waves.paused); assert.equal(fire.gain.gain.value, 0);
  assert.equal(h.streams.length, 2); h.dispose(); assert.equal(fire.src, "");
});

test("pending beach media obey empty fuel, mute, hiding and leaving; other maps never start fire audio", async () => {
  const h = harness({ map: "beach", delayedStream: true }); h.unlock();
  standAt(h, 0, 12, 1); const [waves, fire] = h.streams;
  standAt(h, 0, 12, 0, 1); h.finishStream(); await settle(); assert.ok(fire.paused && !waves.paused);
  standAt(h, 0, 12, 1); await settle(); h.visibility(true, 500); assert.ok(waves.paused && fire.paused);
  h.visibility(false, 550); await settle(); assert.ok(!waves.paused && !fire.paused);
  h.audio.setFieldVolume(0); assert.ok(waves.paused && fire.paused);
  h.audio.setFieldVolume(40); await settle(); assert.ok(!waves.paused && !fire.paused);
  h.audio.setSceneRunning(false); assert.ok(waves.paused && fire.paused);
  h.audio.setSceneRunning(true); standAt(h, 0, 40, 0); await settle(); assert.ok(!waves.paused && fire.paused);
  h.dispose(); assert.ok(waves.paused && fire.paused && !waves.src && !fire.src);
  for (const map of ["bamboo", "uyuni"]) {
    const other = harness({ map }); other.unlock(); standAt(other, 0, 12, 9); await settle();
    assert.ok(other.streams.every(s => !s.src.includes("campfire") && !s.src.includes("shore-waves"))); other.dispose();
  }
});

test("only a trusted Uyuni visit plays background music, even if fireworks are muted; its volume persists independently", async () => {
  const h = harness({ map: "uyuni", muted: true });
  assert.equal(h.audio.uyuniMusicVolume, 25);
  h.unlock("pointerup", false); h.audio.setRoomMusicPlaying(false); h.audio.setUyuniMusicVolume(25);
  assert.equal(h.streams.length, 0); assert.equal(h.contexts.length, 0);
  h.unlock(); await settle();
  const stream = h.streams[0];
  assert.ok(stream.src.endsWith("/beach/fx/uyuni-calm-night-v1.mp3")); assert.equal(stream.gain.gain.value,.25);
  h.audio.setMuted(false); h.audio.setMuted(true); await settle();
  assert.equal(stream.plays, 1); assert.ok(!stream.paused);
  h.audio.setUyuniMusicVolume(0); assert.ok(stream.paused); assert.equal(h.storage.get('sorow:uyuni-background-volume'), '0');
  assert.equal(h.storage.get('sorow:fireworks-muted'),'1'); assert.equal(h.storage.has('sorow:uyuni-field-volume'),false);
  h.dispose(); assert.equal(stream.src,'');
  const restored = harness({ map:'uyuni', savedMusicVolume:'0', noWebAudio:true }); restored.unlock(); assert.equal(restored.streams.length,0);
  restored.audio.setUyuniMusicVolume(64); await settle(); assert.equal(restored.streams[0].volume,.64); restored.dispose();
  for (const map of ['bamboo','beach']) {
    const other = harness({map}); other.unlock(); await settle(); const field=other.streams[0];
    other.audio.setUyuniMusicVolume(0); other.audio.setRoomMusicPlaying(true); other.audio.setRoomMusicPlaying(false);
    assert.equal(other.streams.length,1); assert.ok(!field.src.includes('uyuni-calm-night') && !field.paused); other.dispose();
  }
});

test("room music preempts Uyuni before loading, during a pending play and through tab/scene suspension", async () => {
  const h=harness({map:'uyuni',delayedStream:true});
  h.audio.setRoomMusicPlaying(true); h.unlock(); assert.equal(h.streams.length,0,'no download underneath an existing room broadcast');
  h.audio.setRoomMusicPlaying(false); const stream=h.streams[0];
  h.audio.setRoomMusicPlaying(true); h.finishStream(); await settle(); assert.ok(stream.paused,'late play completion cannot overlap the broadcast');
  stream.currentTime=63; h.visibility(true,0); h.audio.setRoomMusicPlaying(false); assert.ok(stream.paused);
  h.visibility(false,100); await settle(); assert.equal(stream.paused,false); assert.equal(stream.currentTime,63);
  h.audio.setRoomMusicPlaying(true); h.audio.setSceneRunning(false); h.audio.setUyuniMusicVolume(70); h.audio.setRoomMusicPlaying(false);
  assert.ok(stream.paused); h.audio.setSceneRunning(true); await settle(); assert.equal(stream.gain.gain.value,.70); assert.ok(!stream.paused);
  h.audio.setRoomMusicPlaying(true); h.audio.setUyuniMusicVolume(0); h.audio.setRoomMusicPlaying(false); h.unlock();
  assert.ok(stream.paused); assert.equal(h.streams.length,1); h.dispose(); assert.equal(stream.src,'');
});

test("bamboo audio stays silent while the scene loads or is stopped and resumes only a previously unlocked visit",async()=>{
  const h=harness({bamboo:true,running:false}); h.unlock(); await settle();
  assert.equal(h.streams.length,0); h.audio.setSceneRunning(true); await settle();
  const media=h.streams[0]; assert.equal(media.paused,false);
  h.audio.setSceneRunning(false); h.visibility(true,0); h.visibility(false,1000); h.unlock(); await settle();
  assert.ok(media.paused); h.audio.setSceneRunning(true); await settle(); assert.equal(media.paused,false); h.dispose();
  const silent=harness({bamboo:true,running:false}); silent.audio.setSceneRunning(true);
  assert.equal(silent.streams.length,0); silent.dispose();
});

test("each real display variant ties distant sound to its primary visual bursts and groups simultaneous shells", () => {
  const h = harness(), eye = { x: 12, y: 2, z: 9 };
  const displays = ["festival", "bloom", "saturn", "willow", "stardust", "songi", "love", "offbeat", "aurora", "jewels"];
  for (const [variant, grand] of [...displays.map(v => [v, true]), ["festival", false]]) {
    const geometry = makeGeometry(1729, true, variant, grand);
    const { timing, detail, position } = geometry.attributes;
    const arrivals = [];
    for (let i = 0; i < timing.count; i++) {
      if (timing.getW(i) !== 3 || detail.getX(i) < 3) continue;
      const distance = new THREE.Vector3().fromBufferAttribute(position, i).distanceTo(new THREE.Vector3(eye.x, eye.y, eye.z));
      arrivals.push(start + (timing.getX(i) + timing.getY(i)) * 1000 + Math.min(1200, distance / 343 * 1000));
    }
    const reports = h.cues(geometry, eye, start, 1729);
    assert.ok(reports.length > 0, variant);
    arrivals.sort((a, b) => a - b);
    const expected = [];
    for (const at of arrivals) {
      if (!expected.length || at - expected.at(-1) >= 750) expected.push(at);
    }
    assert.equal(reports.length, expected.length, `${variant}: exactly one report per burst group`);
    for (const [index, report] of reports.entries()) {
      assert.ok(Math.abs(report.at - expected[index]) < .001);
      assert.ok(report.rate >= .9 && report.rate <= 1.1);
    }
    geometry.dispose();
  }
  h.dispose();
});

test("songi's encore waves each produce one quiet delayed report, without replay on later frames", async () => {
  for(const grand of [true,false]) {
    const h=harness(), geometry=makeGeometry(1729,true,"songi",grand);
    const cues=h.cues(geometry,listener,start,1729);
    assert.equal(cues.length,5,"greeting, two spherical waves, added roses and puppy finale each have one distant report");
    assert.ok(cues[1].at>start+4300&&cues.at(-1).at<start+16000);
    h.unlock();h.audio.addShow(geometry,start,start,1729);h.update(0);await settle();
    for(const [index,cue] of cues.entries()) {
      if(index) {
        assert.ok(cue.at-cues[index-1].at>2500,"the 2.28-second recording finishes before the next group");
        h.played.at(-1)?.onended();
      }
      h.update(cue.at-start+1);h.update(cue.at-start+1);h.update(cue.at-start+80);
      assert.equal(h.played.length,index+1,"a burst is consumed once despite repeated frames");
      assert.equal(h.played.at(-1).gain.gain.value,.48,"the continuation preserves the existing distant gain");
    }
    h.update(18000);assert.equal(h.played.length,5);
    geometry.dispose();h.dispose();
  }
});

test("legacy songi audio stops at its twelve-second window while the extended show retains its final report",async()=>{
  for(const durationMs of [12000,18000]) {
    const h=harness(),geometry=makeGeometry(1729,true,"songi",true);
    const cues=h.cues(geometry,listener,start,1729);
    h.unlock();h.audio.addShow(geometry,start,start,1729,durationMs);h.update(0);await settle();
    for(const cue of cues) { h.played.at(-1)?.onended();h.update(cue.at-start+1); }
    assert.equal(h.played.length,durationMs===12000?4:5,"a legacy event cannot leave a ghost finale boom after cleanup");
    h.update(19000);assert.equal(h.played.length,durationMs===12000?4:5);geometry.dispose();h.dispose();
  }
});

test("a spectator gesture loads only the boom and the time after its arrival stays quiet", async () => {
  for (const gesture of ["pointerup", "keydown"]) {
    const h = harness();
    h.add(); h.update(100);
    assert.equal(h.contexts.length, 0); assert.equal(h.requests.length, 0);
    h.unlock(gesture); h.unlock(gesture); h.update(150); h.update(200); await settle();
    assert.equal(h.contexts.length, 1);
    assert.deepEqual(h.requests.map(r => r.url), ["https://cdn.sorow.co.kr/beach/fx/firework-boom-v1.mp3"]);
    assert.ok(h.requests.every(r => r.options.credentials === "omit" && r.options.mode === "cors"));
    h.update(1999); assert.equal(h.played.length, 0);
    h.update(2000); h.update(2000); h.update(2410);
    assert.deepEqual(h.played.map(s => s.buffer.sample), ["boom"]);
    h.dispose();
  }
});

test("late joining, blocked playback and stalled frames never catch up by replaying old cues", async () => {
  const late = harness(); late.unlock(); late.add(2500); late.update(2500); await settle();
  assert.equal(late.played.length, 0);
  late.update(4000); assert.deepEqual(late.played.map(s => s.buffer.sample), ["boom"]);
  late.dispose();
  const locked = harness(); locked.add(); locked.update(2410); locked.unlock(); locked.update(2500); await settle();
  locked.update(3000); assert.equal(locked.played.length, 0);
  locked.update(4250); assert.equal(locked.played.length, 0, "a report that missed its time by 250 ms is skipped");
  locked.update(4410); assert.equal(locked.played.length, 0); locked.dispose();
});

test("three overlapping shows cap simultaneous booms at two at the original quiet level", async () => {
  const h = harness(); h.unlock();
  for (let n = 0; n < 3; n++) h.add();
  h.update(100); await settle(); h.update(2000); h.update(2410);
  assert.deepEqual(h.played.map(s => s.buffer.sample), ["boom", "boom"]);
  assert.ok(h.played.every(s => s.gain.gain.value === .48));
  h.played.forEach(s => s.onended()); h.update(4000);
  assert.equal(h.played.length, 4, "ended sources release their slots for the next wave");
  h.dispose();
});

test("hiding or muting stops active voices, retains the preference and resumes only future cues", async () => {
  const h = harness({ muted: true }); h.unlock(); h.add(); h.update(100); assert.equal(h.requests.length, 0);
  h.audio.setMuted(false); h.update(150); await settle(); h.update(2000);
  assert.equal(h.played.length, 1);
  h.visibility(true, 2050); assert.equal(h.played[0].stops, 1);
  h.visibility(false, 2600); h.update(2600); assert.equal(h.played.length, 1);
  h.update(4000); h.audio.setMuted(true);
  assert.equal(h.played[1].stops, 1); assert.equal(h.storage.get("sorow:fireworks-muted"), "1");
  h.update(4500); h.audio.setMuted(false); h.update(4501);
  assert.equal(h.played.length, 2); h.dispose();
});

test("closing a room aborts the pending fetch and late completion cannot start a sound", async () => {
  const h = harness({ slowDownload: true }); h.unlock(); h.add(); h.update(0);
  assert.equal(h.requests.length, 1);
  h.audio.dispose(); h.audio.dispose(); h.release(); await settle();
  h.unlock(); h.update(2000); h.add(3000); h.update(4000);
  assert.ok(h.requests.every(r => r.options.signal.aborted)); assert.equal(h.contexts[0].closes, 1);
  assert.equal(h.contexts.length, 1); assert.equal(h.played.length, 0); h.geometry.dispose();
});
