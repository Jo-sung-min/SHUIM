"""Sync only public images/models to S3. Dry-run unless --apply; never deletes objects.

Requires botocore (also installed with the Elastic Beanstalk CLI).
Credentials: explicit --profile, process environment, or local backend/.env.
"""
import argparse
import hashlib
import json
import os
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
MANIFEST = ROOT / "frontend" / "public-assets.manifest.json"
TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif",
    ".avif": "image/avif", ".ico": "image/x-icon", ".glb": "model/gltf-binary",
    ".mp3": "audio/mpeg",
}
CACHE_CONTROL = "public, max-age=86400"
# Match the ordinary Chrome GET that loads a GLB. HEAD or urllib's identity
# encoding alone can hit a different CloudFront cache entry and miss CORS bugs.
BROWSER_HEADERS = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
}


def read_env(path):
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('\"').strip("'")
    return values


def inventory():
    files = []
    for path in sorted(PUBLIC.rglob("*")):
        if path.is_file() and path.suffix.lower() in TYPES:
            if not path.resolve().is_relative_to(PUBLIC.resolve()):
                raise ValueError("Asset points outside the public directory")
            data = path.read_bytes()
            files.append({"key": path.relative_to(PUBLIC).as_posix(), "bytes": len(data),
                          "sha256": hashlib.sha256(data).hexdigest(),
                          "contentType": TYPES[path.suffix.lower()]})
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Upload changed public assets")
    parser.add_argument("--verify", action="store_true", help="Verify content hashes and browser-style GET CORS, including no-Origin cache warming")
    parser.add_argument("--verify-key", action="append", help="Check only this manifest key with --verify; may be repeated")
    parser.add_argument("--bucket", default="sorow-aws-s3")
    parser.add_argument("--region", default="ap-northeast-2")
    parser.add_argument("--cdn", default="https://cdn.sorow.co.kr")
    parser.add_argument("--distribution-id", help="Invalidate uploaded paths, including negative cache entries")
    parser.add_argument("--profile", help="Use this AWS profile instead of local .env credentials")
    args = parser.parse_args()
    if not args.cdn.startswith("https://"):
        parser.error("CDN must use HTTPS")
    local_files = inventory()
    published = json.loads(MANIFEST.read_text(encoding="utf-8"))["files"] if MANIFEST.exists() else []
    by_key = {item["key"]: item for item in published}
    by_key.update({item["key"]: item for item in local_files})
    files = sorted(by_key.values(), key=lambda item: item["key"])
    if args.verify_key and (not args.verify or any(key not in by_key for key in args.verify_key)):
        parser.error("--verify-key requires --verify and known public asset keys")
    report = {"bucket": args.bucket, "cdn": args.cdn.rstrip("/"), "count": len(files),
              "bytes": sum(f["bytes"] for f in files), "uploaded": [], "unchanged": [], "verified": [],
              "files": files}
    print(json.dumps({**{k: report[k] for k in ("bucket", "cdn", "count", "bytes")}, "localFiles": len(local_files)}))
    if not args.apply and not args.verify:
        print("Dry-run. Add --apply to upload; --verify to check CDN delivery. No remote changes made.")
        return

    if args.apply and local_files:
        import botocore.session
        from botocore.config import Config
        from botocore.exceptions import ClientError
        session = botocore.session.Session(profile=args.profile) if args.profile else botocore.session.get_session()
        if not args.profile:
            values = read_env(ROOT / "backend" / ".env")
            values.update({key: val for key, val in os.environ.items() if key.startswith("AWS_")})
            key, secret = values.get("AWS_ACCESS_KEY_ID"), values.get("AWS_SECRET_ACCESS_KEY")
            if key and secret:
                session.set_credentials(key, secret, values.get("AWS_SESSION_TOKEN") or None)
        config = Config(connect_timeout=10, read_timeout=40, retries={"max_attempts": 2})
        s3 = session.create_client("s3", region_name=args.region, config=config)
        try:
            location = s3.get_bucket_location(Bucket=args.bucket).get("LocationConstraint") or "us-east-1"
        except ClientError as error:
            if error.response["Error"]["Code"] != "AccessDenied":
                raise
            # Upload-only IAM users can read the bucket's region header without
            # being granted the separate GetBucketLocation permission.
            bucket = s3.head_bucket(Bucket=args.bucket)
            location = bucket.get("BucketRegion") or bucket.get("ResponseMetadata", {}).get("HTTPHeaders", {}).get("x-amz-bucket-region")
            if not location:
                raise ValueError("Could not verify the target bucket region") from error
        if location != args.region:
            raise ValueError(f"Bucket is in {location}; use the matching --region")
        for item in local_files:
            old = None
            try:
                old = s3.head_object(Bucket=args.bucket, Key=item["key"])
            except ClientError as error:
                if error.response["Error"]["Code"] not in ("404", "NoSuchKey", "NotFound"):
                    raise
            if old and old.get("Metadata", {}).get("sha256") == item["sha256"] \
                    and old.get("ContentType") == item["contentType"] and old.get("CacheControl") == CACHE_CONTROL:
                report["unchanged"].append(item["key"])
                continue
            data = (PUBLIC / item["key"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise RuntimeError("Asset changed during upload; rerun sync")
            s3.put_object(Bucket=args.bucket, Key=item["key"], Body=data,
                          ContentType=item["contentType"], CacheControl=CACHE_CONTROL,
                          Metadata={"sha256": item["sha256"]})
            report["uploaded"].append(item["key"])
            print("Uploaded " + item["key"])
        if args.distribution_id and report["uploaded"]:
            cf = session.create_client("cloudfront", region_name=args.region, config=config)
            distribution = cf.get_distribution(Id=args.distribution_id)["Distribution"]["DistributionConfig"]
            from urllib.parse import urlsplit
            if urlsplit(args.cdn).hostname not in distribution.get("Aliases", {}).get("Items", []):
                raise ValueError("CloudFront distribution does not match the requested CDN hostname")
            paths = ["/" + quote(key, safe="/-_.~") for key in report["uploaded"]]
            result = cf.create_invalidation(DistributionId=args.distribution_id, InvalidationBatch={
                "Paths": {"Quantity": len(paths), "Items": paths},
                "CallerReference": "sorow-assets-" + str(time.time_ns()),
            })
            report["invalidation"] = result["Invalidation"]["Id"]
            print("CDN invalidation requested for uploaded paths")
        MANIFEST.write_text(json.dumps({"baseUrl": report["cdn"], "bucket": args.bucket, "files": files},
                                      ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    failures = []
    report["cdnChecks"] = []
    if args.verify:
        verification_files = [item for item in files if not args.verify_key or item["key"] in args.verify_key]
        for item in verification_files:
            url = report["cdn"] + "/" + quote(item["key"], safe="/-_.~")
            failure_count = len(failures)
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"Origin": "https://www.sorow.co.kr", "Accept-Encoding": "identity"}), timeout=30) as response:
                    content = response.read()
                    if hashlib.sha256(content).hexdigest() != item["sha256"]:
                        raise ValueError("CDN content hash differs from local asset")
                    if response.headers.get("Access-Control-Allow-Origin") not in ("*", "https://www.sorow.co.kr"):
                        raise ValueError("CDN CORS header does not allow the app origin")
                    if response.headers.get_content_type() != item["contentType"]:
                        raise ValueError("CDN content type mismatch")
            except Exception as error:
                failures.append({"key": item["key"], "profile": "identity-content", "error": str(error)})
            # Same URLs, no cache-busting query or no-cache header: first prime a
            # normal request without Origin, then verify both app Origins. A
            # missing CORS header on the first response is recorded but harmless
            # itself; that response must never poison the following CORS GETs.
            for origin in (None, "https://www.sorow.co.kr", "http://localhost:3000"):
                headers = dict(BROWSER_HEADERS)
                if origin:
                    headers.update({"Origin": origin, "Referer": origin + "/",
                                    "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Dest": "empty"})
                check = {"key": item["key"], "profile": "browser-get", "origin": origin}
                try:
                    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
                        response.read()
                        check.update({"status": response.status, "allowOrigin": response.headers.get("Access-Control-Allow-Origin"),
                                      "cache": response.headers.get("X-Cache"), "age": response.headers.get("Age"),
                                      "encoding": response.headers.get("Content-Encoding"), "vary": response.headers.get("Vary")})
                        if origin and check["allowOrigin"] not in ("*", origin):
                            raise ValueError("Browser GET cache response is missing the required CORS header")
                        if response.headers.get_content_type() != item["contentType"]:
                            raise ValueError("CDN content type mismatch")
                except Exception as error:
                    check["error"] = str(error)
                    failures.append(dict(check))
                report["cdnChecks"].append(check)
            if len(failures) == failure_count:
                report["verified"].append(item["key"])
    report["failures"] = failures
    output = ROOT / "frontend" / "out" / "cdn-assets-report.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"uploaded": len(report["uploaded"]), "unchanged": len(report["unchanged"]),
                      "verified": len(report["verified"]), "failures": failures, "report": str(output)}))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
