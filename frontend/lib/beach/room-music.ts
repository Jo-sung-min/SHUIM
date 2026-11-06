import { IS_AIT } from "../ait";
import type { MapId } from "./maps";

export const ROOM_TRACKS = {
  "morning-v1": { trackId: "morning-v1", title: "아침만남겨주고", durationMs: 257520 },
  "tomorrow-v1": { trackId: "tomorrow-v1", title: "내일의우리", durationMs: 240000 },
} as const;
export type TrackId = keyof typeof ROOM_TRACKS;
export type RoomMusicState = (typeof ROOM_TRACKS)[TrackId] & { playing: boolean; startedAt: number | null; version: number };
export type MusicAction = "play" | "stop";
export type ListenerStatus = "idle" | "loading" | "playing" | "muted" | "listen" | "error";
export type MusicPreferences = { volume: number; muted: boolean };
const SETTINGS_KEY = "sorow:room-music:v1";
const MINI_AUDIO_LIMIT = 6_000_000;

async function privateAudioBlob(response: Response, signal: AbortSignal): Promise<Blob> {
  if (!response.ok || Number(response.headers.get("content-length")) > MINI_AUDIO_LIMIT || !response.body) throw Error();
  const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (signal.aborted) throw Error();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MINI_AUDIO_LIMIT) throw Error();
      chunks.push(new Uint8Array(value).buffer);
    }
    if (!bytes) throw Error();
    return new Blob(chunks, { type: "audio/mpeg" });
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

export function readRoomMusic(raw: unknown): RoomMusicState | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as RoomMusicState;
  if (typeof m.trackId !== "string" || !Object.hasOwn(ROOM_TRACKS, m.trackId)) return null;
  const track = ROOM_TRACKS[m.trackId];
  if (m.title !== track.title || m.durationMs !== track.durationMs ||
      !Number.isSafeInteger(m.version) || m.version < 0 || typeof m.playing !== "boolean") return null;
  if (m.playing ? !Number.isSafeInteger(m.startedAt) || m.startedAt! < 0 : m.startedAt !== null) return null;
  return { ...track, version: m.version, playing: m.playing, startedAt: m.startedAt };
}

export function readMusicPreferences(): MusicPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (value && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1 && typeof value.muted === "boolean")
      return { volume: value.volume, muted: value.muted };
  } catch { /* A private browser may not provide storage. */ }
  return { volume: 0.32, muted: false };
}

