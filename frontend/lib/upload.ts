"use client";
import { requireCommunityConsent } from "./consent";
import { inspectPhotoHeader, validatePhotoDimensions } from "./photo-edit";

export interface UploadResult { url: string; key: string; bytes: number }
export interface UploadOptions {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
  /** Maximum preparation/upload time after the community notice, in milliseconds. */
  timeoutMs?: number;
}
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1600;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PREPARE_ERROR = "사진을 읽지 못했어요. 다른 사진을 선택해 주세요.";
const TIMEOUT_ERROR = "사진을 올리는 데 시간이 걸리고 있어요. 연결을 확인한 뒤 다시 시도해 주세요.";

function cancelled() {
  const error = new Error("사진 첨부를 취소했어요.");
  error.name = "AbortError";
  return error;
}
function checkCancelled(signal?: AbortSignal) { if (signal?.aborted) throw cancelled(); }

/** Native decoders cannot always be cancelled, so dispose of their late result too. */
function interruptible<T>(promise: Promise<T>, signal?: AbortSignal, discard?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => { if (!settled) { settled = true; cleanup(); reject(cancelled()); } };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    promise.then((value) => {
      if (settled) { discard?.(value); return; }
      settled = true; cleanup(); resolve(value);
    }, (error) => { if (!settled) { settled = true; cleanup(); reject(error); } });
  });
}
function timedSignal(parent: AbortSignal | undefined, milliseconds: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) abort();
  const timer = setTimeout(() => { timedOut = true; abort(); }, milliseconds);
  return {
    signal: controller.signal,
    get timedOut() { return timedOut; },
    dispose() { clearTimeout(timer); parent?.removeEventListener("abort", abort); },
  };
}
async function imageType(file: File, signal?: AbortSignal): Promise<string> {
  checkCancelled(signal);
  if (!file.size) throw new Error("비어 있는 사진은 첨부할 수 없어요. 다른 사진을 선택해 주세요.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("사진은 한 장당 20MB까지 선택할 수 있어요.");
  if (file.type && !IMAGE_TYPES.has(file.type)) throw new Error("JPG, PNG, WebP, GIF 사진을 선택해 주세요. HEIC 사진은 JPG로 바꾼 뒤 첨부할 수 있어요.");
  const header = await interruptible(file.slice(0, 512 * 1024).arrayBuffer(), signal);
  const bytes = new Uint8Array(header);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  let type = "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = "image/jpeg";
  else if (bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) type = "image/png";
  else if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") type = "image/gif";
  else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") type = "image/webp";
  if (!type || (file.type && file.type !== type)) throw new Error(PREPARE_ERROR);
  inspectPhotoHeader(header);
  return type;
}
async function fileToBitmap(file: File, signal: AbortSignal): Promise<ImageBitmap | HTMLImageElement> {
  checkCancelled(signal);
  if ("createImageBitmap" in window) {
    try {
      return await interruptible(createImageBitmap(file, { imageOrientation: "from-image" }), signal, (bitmap) => bitmap.close());
    } catch { checkCancelled(signal); }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      signal.removeEventListener("abort", abort);
      img.onload = null; img.onerror = null;
    };
    const abort = () => { cleanup(); img.src = ""; reject(cancelled()); };
    img.onload = () => { cleanup(); resolve(img); };
    img.onerror = () => { cleanup(); img.src = ""; reject(new Error(PREPARE_ERROR)); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else img.src = url;
  });
}

/** Reduce large still photos; keep animation in GIFs. Always release decoded image resources. */
export async function shrinkImage(file: File, signal?: AbortSignal): Promise<Blob> {
  const scope = timedSignal(signal, 30_000);
  let bitmap: ImageBitmap | HTMLImageElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const type = await imageType(file, scope.signal);
    const original = file.type === type ? file : new Blob([file], { type });
    if (type === "image/gif") return original;
    bitmap = await fileToBitmap(file, scope.signal);
    const w = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
    const h = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
    validatePhotoDimensions(w, h);
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    // Re-encoding even small still images removes camera metadata, including GPS coordinates.
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(PREPARE_ERROR);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (type: string) => interruptible(new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, type, 0.85)), scope.signal);
    const webp = await encode("image/webp");
    if (webp?.size) return webp;
    const jpeg = await encode("image/jpeg");
    if (jpeg?.size) return jpeg;
    throw new Error(PREPARE_ERROR);
  } catch (error) {
    if (scope.timedOut) throw new Error("사진을 준비하는 데 시간이 걸려요. 다른 사진으로 다시 시도해 주세요.");
    checkCancelled(scope.signal);
    if (error instanceof Error && /사진/.test(error.message)) throw error;
    throw new Error(PREPARE_ERROR);
  } finally {
    if (bitmap) { if ("close" in bitmap) bitmap.close(); else bitmap.src = ""; }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    scope.dispose();
  }
}

