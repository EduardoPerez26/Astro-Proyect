#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT/releases}"
VERSION="${2:-$(date +%Y-%m-%d)}"
SOURCE_STAGE="$OUT_DIR/source-stage"
DEPLOY_STAGE="$OUT_DIR/deploy-stage"
SOURCE_ZIP="$OUT_DIR/XBFS-Operations-Hub-Corporate-Source-$VERSION.zip"
DEPLOY_ZIP="$OUT_DIR/XBFS-Operations-Hub-Corporate-Deploy-$VERSION.zip"

rm -rf "$SOURCE_STAGE" "$DEPLOY_STAGE"
mkdir -p "$SOURCE_STAGE" "$DEPLOY_STAGE" "$OUT_DIR"

EXCLUDES=(
  --exclude='.git/'
  --exclude='node_modules/'
  --exclude='backend/node_modules/'
  --exclude='.astro/'
  --exclude='dist/'
  --exclude='.env'
  --exclude='*.env'
  --exclude='!*.env.example'
  --exclude='.codex-*'
  --exclude='backend/uploads/***'
  --exclude='backend/generated/reports/***'
  --exclude='*.zip'
  --exclude='*.log'
  --exclude='coverage/'
  --exclude='releases/'
)

rsync -a "${EXCLUDES[@]}" "$ROOT/" "$SOURCE_STAGE/"
mkdir -p "$SOURCE_STAGE/backend/uploads/perfiles" "$SOURCE_STAGE/backend/uploads/schedules" "$SOURCE_STAGE/backend/uploads/prepaid-schedules" "$SOURCE_STAGE/backend/generated/reports"
touch "$SOURCE_STAGE/backend/uploads/.gitkeep" "$SOURCE_STAGE/backend/uploads/perfiles/.gitkeep" "$SOURCE_STAGE/backend/uploads/schedules/.gitkeep" "$SOURCE_STAGE/backend/uploads/prepaid-schedules/.gitkeep" "$SOURCE_STAGE/backend/generated/reports/.gitkeep"

mkdir -p "$DEPLOY_STAGE/frontend" "$DEPLOY_STAGE/backend"
rsync -a "$ROOT/dist/" "$DEPLOY_STAGE/frontend/"
rsync -a --exclude='node_modules/' --exclude='.env' --exclude='uploads/***' --exclude='generated/reports/***' --exclude='*.zip' --exclude='*.log' "$ROOT/backend/" "$DEPLOY_STAGE/backend/"
mkdir -p "$DEPLOY_STAGE/backend/uploads/perfiles" "$DEPLOY_STAGE/backend/uploads/schedules" "$DEPLOY_STAGE/backend/uploads/prepaid-schedules" "$DEPLOY_STAGE/backend/generated/reports"
touch "$DEPLOY_STAGE/backend/uploads/.gitkeep" "$DEPLOY_STAGE/backend/uploads/perfiles/.gitkeep" "$DEPLOY_STAGE/backend/uploads/schedules/.gitkeep" "$DEPLOY_STAGE/backend/uploads/prepaid-schedules/.gitkeep" "$DEPLOY_STAGE/backend/generated/reports/.gitkeep"
cp "$ROOT/docs/DEPLOYMENT.md" "$DEPLOY_STAGE/README-DEPLOY.md"
cp "$ROOT/CHANGELOG-CORPORATE.md" "$DEPLOY_STAGE/CHANGELOG-CORPORATE.md"

rm -f "$SOURCE_ZIP" "$DEPLOY_ZIP"
(cd "$SOURCE_STAGE" && zip -qr "$SOURCE_ZIP" .)
(cd "$DEPLOY_STAGE" && zip -qr "$DEPLOY_ZIP" .)
sha256sum "$SOURCE_ZIP" "$DEPLOY_ZIP" > "$OUT_DIR/SHA256SUMS-$VERSION.txt"

printf '%s\n%s\n' "$SOURCE_ZIP" "$DEPLOY_ZIP"
