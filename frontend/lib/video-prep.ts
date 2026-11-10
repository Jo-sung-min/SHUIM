"use client";

/**
 * 릴스 영상 준비: 브라우저(WebCodecs)에서 고른 구간만 잘라 H.264 + AAC MP4(fastStart)로 줄인다.
 * Mediabunny 는 영상을 고를 때만 불러온다(피드·사진 흐름 번들에 넣지 않음).
 */
import { VIDEO_MAX_SECONDS } from "./feed-media";

export const MAX_SOURCE_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_UPLOAD_VIDEO_BYTES = 25 * 1024 * 1024;
const LONG_EDGE = 1280;
const SHORT_EDGE = 720;
const VIDEO_BITRATE = 2_500_000;
const AUDIO_BITRATE = 128_000;

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  ratio: number;
  hasAudio: boolean;
}

export interface PreparedVideo {
  blob: Blob;
  duration: number;
  ratio: number;
  /** 소리 없이 저장됨(사용자가 껐거나 이 기기에서 소리를 담지 못함) */
  muted: boolean;
}

const READ_ERROR = "이 영상을 읽지 못했어요. 다른 영상을 골라 주세요.";

function cancelled() {
  const error = new Error("영상 준비를 멈췄어요.");
  error.name = "AbortError";
  return error;
}

const loadMediabunny = () => import("mediabunny");

/** 길이·크기·소리 유무 (회전 반영한 화면 크기) */
export async function probeVideo(file: File): Promise<VideoInfo> {
  if (!file.size) throw new Error(READ_ERROR);
  if (file.size > MAX_SOURCE_VIDEO_BYTES) throw new Error("영상은 1GB 이하로 골라 주세요.");
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error(READ_ERROR);
    const [width, height, duration, audio] = await Promise.all([
      video.getDisplayWidth(), video.getDisplayHeight(),
      // 머리 정보의 길이는 조각난 MP4(화면 녹화·일부 메신저)에서 0 에 가깝게 나와 실제 패킷으로 잰다
      input.computeDuration(),
      input.getPrimaryAudioTrack(),
    ]);
    if (!width || !height || !Number.isFinite(duration) || duration <= 0) throw new Error(READ_ERROR);
    return { duration, width, height, ratio: width / height, hasAudio: Boolean(audio) };
  } catch (error) {
    throw error instanceof Error && error.message === READ_ERROR ? error : new Error(READ_ERROR);
  } finally {
    input.dispose();
  }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** 구간 [start, end] 를 잘라 720p H.264 MP4 로. 진행률 0~1 */
