import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/remote-motion.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=class\b)/g, "");
const context = {};
vm.runInNewContext(`${source}\nglobalThis.api = { RemoteMotionBuffer, RemoteSnapshotClock };`, context);
const { RemoteMotionBuffer, RemoteSnapshotClock } = context.api;
const state = (x = 0, yaw = 0, moving = true) => ({ x, z: 0, yaw, moving });
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);

test("buffered walking has constant distance per frame between irregular authoritative samples", () => {
  const motion = new RemoteMotionBuffer(), out = state();
  for (const at of [0, 250, 600, 850, 1200, 1550]) motion.push(state(at * 0.0035), at, at + 70);
  let previous = motion.write(100, 500, out).x;
  for (let at = 116; at <= 1500; at += 16) {
    motion.write(at, at + 400, out);
    close(out.x - previous, 0.056); assert.equal(out.moving, true); previous = out.x;
  }
});

test("shortest-angle turns cross pi without spinning and stops reach the authoritative endpoint", () => {
  const motion = new RemoteMotionBuffer(), out = state();
  motion.push(state(0, Math.PI - 0.1), 0, 10);
  motion.push(state(1, -Math.PI + 0.1, false), 400, 410);
  motion.write(200, 600, out); close(Math.abs(out.yaw), Math.PI); close(out.x, 0.5);
  motion.write(500, 900, out); close(out.x, 1); assert.equal(out.moving, false);
});

test("packet loss extrapolates less than 51cm then stops, and a late correction stays continuous", () => {
  const motion = new RemoteMotionBuffer(), out = state();
  motion.push(state(0), 0, 0); motion.push(state(1.4), 250, 250);
  motion.write(430, 600, out); close(out.x, 1.904); assert.equal(out.moving, false);
  motion.write(50_000, 60_000, out); close(out.x, 1.904);
  motion.write(390, 600, out); const before = out.x;
  motion.push(state(1.6), 500, 600); motion.write(390, 600, out);
  close(out.x, before);
  motion.write(800, 1100, out); assert.ok(out.x >= 1.6 && out.x < 1.8);
});

test("teleports and rest changes snap without crossing furniture, stale and duplicate samples do not rewind", () => {
  const motion = new RemoteMotionBuffer(), out = state();
  assert.equal(motion.push(state(0), 0, 0), "snap");
  assert.equal(motion.push(state(1), 350, 350), "buffered");
  assert.equal(motion.push(state(99), 300, 400), "ignored");
  assert.equal(motion.push(state(99), 350, 400), "ignored");
  assert.equal(motion.push(state(40), 700, 700), "snap");
  motion.write(450, 700, out); close(out.x, 40);
  assert.equal(motion.push(state(41, 1, false), 800, 800, "sitting:fire-benches:1"), "snap");
  motion.write(500, 800, out); close(out.x, 41); assert.equal(out.moving, false);
  assert.equal(motion.push(state(42, 1, false), 900, 900), "snap");
  motion.write(550, 900, out); close(out.x, 42);
  assert.equal(motion.push(state(NaN), 1000, 1000), "ignored");
});

test("room clock handles server epoch, network jitter and cadence changes without playing backwards", () => {
  const clock = new RemoteSnapshotClock(), epoch = 1_800_000_000_000;
  const first = clock.accept({ serverTime: epoch, sentAt: 0, receivedAt: 100 }, 100);
  close(first.sampleTime, 50);
  assert.equal(clock.accept({ serverTime: epoch, receivedAt: 200 }, 200), null);
  assert.equal(clock.accept({ serverTime: epoch - 1, receivedAt: 210 }, 210), null);
  let previous = clock.frameTime(100), server = epoch;
  for (let i = 1; i < 40; i++) {
    const interval = i < 20 ? 350 : 1000;
    server += interval;
    const receivedAt = server - epoch + 100 + (i % 3) * 35;
    clock.accept({ serverTime: server, sentAt: receivedAt - 120, receivedAt }, receivedAt);
    for (let t = receivedAt; t < receivedAt + interval; t += 16) {
      const current = clock.frameTime(t); assert.ok(current >= previous); previous = current;
    }
  }
  assert.ok(clock.delay >= 120 && clock.delay <= 1100);
});

test("100 identities retain independent bounded histories, and resume drops stale playback without moving the shown actor", () => {
  const crowd = Array.from({ length: 100 }, () => new RemoteMotionBuffer());
  for (let tick = 0; tick < 100; tick++) crowd.forEach((motion, id) => motion.push(state(id + tick * 0.2), tick * 250, tick * 250 + 60));
  crowd.forEach((motion, id) => {
    const out = state(); motion.write(24_625, 25_000, out); close(out.x, id + 19.7);
    assert.equal(motion.samples.length, 8);
    const shown = out.x; motion.reset(); motion.write(80_000, 80_000, out);
    close(out.x, shown); assert.equal(out.moving, false); assert.equal(motion.samples.length, 0);
    assert.equal(motion.push(state(id + 40), 80_000, 80_000), "snap");
    motion.write(79_000, 80_000, out); close(out.x, id + 40);
  });
});

test("250ms sender updates and jittery 350ms observation reduce the old stop-start speed variation", t => {
  const motion = new RemoteMotionBuffer(), clock = new RemoteSnapshotClock(), out = state(0), epoch = 1_800_000_000_000;
  const packets = Array.from({ length: 70 }, (_, i) => {
    const at = i * 350, sourceAt = Math.floor(at / 250) * 250;
    return { at, sourceAt, receive: at + [25, 70, 120, 45, 90][i % 5] };
  });
  let next = 0, lastSource = -1, target = 0, old = 0, previousNew = 0, previousOld = 0, errorNew = 0, errorOld = 0, frames = 0;
  for (let now = 0; now < 23_000; now += 1000 / 60) {
    while (packets[next]?.receive <= now) {
      const packet = packets[next++]; target = packet.sourceAt * 0.0035;
      const stamp = clock.accept({ serverTime: epoch + packet.at, sentAt: packet.at - 20, receivedAt: packet.receive }, now);
      if (packet.sourceAt !== lastSource) motion.push(state(target), epoch + packet.sourceAt + stamp.serverOffset, packet.receive);
      lastSource = packet.sourceAt;
    }
    motion.write(clock.frameTime(now), now, out);
    old += (target - old) * (7 / 60);
    if (now > 3000) {
      errorNew += Math.abs((out.x - previousNew) * 60 - 3.5);
      errorOld += Math.abs((old - previousOld) * 60 - 3.5);
      frames++;
    }
    previousNew = out.x; previousOld = old;
  }
  t.diagnostic(`mean speed deviation: buffered ${(errorNew / frames).toFixed(3)}m/s; previous ${(errorOld / frames).toFixed(3)}m/s`);
  assert.ok(errorNew < errorOld * 0.5, "packet-arrival jitter should not remain visible as repeated acceleration and braking");
});
