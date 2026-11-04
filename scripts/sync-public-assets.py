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
}
CACHE_CONTROL = "public, max-age=86400"


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
    parser.add_argument("--verify", action="store_true", help="GET every CDN asset and verify SHA-256 and CORS")
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
        location = s3.get_bucket_location(Bucket=args.bucket).get("LocationConstraint") or "us-east-1"
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
    if args.verify:
        origins = ["https://www.sorow.co.kr", "https://sorow.co.kr", "http://127.0.0.1:3000"]
        for index, item in enumerate(files):
            origin = origins[index % len(origins)]
            url = report["cdn"] + "/" + quote(item["key"], safe="/-_.~")
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"Origin": origin}), timeout=30) as response:
                    content = response.read()
                    if hashlib.sha256(content).hexdigest() != item["sha256"]:
                        raise ValueError("CDN content hash differs from local asset")
                    if response.headers.get("Access-Control-Allow-Origin") not in ("*", origin):
                        raise ValueError("CDN CORS header does not allow the app origin")
                    if response.headers.get_content_type() != item["contentType"]:
                        raise ValueError("CDN content type mismatch")
                    report["verified"].append(item["key"])
            except Exception as error:
                failures.append({"key": item["key"], "error": str(error)})
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