/** The callback form remains supported for existing callers. */
export async function uploadImage(file: File, progressOrOptions?: ((pct: number) => void) | UploadOptions): Promise<UploadResult> {
  const options = typeof progressOrOptions === "function" ? { onProgress: progressOrOptions } : progressOrOptions ?? {};
  await imageType(file, options.signal);
  try {
    await interruptible(requireCommunityConsent(), options.signal);
  } catch (error) {
    checkCancelled(options.signal);
    if (error instanceof Error && error.message.includes("커뮤니티") && !/S3|CORS|서버/.test(error.message)) throw error;
    throw new Error("사진 첨부 안내를 확인하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  checkCancelled(options.signal);
  const timeout = Number.isFinite(options.timeoutMs) && options.timeoutMs! > 0 ? Math.min(options.timeoutMs!, 300_000) : 90_000;
  const scope = timedSignal(options.signal, timeout);
  try {
    options.onProgress?.(0);
    const blob = await shrinkImage(file, scope.signal);
    if (!blob.size || blob.size > MAX_UPLOAD_IMAGE_BYTES) throw new Error("사진은 첨부할 때 5MB 이하여야 해요. 크기를 줄이거나 다른 사진을 선택해 주세요.");
    const res = await fetch("/api/upload/presign", {
      method: "POST", credentials: "same-origin", signal: scope.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: blob.type, size: blob.size }),
    });
    const presigned = await res.json().catch(() => ({})) as { uploadUrl?: string; key?: string; publicUrl?: string; headers?: Record<string, string> };
    if (!res.ok) {
      if (res.status === 401) throw new Error("로그인 상태를 확인한 뒤 다시 사진을 첨부해 주세요.");
      if (res.status === 403) throw new Error("이 계정으로 사진을 첨부할 수 없어요. 이용 안내를 확인해 주세요.");
      if (res.status === 429) throw new Error("사진을 여러 번 첨부했어요. 잠시 후 다시 시도해 주세요.");
      throw new Error("지금은 사진을 첨부할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
    if (![presigned.uploadUrl, presigned.publicUrl, presigned.key].every((value) => typeof value === "string" && value.length)) throw new Error("사진 첨부를 준비하지 못했어요. 다시 시도해 주세요.");
    checkCancelled(scope.signal);
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        scope.signal.removeEventListener("abort", abort);
        xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
        xhr.upload.onprogress = null;
        if (error) reject(error); else resolve();
      };
      const abort = () => { xhr.abort(); finish(cancelled()); };
      xhr.open("PUT", presigned.uploadUrl!);
      xhr.timeout = timeout;
      for (const [key, value] of Object.entries(presigned.headers ?? {})) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error("사진을 올리지 못했어요. 다시 시도해 주세요."));
      xhr.onerror = () => finish(new Error("사진을 올리지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요."));
      xhr.ontimeout = () => finish(new Error(TIMEOUT_ERROR));
      xhr.onabort = () => finish(cancelled());
      scope.signal.addEventListener("abort", abort, { once: true });
      if (scope.signal.aborted) abort();
      else { try { xhr.send(blob); } catch { finish(new Error("사진을 올리지 못했어요. 다시 시도해 주세요.")); } }
    });
    options.onProgress?.(100);
    return { url: presigned.publicUrl!, key: presigned.key!, bytes: blob.size };
  } catch (error) {
    if (scope.timedOut) throw new Error(TIMEOUT_ERROR);
    checkCancelled(scope.signal);
    if (error instanceof Error && /사진/.test(error.message)) throw error;
    throw new Error("사진을 올리지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  } finally { scope.dispose(); }
}

/** Whether photo attachment is currently available. */
export async function uploadAvailable(): Promise<boolean> {
  const scope = timedSignal(undefined, 8_000);
  try {
    const response = await fetch("/api/upload/presign", { cache: "no-store", credentials: "same-origin", signal: scope.signal });
    const result = await response.json() as { configured?: boolean };
    return response.ok && result.configured === true;
  } catch { return false; }
  finally { scope.dispose(); }
}
