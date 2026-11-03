import type { FireState, PowderColor } from "./net";

export interface PowderSample { color: PowderColor | null; weight: number; hue: number }
const COLORS = new Set(["rose", "aurora", "ocean", "violet", "rainbow"]);
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Maps server timestamps onto a local monotonic clock; render loops may pause without extending a powder. */
export class FirePowderPlayback {
  private initialized = false;
  private serverTime = -Infinity;
  private receivedAt = 0;
  private powder: NonNullable<FireState["powder"]> | null = null;
  private seen = new Set<string>();

  sync(state: Pick<FireState, "serverTime" | "powder" | "powderEnabled">, now: number): { accepted: boolean; burst: PowderColor | null } {
    if (!Number.isFinite(state.serverTime) || state.serverTime < this.serverTime) return { accepted: false, burst: null };
    const first = !this.initialized;
    this.initialized = true;
    if (first || state.serverTime > this.serverTime) {
      this.serverTime = state.serverTime;
      this.receivedAt = now;
    }
    const candidate = state.powderEnabled === false ? null : state.powder;
    const valid = candidate && typeof candidate.id === "string" && candidate.id.length > 0 && COLORS.has(candidate.color)
      && Number.isFinite(candidate.startedAt) && Number.isFinite(candidate.expiresAt) && candidate.expiresAt > candidate.startedAt;
    this.powder = valid ? { ...candidate } : null;
    if (!this.powder) return { accepted: true, burst: null };
    const event = this.powder;
    const serverNow = this.serverTime + Math.max(0, now - this.receivedAt);
    const age = serverNow - event.startedAt;
    const unseen = !this.seen.has(event.id);
    this.seen.add(event.id);
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!);
    const young = age >= 0 && age <= 4_000 && event.expiresAt > serverNow;
    return { accepted: true, burst: !first && unseen && young ? event.color : null };
  }

  sample(now: number): PowderSample {
    const serverNow = this.serverTime + Math.max(0, now - this.receivedAt);
    const event = this.powder;
    if (!event || serverNow < event.startedAt || serverNow >= event.expiresAt) return { color: null, weight: 0, hue: 0 };
    const age = serverNow - event.startedAt;
    return {
      color: event.color,
      weight: smooth(age / 900) * smooth((event.expiresAt - serverNow) / 2_500),
      hue: ((age / 18_000) % 1 + 1) % 1,
    };
  }
}
