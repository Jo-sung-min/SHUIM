import type { BufferGeometry } from "three";
import { assetUrl } from "../assets";
import { FieldRecording } from "./field-recording";
import type { MapId } from "./maps";

type Cue = { at: number; rate: number };
type Position = { x: number; y: number; z: number };
const MUTED_KEY = "sorow:fireworks-muted";
// 50% retains the field recording and firework levels heard before the slider existed.
const DEFAULT_FIELD_VOLUME = 50;
const BOOM_URL = "/beach/fx/firework-boom-v1.mp3";
const DISTANT_SURF = 0.12;

function approachLevel(current: number, target: number, blend: number) {
  return Math.abs(target - current) < .001 ? target : current + (target - current) * blend;
}

/** The primary flash particles carry the actual detonation time and world position of every shell. */
export function fireworkSoundCues(geometry: BufferGeometry, listener: Position, start: number, seed: number): Cue[] {
  const timing = geometry.getAttribute("timing"), position = geometry.getAttribute("position"), detail = geometry.getAttribute("detail");
  const flashes: number[] = [];
  for (let i = 0; i < timing.count; i++) {
    if (timing.getW(i) !== 3 || detail.getX(i) < 3) continue; // Only the main shell produces a report.
    const distance = Math.hypot(position.getX(i) - listener.x, position.getY(i) - listener.y, position.getZ(i) - listener.z);
    flashes.push(start + timing.getX(i) * 1000 + Math.min(1200, distance / 343 * 1000));
  }
  flashes.sort((a, b) => a - b);
  const cues: Cue[] = [];
  let lastBoom = -Infinity;
  for (const at of flashes) {
    if (at - lastBoom < 750) continue; // A group of simultaneous shells is heard as one distant report.
    lastBoom = at;
    const rate = 0.92 + ((seed % 17 + cues.length * 2) % 17) / 100;
    cues.push({ at, rate });
  }
  return cues;
}

export class FireworkAudio {
  muted = false;
  private context: AudioContext | null = null;
  private boom: AudioBuffer | null = null;
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private cues: Cue[] = [];
  private clockOffset = 0;
  private loading = false;
  private retryAfter = 0;
  private abort = new AbortController();
  private disposed = false;
  private listener: Position;
  private readonly recording: FieldRecording | null;
  private readonly crackle: FieldRecording | null;
  private readonly volumeKey: string;
  private backgroundGain: number;
  private fireGain = 0;
  private fireInRange = false;
  private unlocked = false;
  private sceneRunning: boolean;
  private volume = DEFAULT_FIELD_VOLUME;
  private lastAudibleVolume = DEFAULT_FIELD_VOLUME;
  get fieldVolume() { return this.volume; }

  constructor(listener: Position, map: MapId = "uyuni", running = true) {
    this.listener = listener;
    this.sceneRunning = running;
    this.backgroundGain = map === "beach" ? DISTANT_SURF : 1;
    this.volumeKey = `sorow:${map}-field-volume`;
    this.recording = map === "bamboo" ? new FieldRecording("/beach/fx/bamboo-field-crickets-v1.mp3")
      : map === "beach" ? new FieldRecording("/beach/fx/beach-shore-waves-v1.mp3") : null;
    this.crackle = map === "beach" ? new FieldRecording("/beach/fx/beach-campfire-crackle-v1.mp3") : null;
    try {
      this.muted = localStorage.getItem(MUTED_KEY) === "1";
      if (this.recording) {
        const saved = localStorage.getItem(this.volumeKey);
        this.volume = saved != null && /^(?:0|[1-9]\d?|100)$/.test(saved) ? Number(saved) : this.muted ? 0 : DEFAULT_FIELD_VOLUME;
        this.muted = this.volume === 0;
        if (!this.muted) this.lastAudibleVolume = this.volume;
      }
    } catch { /* The current visit can still play sound. */ }
    this.recording?.setVolume(this.volume / DEFAULT_FIELD_VOLUME * this.backgroundGain);
    this.crackle?.setVolume(0);
    // A spectator's ordinary tap or key press can also unlock audio on mobile browsers.
    window.addEventListener("pointerup", this.unlock, true);
    window.addEventListener("keydown", this.unlock, true);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private unlock = () => {
    if (this.disposed || this.muted || document.hidden) return;
    this.unlocked = true;
    if (!this.sceneRunning) return;
    const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Audio) try {
      this.context ??= new Audio();
      if (this.context.state !== "running") void this.context.resume().catch(() => {});
    } catch { /* Visual fireworks also work when audio is unavailable. */ }
    this.recording?.resume(this.context);
    if (this.fireInRange) this.crackle?.resume(this.context);
  };