export async function changeRoomMusic(ticket: string, action: MusicAction, expectedVersion: number, signal: AbortSignal, trackId?: TrackId) {
  const response = await fetch("/api/beach/music", { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, action, expectedVersion, ...(action === "play" ? {trackId} : {}) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "방의 음악을 변경하지 못했어요.");
  const music = readRoomMusic(data?.music);
  if (!music || !Number.isSafeInteger(data.serverTime) || data.serverTime < 0)
    throw new Error("방의 음악 상태를 확인하지 못했어요.");
  return { music, serverTime: data.serverTime as number };
}

/** One private media element per visit. Its gain belongs to this listener alone. */
export class RoomMusicPlayer {
  private url: string;
  private notify: (status: ListenerStatus) => void;
  private status: ListenerStatus = "idle";
  private music: RoomMusicState | null = null;
  private serverAt = 0;
  private sampledAt = 0;
  private lastSnapshotAt = -1;
  private suspended = false;
  private disposed = false;
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private request: AbortController | null = null;
  private blob: string | null = null;
  private pendingPlay = false;
  private attempt = 0;
  private preferences: MusicPreferences;

  constructor(communityId: string, mapId: MapId, preferences: MusicPreferences, notify: (status: ListenerStatus) => void) {
    this.url = "/api/beach/music/audio?" + new URLSearchParams({ communityId, mapId });
    this.preferences = preferences;
    this.notify = notify;
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("pointerup", this.onGesture, true);
    window.addEventListener("keydown", this.onGesture, true);
  }

  private display(status: ListenerStatus) {
    if (this.status !== status && !this.disposed) { this.status = status; this.notify(status); }
  }

  sync(music: RoomMusicState, serverTime: number) {
    if (this.disposed || !Number.isFinite(serverTime) || (this.music &&
      (music.version < this.music.version || (music.version === this.music.version && serverTime < this.lastSnapshotAt)))) return;
    const changed = this.music?.version !== music.version;
    if (!changed && this.music && (music.trackId !== this.music.trackId || music.playing !== this.music.playing || music.startedAt !== this.music.startedAt)) return;
    const now = performance.now();
    const priorTime = this.serverAt + now - this.sampledAt;
    this.serverAt = changed ? serverTime : Math.max(serverTime, priorTime);
    this.sampledAt = now;
    this.lastSnapshotAt = serverTime;
    this.music = music;
    if (changed) this.releaseMedia();
    if (!music.playing || this.position() >= music.durationMs / 1000) {
      this.releaseMedia(); this.display("idle"); return;
    }
    this.reconcile();
  }

  private position() {
    return this.music?.startedAt != null ? Math.max(0, (this.serverAt + performance.now() - this.sampledAt - this.music.startedAt) / 1000) : 0;
  }

  private audible() {
    return !this.disposed && this.music?.playing && this.position() < this.music.durationMs / 1000 &&
      !this.suspended && !document.hidden && !this.preferences.muted && this.preferences.volume > 0;
  }

  private interrupt() {
    this.attempt++;
    this.pendingPlay = false;
    this.audio?.pause();
  }

  private visibility = () => { if (document.hidden) this.interrupt(); else this.listen(false); };
  private onGesture = () => {
    if (this.disposed || this.suspended || document.hidden || this.preferences.muted || this.preferences.volume === 0) return;
    if (!this.context || this.context.state !== "running") this.unlock();
    if (this.music?.playing && this.status === "listen") this.listen(true);
  };

  setSuspended(suspended: boolean) {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    if (suspended) this.interrupt(); else this.listen(false);
  }

  setPreferences(preferences: MusicPreferences) {
    this.preferences = { volume: Math.max(0, Math.min(1, preferences.volume)), muted: preferences.muted };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.preferences)); } catch { /* Keep it for this visit. */ }
    this.applyVolume();
    if (!this.preferences.volume || this.preferences.muted) {
      this.interrupt(); this.display("muted");
    } else this.listen(true);
  }

  private applyVolume() {
    const level = this.preferences.muted ? 0 : this.preferences.volume;
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(level, this.context.currentTime, .025);
    else if (this.audio) this.audio.volume = level;
  }

  /** Synchronously resume the Web Audio graph inside a real tap, including before an admin's network request. */
  unlock(resume = true) {
    if (this.disposed || document.hidden) return;
    try {
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Context && !this.context) {
        this.context = new Context();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.preferences.muted ? 0 : this.preferences.volume;
        this.gain.connect(this.context.destination);
        if (this.audio) this.connectMedia(this.audio);
      }
      if (resume && this.context && this.context.state !== "running") void this.context.resume().then(() => {
        if (this.audio && !this.audio.paused && this.audible()) this.display("playing");
      }).catch(() => {});
    } catch { /* Element volume remains available on platforms without Web Audio. */ }
  }

  private connectMedia(audio: HTMLAudioElement) {
    if (!this.context || !this.gain || this.source) return;
    this.source = this.context.createMediaElementSource(audio);
    this.source.connect(this.gain);
    audio.volume = 1;
  }

  private reconcile() {
    if (!this.audible()) {
      if (this.preferences.muted || !this.preferences.volume) this.display("muted");
      return;
    }
    if (!this.audio) { this.prepare(); return; }
    if (this.audio.readyState >= 1) this.seek();
    if (this.status !== "listen" && this.status !== "error") this.play(false);
  }

  private seek() {
    if (!this.audio || this.audio.readyState < 1) return;
    const position = this.position();
    if (this.music && position < this.music.durationMs / 1000 && Math.abs(this.audio.currentTime - position) > .8) {
      try { this.audio.currentTime = position; } catch { /* Metadata may be transitioning after a range request. */ }
    }
  }

  private prepare() {
    const audio = new Audio();
    this.audio = audio;
    audio.preload = "metadata";
    this.display("loading");
    this.connectMedia(audio); this.applyVolume();
    audio.onloadedmetadata = () => { if (this.audio === audio) { this.seek(); this.play(false); } };
    audio.onended = () => { if (this.audio === audio) this.display("idle"); };
    audio.onerror = () => { if (this.audio === audio) this.display("error"); };
    const url = this.url + "&trackId=" + this.music!.trackId;
    if (!IS_AIT) { audio.src = url; return; }
    // The miniature app uses a bearer token. Only the existing /api fetch transport attaches it.
    const request = new AbortController(); this.request = request;
    void (async () => {
      try {
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store",
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
        const blob = await privateAudioBlob(response, request.signal);
        if (this.audio !== audio || request.signal.aborted) return;
        this.blob = URL.createObjectURL(blob); audio.src = this.blob;
      } catch { if (this.audio === audio && !request.signal.aborted) this.display("error"); }
    })();
  }

  listen(gesture: boolean) {
    if (gesture) this.unlock();
    if (!this.audible()) return;
    if (gesture && this.status === "error") this.releaseMedia();
    if (!this.audio) this.prepare();
    this.seek(); this.play(gesture);
  }

  private play(gesture: boolean) {
    const audio = this.audio;
    if (!audio?.src || !this.audible() || this.pendingPlay || !audio.paused || audio.ended) return;
    if (!gesture && (this.status === "listen" || this.status === "error")) return;
    // Use a separate gain node even on iOS, where HTMLMediaElement.volume may be read-only.
    // A browser with a suspended context will need a listener tap before music can start.
    if (!this.context) this.unlock(gesture);
    if (!gesture && this.context && this.context.state !== "running") { this.display("listen"); return; }
    const token = ++this.attempt;
    this.pendingPlay = true;
    void audio.play().then(() => {
      if (token === this.attempt && this.audio === audio && this.audible()) {
        this.seek(); this.display(this.context && this.context.state !== "running" ? "listen" : "playing");
      }
    }).catch((error: DOMException) => {
      if (token === this.attempt && this.audio === audio)
        this.display(error.name === "NotAllowedError" || error.name === "AbortError" ? "listen" : "error");
    }).finally(() => { if (token === this.attempt) this.pendingPlay = false; });
  }

  private releaseMedia() {
    this.interrupt();
    this.request?.abort(); this.request = null;
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.onloadedmetadata = null; audio.onended = null; audio.onerror = null;
      audio.removeAttribute("src"); audio.load();
    }
    this.source?.disconnect(); this.source = null;
    if (this.blob) URL.revokeObjectURL(this.blob);
    this.blob = null;
  }

  dispose() {
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("pointerup", this.onGesture, true);
    window.removeEventListener("keydown", this.onGesture, true);
    this.releaseMedia(); this.gain?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.gain = null;
  }
}
