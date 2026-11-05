export interface SnapshotTiming { serverTime?: number; sentAt?: number; receivedAt?: number }
export interface MotionState { x: number; z: number; yaw: number; moving: boolean }
interface Sample extends MotionState { at: number }
export interface MotionStamp { receivedAt: number; sampleTime: number; serverOffset: number | null }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const copy = (out: MotionState, source: MotionState) => {
  out.x = source.x; out.z = source.z; out.yaw = source.yaw; out.moving = source.moving;
};

/** One room clock, independent of the number of visible characters or the render frame rate. */
export class RemoteSnapshotClock {
  private offset: number | null = null;
  private lastServer: number | null = null;
  private lastReceive: number | null = null;
  private lastSample: number | null = null;
  private interval = 300;
  private jitter = 0;
  private intervals = 0;
  private delay = 330;
  private cursor: number | null = null;
  private lastFrame: number | null = null;

  resetPlayback() { this.cursor = this.lastFrame = null; }

  accept(timing: SnapshotTiming | undefined, now: number): MotionStamp | null {
    const receivedAt = finite(timing?.receivedAt) && timing.receivedAt >= 0 ? timing.receivedAt : now;
    const serverTime = finite(timing?.serverTime) && timing.serverTime >= 0 ? timing.serverTime : null;
    if (serverTime !== null && this.lastServer !== null && serverTime <= this.lastServer) return null;
    const roundTrip = finite(timing?.sentAt) && timing.sentAt >= 0 && timing.sentAt <= receivedAt
      ? Math.min(10_000, receivedAt - timing.sentAt) : 0;
    if (serverTime !== null) {
      const estimate = receivedAt - roundTrip / 2 - serverTime;
      if (this.offset === null || Math.abs(estimate - this.offset) > 5000) this.offset = estimate;
      else this.offset += clamp(estimate - this.offset, -40, 40) * 0.1;
    }
    const sampleTime = serverTime !== null ? serverTime + this.offset! : receivedAt;
    if (this.lastReceive !== null && this.lastSample !== null) {
      const interval = sampleTime - this.lastSample;
      if (interval >= 40 && interval <= 2000) {
        this.interval += (interval - this.interval) * (this.intervals++ ? 0.2 : 1);
        this.jitter += (Math.abs(receivedAt - this.lastReceive - interval) - this.jitter) * 0.2;
        this.delay = clamp(this.interval * 1.1 + this.jitter * 1.5, 120, 1100);
      }
    }
    this.lastReceive = receivedAt; this.lastSample = sampleTime;
    if (serverTime !== null) this.lastServer = serverTime;
    return { receivedAt, sampleTime, serverOffset: serverTime === null ? null : this.offset };
  }

  frameTime(now: number): number {
    const desired = now - this.delay;
    if (this.cursor === null || this.lastFrame === null || now - this.lastFrame > 2000) this.cursor = desired;
    else {
      const elapsed = Math.max(0, now - this.lastFrame);
      const predicted = this.cursor + elapsed;
      // A changing packet cadence gently changes playback speed; it can never rewind a walker.
      this.cursor = predicted + clamp(desired - predicted, -elapsed * 0.08, elapsed * 0.18);
    }
    this.lastFrame = now;
    return this.cursor;
  }
}

/** Eight authoritative samples, linear motion between them, and at most 180ms of decelerating prediction. */
export class RemoteMotionBuffer {
  private samples: Sample[] = [];
  private pose = "";
  private renderedAt: number | null = null;
  private rendered = { x: 0, z: 0, yaw: 0, moving: false };
  private scratch = { x: 0, z: 0, yaw: 0, moving: false };
  private extrapolating = false;
  private correction = { x: 0, z: 0, yaw: 0, at: 0 };

  reset() {
    this.samples.length = 0; this.pose = ""; this.renderedAt = null; this.extrapolating = false;
    this.correction.x = this.correction.z = this.correction.yaw = 0;
  }

  push(state: MotionState, at: number, receivedAt: number, pose = "standing"): "snap" | "buffered" | "ignored" {
    if (![state.x, state.z, state.yaw, at, receivedAt].every(Number.isFinite)) return "ignored";
    const last = this.samples.at(-1);
    if (last && at < last.at) return "ignored";
    if (last && at === last.at && pose === this.pose) return "ignored";
    const distance = last ? Math.hypot(state.x - last.x, state.z - last.z) : 0;
    const gap = last ? at - last.at : 0;
    const snap = !last || pose !== this.pose || gap > 2500 || distance > Math.max(7, gap / 1000 * 7 + 1);
    const sample = { x: state.x, z: state.z, yaw: angle(state.yaw), moving: state.moving === true, at };
    if (snap) {
      this.samples.length = 0; this.samples.push(sample); this.pose = pose;
      this.correction.x = this.correction.z = this.correction.yaw = 0;
      copy(this.rendered, sample); this.renderedAt = null; this.extrapolating = false;
      return "snap";
    }
    this.samples.push(sample);
    if (this.samples.length > 8) this.samples.shift();
    if (this.extrapolating && this.renderedAt !== null) {
      this.raw(this.renderedAt, this.scratch);
      const dx = this.rendered.x - this.scratch.x, dz = this.rendered.z - this.scratch.z;
      if (Math.hypot(dx, dz) < 1.5) {
        this.correction = { x: dx, z: dz, yaw: angle(this.rendered.yaw - this.scratch.yaw), at: receivedAt };
      }
    }
    return "buffered";
  }

  private raw(at: number, out: MotionState) {
    const first = this.samples[0], last = this.samples.at(-1);
    if (!first || !last) { out.moving = false; return; }
    if (at <= first.at) { copy(out, first); return; }
    for (let i = 1; i < this.samples.length; i++) {
      const b = this.samples[i], a = this.samples[i - 1];
      if (at > b.at) continue;
      const t = clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1);
      out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
      out.yaw = angle(a.yaw + angle(b.yaw - a.yaw) * t);
      out.moving = Math.hypot(b.x - a.x, b.z - a.z) > 0.015 || (t < 0.5 ? a.moving : b.moving);
      return;
    }
    copy(out, last);
    const previous = this.samples.at(-2), age = Math.max(0, at - last.at);
    if (last.moving && previous && last.at - previous.at >= 40 && last.at - previous.at <= 1500) {
      const interval = (last.at - previous.at) / 1000;
      const dx = last.x - previous.x, dz = last.z - previous.z;
      const speed = Math.hypot(dx, dz) / interval, bounded = Math.min(1, 5.6 / Math.max(speed, 0.001));
      const elapsed = Math.min(age, 180) / 1000;
      const travelTime = elapsed - elapsed * elapsed / 0.36;
      out.x += dx / interval * bounded * travelTime;
      out.z += dz / interval * bounded * travelTime;
    }
    // A missing sender cannot walk forever just because its last flag was moving.
    out.moving = last.moving && age < 180;
  }

  write(renderAt: number, now: number, out: MotionState): MotionState {
    this.raw(renderAt, out);
    const age = Math.max(0, now - this.correction.at);
    const weight = age < 400 ? Math.exp(-age / 80) * (1 - age / 400) : 0;
    out.x += this.correction.x * weight; out.z += this.correction.z * weight;
    out.yaw = angle(out.yaw + this.correction.yaw * weight);
    this.renderedAt = renderAt;
    copy(this.rendered, out);
    this.extrapolating = Boolean(this.samples.length && renderAt > this.samples[this.samples.length - 1].at);
    return out;
  }
}