  /** The beach tide line is near z=-1. The fire and listener use the same XZ world coordinates. */
  updateBeachSound(person: { x: number; z: number }, fire: { x: number; z: number }, logs: number, dt: number) {
    if (!this.crackle || !this.recording || this.disposed || !Number.isFinite(dt) || !Number.isFinite(person.z)) return;
    const scale = this.volume / DEFAULT_FIELD_VOLUME;
    const blend = 1 - Math.exp(-Math.min(.2, Math.max(0, dt)) / .35);
    const waveTarget = DISTANT_SURF + (1 - DISTANT_SURF) * Math.exp(-Math.max(0, person.z - 1) / 22);
    const wave = approachLevel(this.backgroundGain, waveTarget, blend);
    if (wave !== this.backgroundGain) { this.backgroundGain = wave; this.recording.setVolume(wave * scale); }

    const burning = Number.isSafeInteger(logs) && logs > 0;
    const distance = burning ? Math.hypot(person.x - fire.x, person.z - fire.z) : Infinity;
    const t = Number.isFinite(distance) ? Math.max(0, Math.min(1, (8 - distance) / 6)) : 0;
    const target = burning ? t * t * (3 - 2 * t) * (.62 + .38 * Math.min(1, (logs - 1) / 5)) : 0;
    // Distance fades naturally. An empty hearth stops immediately, including a still-loading stream.
    const level = burning ? approachLevel(this.fireGain, target, blend) : 0;
    if (level !== this.fireGain) { this.fireGain = level; this.crackle.setVolume(level * scale); }
    const inRange = target >= .025 || (this.fireInRange && level > .004);
    if (this.fireInRange === inRange) return;
    this.fireInRange = inRange;
    if (!inRange) this.crackle.pause();
    else if (this.unlocked && !this.muted && this.sceneRunning && !document.hidden) this.crackle.resume(this.context);
  }

  setSceneRunning(running: boolean) {
    if (this.sceneRunning === running) return;
    this.sceneRunning = running;
    this.discardPast();
    if (!running) {
      this.stopVoices(); this.recording?.pause(); this.crackle?.pause();
      this.fireInRange = false; this.fireGain = 0; this.crackle?.setVolume(0);
    }
    else if (this.unlocked && !document.hidden && !this.muted) this.unlock();
  }

  setMuted(muted: boolean) {
    if (this.recording) { this.setFieldVolume(muted ? 0 : this.lastAudibleVolume); return; }
    this.muted = muted;
    try { localStorage.setItem(MUTED_KEY, muted ? "1" : "0"); } catch { /* Keep the choice for this visit. */ }
    if (muted) this.stopVoices();
    else this.unlock();
    this.discardPast();
  }

  setFieldVolume(percent: number) {
    if (!this.recording || this.disposed || !Number.isFinite(percent)) return;
    this.volume = Math.min(100, Math.max(0, Math.round(percent)));
    this.muted = this.volume === 0;
    try { localStorage.setItem(this.volumeKey, String(this.volume)); } catch { /* The current visit still works. */ }
    const scale = this.volume / DEFAULT_FIELD_VOLUME;
    this.recording.setVolume(scale * this.backgroundGain);
    this.crackle?.setVolume(scale * this.fireGain);
    if (this.muted) { this.stopVoices(); this.recording.pause(); this.crackle?.pause(); }
    else {
      this.lastAudibleVolume = this.volume;
      for (const gain of this.voices.values()) gain.gain.value = .48 * scale;
      this.unlock();
    }
    this.discardPast();
  }

  private discardPast() {
    const now = Date.now() + this.clockOffset;
    this.cues = this.cues.filter(cue => cue.at > now);
  }

  private onVisibility = () => {
    this.discardPast();
    if (document.hidden) { this.stopVoices(); this.recording?.pause(); this.crackle?.pause(); }
    else if (this.recording && this.unlocked && !this.muted) this.unlock();
  };

  addShow(geometry: BufferGeometry, startedAt: number, serverNow: number, seed: number) {
    if (this.disposed) return;
    this.clockOffset = serverNow - Date.now();
    this.cues.push(...fireworkSoundCues(geometry, this.listener, startedAt, seed).filter(cue => cue.at > serverNow));
    this.cues.sort((a, b) => a.at - b.at);
  }

  update(serverNow: number) {
    if (this.disposed || !this.cues.length) return;
    this.clockOffset = serverNow - Date.now();
    const audible = this.sceneRunning && !document.hidden && !this.muted && this.context?.state === "running";
    if (audible && !this.boom && !this.loading && Date.now() >= this.retryAfter) void this.loadBoom();
    while (this.cues.length && this.cues[0].at <= serverNow) {
      const cue = this.cues.shift()!;
      // Dropped frames, blocked playback and a late file download must not create a burst of old sounds.
      if (audible && serverNow - cue.at < 200) this.play(cue);
    }
  }

  private async loadBoom() {
    const context = this.context;
    if (!context) return;
    this.loading = true;
    try {
      const response = await fetch(assetUrl(BOOM_URL), { mode: "cors", credentials: "omit", signal: this.abort.signal });
      if (!response.ok) return;
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!this.disposed) this.boom = buffer;
    } catch {
      // A later burst can retry a failed download or decode.
    } finally {
      this.loading = false;
      this.retryAfter = Date.now() + 5000;
    }
  }

  private play(cue: Cue) {
    const context = this.context, buffer = this.boom;
    if (!context || !buffer || this.voices.size >= 2) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = cue.rate;
    gain.gain.value = 0.48 * (this.volume / DEFAULT_FIELD_VOLUME);
    source.connect(gain).connect(context.destination);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
    this.voices.set(source, gain);
    source.start();
  }

  private stopVoices() {
    for (const [source, gain] of this.voices) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("pointerup", this.unlock, true);
    window.removeEventListener("keydown", this.unlock, true);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.abort.abort();
    this.stopVoices();
    this.recording?.dispose(); this.crackle?.dispose();
    this.cues.length = 0;
    this.boom = null;
    if (this.context) void this.context.close().catch(() => {});
  }
}
