"""Publish inventoried private recordings with KMS. Pass the source directory and --apply to upload."""
import argparse
import hashlib
import os
import re
import runpy
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "backend/src/main/resources/room-music-inventory.properties"
PREFIX = "private/room-music/"


def public_status(url):
    headers = {"Range": "bytes=0-0", "Origin": "https://www.sorow.co.kr", "User-Agent": "Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36"}
    try:
        with urlopen(Request(url, headers=headers), timeout=15) as response:
            return response.status
    except HTTPError as error:
        return error.code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--track", action="append", help="Publish only this selection ID; may be repeated")
    args = parser.parse_args()
    tracks = {}
    requested = set(args.track or [])
    found = set()
    for line in INVENTORY.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        track, expected = line.split("=", 1)
        if requested and track not in requested:
            continue
        found.add(track)
        filename, size, digest = expected.split(",")
        if not re.fullmatch(r"[a-z0-9-]+-v[0-9]+\.mp3", filename):
            raise SystemExit(f"{track}: invalid versioned recording filename")
        body = (args.directory / filename).read_bytes()
        if len(body) != int(size) or hashlib.sha256(body).hexdigest() != digest:
            raise SystemExit(f"{track}: original does not match the inventory")
        tracks[PREFIX + filename] = (body, digest)
    if requested - found:
        parser.error("Unknown track selection: " + ", ".join(sorted(requested - found)))
    if not tracks:
        parser.error("No inventoried recordings selected")
    if not args.apply:
        print(f"{len(tracks)} original recordings verified locally. Use --apply to publish.")
        return

    from botocore.session import get_session
    from botocore.exceptions import ClientError
    from botocore.config import Config

    read_env = runpy.run_path(str(ROOT / "scripts/sync-public-assets.py"))["read_env"]
    env = {**read_env(ROOT / "backend/.env"), **os.environ}
    session = get_session()
    if env.get("AWS_ACCESS_KEY_ID") and env.get("AWS_SECRET_ACCESS_KEY"):
        session.set_credentials(env["AWS_ACCESS_KEY_ID"], env["AWS_SECRET_ACCESS_KEY"], env.get("AWS_SESSION_TOKEN") or None)
    region = env.get("AWS_REGION") or "ap-northeast-2"
    bucket = env.get("S3_BUCKET") or "sorow-aws-s3"
    cdn = (env.get("CDN_BASE_URL") or "https://cdn.sorow.co.kr").rstrip("/")
    s3_url = f"https://{bucket}.s3.{region}.amazonaws.com"
    s3 = session.create_client("s3", region_name=region, config=Config(connect_timeout=8, read_timeout=20))
    if not cdn.startswith("https://") or public_status(cdn + "/beach/fx/bamboo-field-crickets-v3.mp3") not in (200, 206):
        raise SystemExit("Public CDN control failed; stopping before any upload.")

    def put(key, body, digest):
        s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType="audio/mpeg", CacheControl="private, no-store",
                      ServerSideEncryption="aws:kms", SSEKMSKeyId="alias/aws/s3", IfNoneMatch="*", Metadata={"sha256": digest})

    def verify(key, digest):
        obj = s3.get_object(Bucket=bucket, Key=key)
        with obj["Body"] as stream:
            valid = hashlib.sha256(stream.read()).hexdigest() == digest
        if not valid or obj.get("ServerSideEncryption") != "aws:kms" or obj.get("ContentType") != "audio/mpeg":
            raise SystemExit(f"{key}: signed read or encryption check failed")
        if any(public_status(base + "/" + key) != 403 for base in (cdn, s3_url)):
            raise SystemExit(f"{key}: anonymous reads must be forbidden at both origins")

    probe = PREFIX + "probe-" + uuid.uuid4().hex + ".mp3"
    sample = b"Harmless room-audio visibility check."
    probe_hash = hashlib.sha256(sample).hexdigest()
    put(probe, sample, probe_hash)
    try:
        verify(probe, probe_hash)
    finally:
        s3.delete_object(Bucket=bucket, Key=probe)
    for key, (body, digest) in tracks.items():
        try:
            put(key, body, digest)
        except ClientError as error:
            if error.response["Error"]["Code"] != "PreconditionFailed":
                raise
        verify(key, digest)
        print(f"{key}: {len(body)} bytes, SHA-256 {digest}, signed GET verified, anonymous CDN and S3 denied")


if __name__ == "__main__":
    main()
