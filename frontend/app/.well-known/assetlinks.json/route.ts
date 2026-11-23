/** The certificate here is the Play APP SIGNING certificate, not the upload-key certificate. */
export const dynamic = "force-dynamic";
const playPackage = "kr.co.sorow.app";
const playSigningFingerprint = "11:8F:0E:2F:B8:6E:E7:5C:36:A3:F0:92:B3:84:A5:81:AD:1E:68:50:CF:48:9E:FE:B7:6D:1D:BD:C6:73:F1:1B";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim() || playPackage;
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (packageName === playPackage) fingerprints.unshift(playSigningFingerprint);
  if (!/^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(packageName) || !fingerprints.length || fingerprints.some((f) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f))) {
    return Response.json({ error: "Android domain verification is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: [...new Set(fingerprints)] },
  }], { headers: { "Cache-Control": "public, max-age=300" } });
}
