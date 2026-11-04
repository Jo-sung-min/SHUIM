/** Public media keeps its existing path on the CDN. API and user uploads never pass through this mapping. */
function assetBase(value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) return "";
    return url.href.replace(/\/+$/, "");
  } catch { return ""; }
}

// Next.js replaces this direct reference at build time in both server and client bundles.
const BASE = assetBase(process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "");
const ROOT_MEDIA = new Set(["/splash.webp", "/sorow-logo.png", "/favicon.svg"]);

export function assetUrl(path: string): string {
  if (!BASE || !path.startsWith("/") || path.startsWith("//")) return path;
  try {
    const url = new URL(path, "https://public-assets.invalid");
    if (url.origin !== "https://public-assets.invalid") return path;
    const publicMedia = ROOT_MEDIA.has(url.pathname)
      || (/^\/(beach|feed)\//.test(url.pathname) && /\.(?:avif|webp|png|jpe?g|gif|svg|glb|gltf|ktx2|basis|bin)$/i.test(url.pathname));
    return publicMedia ? `${BASE}${url.pathname}${url.search}${url.hash}` : path;
  } catch { return path; }
}

/** Quoted CSS URLs also work for filenames with spaces or punctuation. */
export const assetCssUrl = (path: string) => `url(${JSON.stringify(assetUrl(path))})`;

/** Anonymous CORS keeps cross-origin textures origin-clean for WebGL, atlas pixel reads and photo capture. */
export function assetLoader<T extends { crossOrigin?: string; withCredentials?: boolean }>(loader: T): T {
  loader.crossOrigin = "anonymous";
  loader.withCredentials = false;
  return loader;
}

export const publicAssetStyles = {
  "--sorow-logo-image": assetCssUrl("/sorow-logo.png"),
  "--beach-character-atlas": assetCssUrl("/beach/chars-v2.png"),
  "--beach-landscape-image": assetCssUrl("/beach/real/paradise-panorama-v1.webp"),
};