export async function prepareVideo(file: File, range: { start: number; end: number; muted: boolean }, options: { onProgress?: (p: number) => void; signal?: AbortSignal } = {}): Promise<PreparedVideo> {
  const { signal, onProgress } = options;
  if (signal?.aborted) throw cancelled();
  const start = Math.max(0, range.start);
  const end = Math.min(range.end, start + VIDEO_MAX_SECONDS);
  if (!(end > start)) throw new Error("영상 구간을 다시 골라 주세요.");
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  let conversion: Awaited<ReturnType<typeof mb.Conversion.init>> | null = null;
  const abort = () => { void conversion?.cancel(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error(READ_ERROR);
    const audio = range.muted ? null : await input.getPrimaryAudioTrack();
    const [w, h, stats] = await Promise.all([video.getDisplayWidth(), video.getDisplayHeight(), video.computePacketStats(90).catch(() => null)]);
    const scale = Math.min(1, LONG_EDGE / Math.max(w, h), SHORT_EDGE / Math.min(w, h));
    const width = even(w * scale), height = even(h * scale);
    if (!(await mb.canEncodeVideo("avc", { width, height }))) throw new Error("이 기기에서는 영상을 준비할 수 없어요.");
    // 원본 AAC 는 그대로 복사, 아니면 AAC → Opus 순으로 이 기기가 만들 수 있는 것
    let audioCodec: "aac" | "opus" | null = null;
    if (audio) {
      const source = await audio.getCodec();
      if (source === "aac") audioCodec = "aac";
      else if (await mb.canEncodeAudio("aac")) audioCodec = "aac";
      else if (await mb.canEncodeAudio("opus")) audioCodec = "opus";
    }
    const sourceAac = audioCodec === "aac" && audio && (await audio.getCodec()) === "aac";
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    conversion = await mb.Conversion.init({
      input, output, tracks: "primary", showWarnings: false,
      trim: { start, end },
      video: {
        codec: "avc", width, height, fit: "fill", allowTransformationMetadata: false,
        quality: new mb.Quality({ bitrate: VIDEO_BITRATE }),
        ...(stats && stats.averagePacketRate > 31 ? { frameRate: 30 } : {}),
      },
      audio: audioCodec ? { codec: audioCodec, ...(sourceAac ? {} : { quality: new mb.Quality({ bitrate: AUDIO_BITRATE }) }) } : { discard: true },
      tags: {},
    });
    if (signal?.aborted) throw cancelled();
    if (!conversion.isValid) throw new Error("이 기기에서는 영상을 준비할 수 없어요.");
    const keptAudio = conversion.utilizedTracks.some((track) => track.isAudioTrack());
    conversion.onProgress = (p) => onProgress?.(Math.max(0, Math.min(1, p)));
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer?.byteLength) throw new Error("영상을 준비하지 못했어요. 다시 시도해 주세요.");
    const blob = new Blob([buffer], { type: "video/mp4" });
    if (blob.size > MAX_UPLOAD_VIDEO_BYTES) throw new Error("영상이 너무 커요. 구간을 줄여 주세요.");
    onProgress?.(1);
    return { blob, duration: Math.round((end - start) * 100) / 100, ratio: width / height, muted: !keptAudio };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "ConversionCanceledError")) throw cancelled();
    if (error instanceof Error && /영상|기기/.test(error.message)) throw error;
    throw new Error("영상을 준비하지 못했어요. 다시 시도해 주세요.");
  } finally {
    signal?.removeEventListener("abort", abort);
    input.dispose();
  }
}

/** 구간 고르기용 필름스트립: 비디오 하나로 차례로 넘기며 작은 장면을 뜬다 */
export async function filmstrip(src: string, duration: number, count: number, height = 56, signal?: AbortSignal): Promise<string[]> {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = src;
  const wait = (event: "loadeddata" | "seeked") => new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(READ_ERROR)), 10_000);
    video.addEventListener(event, () => { window.clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error(READ_ERROR)); }, { once: true });
  });
  const frames: string[] = [];
  try {
    await wait("loadeddata");
    const canvas = document.createElement("canvas");
    canvas.height = height;
    canvas.width = Math.max(1, Math.round(height * video.videoWidth / Math.max(1, video.videoHeight)));
    const ctx = canvas.getContext("2d");
    if (!ctx) return frames;
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;
      video.currentTime = Math.min(duration - 0.05, (duration * (i + 0.5)) / count);
      await wait("seeked");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.6));
    }
    canvas.width = 0;
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/** <video> 로 한 장면을 떠서 WebP(안 되면 JPEG) 로. 표지·필름스트립에 쓴다 */
export function grabFrame(src: string, time: number, maxEdge: number, type: "blob" | "dataUrl" = "blob"): Promise<Blob | string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let done = false;
    const timer = window.setTimeout(() => finish(new Error(READ_ERROR)), 15_000);
    const finish = (error?: Error, value?: Blob | string) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      if (error || value === undefined) reject(error ?? new Error(READ_ERROR)); else resolve(value);
    };
    video.onerror = () => finish(new Error(READ_ERROR));
    video.onloadeddata = () => { video.currentTime = Math.max(0, Math.min(time, (video.duration || time) - 0.05)); };
    video.onseeked = () => {
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { finish(new Error(READ_ERROR)); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (type === "dataUrl") { finish(undefined, canvas.toDataURL("image/jpeg", 0.7)); canvas.width = 0; return; }
      canvas.toBlob((webp) => {
        if (webp?.size) { finish(undefined, webp); canvas.width = 0; return; }
        canvas.toBlob((jpeg) => { finish(jpeg?.size ? undefined : new Error(READ_ERROR), jpeg ?? undefined); canvas.width = 0; }, "image/jpeg", 0.85);
      }, "image/webp", 0.85);
    };
    video.src = src;
  });
}
