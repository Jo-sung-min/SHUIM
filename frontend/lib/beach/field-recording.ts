import { assetUrl } from "../assets";

const LEVEL = 0.43;

/** Stream the long field recording using the room's existing effects context. */
export class FieldRecording {
  private audio: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private pending = false;
  private enabled = false;
  private disposed = false;
  private generation = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private retryMs = 5000;
  private level = LEVEL;

  private readonly path: string;
  constructor(path: string) { this.path = path; }

  setVolume(scale: number) {
    this.level = LEVEL * scale;
    if (this.source && this.gain) this.gain.gain.value = this.level;
    else if (this.audio) this.audio.volume = this.level;
  }

  resume(context: AudioContext | null) {
    if (this.disposed || document.hidden) return;
    this.enabled = true;
    if (this.pending || this.retry !== undefined) return;
    let audio = this.audio;
    if (!audio) {
      audio = new Audio();
      this.audio = audio;
      audio.crossOrigin = "anonymous";
      audio.preload = "none";
      audio.loop = true;
      audio.volume = this.level;
      audio.src = assetUrl(this.path);
    }
    if (context && !this.source) {
      try {
        const gain = context.createGain();
        gain.gain.value = this.level;
        const source = context.createMediaElementSource(audio);
        source.connect(gain).connect(context.destination);
        this.gain = gain;
        this.source = source;
        audio.volume = 1;
      } catch { /* Media element volume is the fallback when Web Audio is unavailable. */ }
    }
    if (!audio.paused && !audio.error) return;
    if (audio.error) audio.load();
    const generation = ++this.generation;
    this.pending = true;
    void audio.play().then(() => {
      if (!this.enabled || document.hidden || this.disposed) audio.pause();
      else this.retryMs = 5000;
    }).catch((cause: DOMException) => {
      if (generation !== this.generation || !this.enabled || this.disposed) return;
      // Autoplay restrictions need a new gesture. Temporary network errors can recover during this visit.
      if (cause?.name !== "NotAllowedError" && cause?.name !== "AbortError") {
        this.retry = setTimeout(() => {
          this.retry = undefined;
          if (this.enabled && !this.disposed) this.resume(context);
        }, this.retryMs);
        this.retryMs = Math.min(60000, this.retryMs * 2);
      }
    }).finally(() => { if (this.generation === generation) this.pending = false; });
  }

  pause() {
    this.enabled = false;
    this.pending = false;
    this.generation++;
    clearTimeout(this.retry); this.retry = undefined;
    this.audio?.pause();
  }

  dispose() {
    this.disposed = true;
    this.pause();
    if (this.audio) { this.audio.removeAttribute("src"); this.audio.load(); }
    this.source?.disconnect(); this.gain?.disconnect();
    this.audio = null; this.source = null; this.gain = null;
  }
}
