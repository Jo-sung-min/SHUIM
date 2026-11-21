import { readFile } from "node:fs/promises";
import path from "node:path";

/** Keep the existing /og address for shared links. Administrator overrides still use /api/site/og. */
export const dynamic = "force-static";

export async function GET() {
  const image = await readFile(path.join(process.cwd(), "public", "brand", "share-v1.jpg"));
  return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg" } });
}
