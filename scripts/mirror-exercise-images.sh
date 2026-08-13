#!/usr/bin/env bash
#
# Mirrors the free-exercise-db exercise images into our own object storage
# (Cloudflare R2 or AWS S3), so the app never depends on someone else's GitHub
# repo staying online. Run this once per environment; it is safe to re-run.
#
# Prerequisites:
#   - awscli v2 installed (R2 speaks the S3 API)
#   - a bucket that serves objects publicly (R2 public bucket or S3 + CloudFront)
#
# Usage:
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
#   # R2 only — omit for AWS S3:
#   export S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
#   ./scripts/mirror-exercise-images.sh xrep-exercise-images
#
# Then point the backend at the bucket's public base URL:
#   EXERCISE_IMAGE_BASE_URL=https://images.yourdomain.com/exercises
# and restart — the seeder rewrites every image_url on the next boot.

set -euo pipefail

BUCKET="${1:-}"
PREFIX="${2:-exercises}"
WORKDIR="${TMPDIR:-/tmp}/free-exercise-db-images"
REPO="https://github.com/yuhonas/free-exercise-db.git"

if [[ -z "$BUCKET" ]]; then
  echo "usage: $0 <bucket-name> [key-prefix]" >&2
  exit 1
fi

endpoint_args=()
if [[ -n "${S3_ENDPOINT:-}" ]]; then
  endpoint_args=(--endpoint-url "$S3_ENDPOINT")
fi

echo "==> Fetching images (sparse checkout, ~200MB)"
if [[ -d "$WORKDIR/.git" ]]; then
  git -C "$WORKDIR" fetch --depth 1 origin main
  git -C "$WORKDIR" reset --hard origin/main
else
  rm -rf "$WORKDIR"
  git clone --depth 1 --filter=blob:none --sparse "$REPO" "$WORKDIR"
  git -C "$WORKDIR" sparse-checkout set exercises
fi

count=$(find "$WORKDIR/exercises" -name '*.jpg' | wc -l)
echo "==> Found $count images"

echo "==> Uploading to s3://$BUCKET/$PREFIX"
aws "${endpoint_args[@]}" s3 sync "$WORKDIR/exercises" "s3://$BUCKET/$PREFIX" \
  --exclude '*' --include '*.jpg' \
  --content-type image/jpeg \
  --cache-control 'public, max-age=31536000, immutable' \
  --size-only

echo
echo "==> Done. Now set:"
echo "    EXERCISE_IMAGE_BASE_URL=<public-base-url>/$PREFIX"
echo "    and restart the backend so the seeder rewrites image_url."
