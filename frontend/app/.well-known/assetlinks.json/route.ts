/** The certificate here is the Play APP SIGNING certificate, not the upload-key certificate. */
export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim() || "kr.co.sorow.app";
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!/^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(packageName) || !fingerprints.length || fingerprints.some((f) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f))) {
    return Response.json({ error: "Android domain verification is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: [...new Set(fingerprints)] },
  }], { headers: { "Cache-Control": "public, max-age=300" } });
}
