import type { Camera, Scene, WebGLRenderer } from "three";

const PHOTO_LONG_EDGE = 1920;

/** Copy this freshly rendered frame before the WebGL drawing buffer is cleared. */
export function captureScenePhoto(renderer: Pick<WebGLRenderer, "domElement" | "render">, scene: Scene, camera: Camera): Promise<Blob> {
  const source = renderer.domElement;
  if (source.width < 1 || source.height < 1) return Promise.reject(new Error("사진을 담을 화면을 준비하고 있어요."));
  const scale = Math.min(1, PHOTO_LONG_EDGE / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("이 기기에서는 사진을 저장할 수 없어요."));
  try {
    // No await between render and copy: preserveDrawingBuffer is unnecessary.
    renderer.render(scene, camera);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob?.size ? resolve(blob) : reject(new Error("사진을 담지 못했어요. 다시 찍어 주세요.")), "image/png");
    });
  } catch {
    return Promise.reject(new Error("사진을 담지 못했어요. 다시 찍어 주세요."));
  }
}

export type BeachPhoto = { file: File; url: string; dispose: () => void };
type ShareBrowser = Pick<Navigator, "share" | "canShare">;

export function createBeachPhoto(blob: Blob, now = new Date()): BeachPhoto {
  if (!blob.size || !["image/png", "image/jpeg"].includes(blob.type)) throw new Error("사진을 담지 못했어요. 다시 찍어 주세요.");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const file = new File([blob], `sorow-${stamp}.${blob.type === "image/jpeg" ? "jpg" : "png"}`, { type: blob.type });
  const url = URL.createObjectURL(file);
  let disposed = false;
  return { file, url, dispose: () => { if (!disposed) { URL.revokeObjectURL(url); disposed = true; } } };
}

export function canSharePhoto(file: File, browser: ShareBrowser = navigator, secure = globalThis.isSecureContext): boolean {
  if (!secure || typeof browser.share !== "function" || typeof browser.canShare !== "function") return false;
  try { return browser.canShare({ files: [file] }); } catch { return false; }
}

/** Invoke directly in a click handler with an already prepared File. */
export async function shareBeachPhoto(file: File, browser: ShareBrowser = navigator, secure = globalThis.isSecureContext): Promise<"shared" | "cancelled" | "unsupported"> {
  if (!canSharePhoto(file, browser, secure)) return "unsupported";
  try {
    await browser.share({ files: [file], title: "소로우에서 쉬어가는 순간" });
    return "shared";
  } catch (cause) {
    if (cause && typeof cause === "object" && "name" in cause && cause.name === "AbortError") return "cancelled";
    throw new Error("공유 화면을 열지 못했어요. 사진을 저장한 뒤 보내 주세요.");
  }
}

export function downloadBeachPhoto(photo: Pick<BeachPhoto, "file" | "url">): void {
  const link = document.createElement("a");
  link.href = photo.url;
  link.download = photo.file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
