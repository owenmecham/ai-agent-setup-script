#!/usr/bin/env bash
# Build a self-contained release payload for the Murph installer.
# Output: packages/installer/build/murph-payload.tar.gz
#
# The payload contains pre-built JS, migrations, dashboard standalone build,
# config template, and package manifests. No .git, no TypeScript source, no
# dev dependencies. The installer extracts this to ~/murph and runs
# `pnpm install --prod` to pull runtime node_modules.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BUILD_DIR="$REPO_ROOT/packages/installer/build"
PAYLOAD_DIR="$BUILD_DIR/payload"

echo "=== Building release payload ==="

# --- 1. Build everything first ---
echo "Building all packages..."
(cd "$REPO_ROOT" && pnpm build)

# --- 2. Assemble payload directory ---
echo "Assembling payload..."
rm -rf "$PAYLOAD_DIR"
mkdir -p "$PAYLOAD_DIR/scripts"

# Root files
cp "$REPO_ROOT/package.json" "$PAYLOAD_DIR/"
cp "$REPO_ROOT/pnpm-workspace.yaml" "$PAYLOAD_DIR/"
cp "$REPO_ROOT/pnpm-lock.yaml" "$PAYLOAD_DIR/"
cp "$REPO_ROOT/murph.config.yaml" "$PAYLOAD_DIR/murph.config.yaml.template"

# Migrate script — prefer compiled JS, keep TS as fallback
cp "$REPO_ROOT/scripts/migrate.js" "$PAYLOAD_DIR/scripts/"
cp "$REPO_ROOT/scripts/migrate.ts" "$PAYLOAD_DIR/scripts/"

# Config files (scopes, etc.)
if [ -d "$REPO_ROOT/config" ]; then
  cp -R "$REPO_ROOT/config" "$PAYLOAD_DIR/"
fi

# --- Copy each package: package.json + dist/ ---
copy_package() {
  local src="$1"
  local dest="$PAYLOAD_DIR/$2"
  mkdir -p "$dest"
  cp "$src/package.json" "$dest/"
  if [ -d "$src/dist" ]; then
    cp -R "$src/dist" "$dest/"
  fi
  # Copy tsconfig.json if it exists (needed for path resolution in some cases)
  if [ -f "$src/tsconfig.json" ]; then
    cp "$src/tsconfig.json" "$dest/"
  fi
}

# Core packages
copy_package "$REPO_ROOT/packages/core" "packages/core"
copy_package "$REPO_ROOT/packages/memory" "packages/memory"
copy_package "$REPO_ROOT/packages/knowledge" "packages/knowledge"
copy_package "$REPO_ROOT/packages/security" "packages/security"
copy_package "$REPO_ROOT/packages/config" "packages/config"
copy_package "$REPO_ROOT/packages/scheduler" "packages/scheduler"
copy_package "$REPO_ROOT/packages/creator" "packages/creator"

# Channel packages
copy_package "$REPO_ROOT/packages/channels/imessage" "packages/channels/imessage"
copy_package "$REPO_ROOT/packages/channels/telegram" "packages/channels/telegram"

# Integration packages
for integ in "$REPO_ROOT"/packages/integrations/*/; do
  integ_name="$(basename "$integ")"
  if [ -f "$integ/package.json" ]; then
    copy_package "$integ" "packages/integrations/$integ_name"
  fi
done

# Installer (needed for self-update and launchctl helpers)
copy_package "$REPO_ROOT/packages/installer" "packages/installer"

# Dashboard — needs standalone build + static assets
copy_package "$REPO_ROOT/packages/dashboard" "packages/dashboard"
if [ -d "$REPO_ROOT/packages/dashboard/.next/standalone" ]; then
  mkdir -p "$PAYLOAD_DIR/packages/dashboard/.next"
  cp -R "$REPO_ROOT/packages/dashboard/.next/standalone" "$PAYLOAD_DIR/packages/dashboard/.next/"
  if [ -d "$REPO_ROOT/packages/dashboard/.next/static" ]; then
    cp -R "$REPO_ROOT/packages/dashboard/.next/static" "$PAYLOAD_DIR/packages/dashboard/.next/"
  fi
  # Next.js standalone also needs the static files inside standalone/packages/dashboard
  if [ -d "$REPO_ROOT/packages/dashboard/.next/static" ]; then
    mkdir -p "$PAYLOAD_DIR/packages/dashboard/.next/standalone/packages/dashboard/.next/"
    cp -R "$REPO_ROOT/packages/dashboard/.next/static" "$PAYLOAD_DIR/packages/dashboard/.next/standalone/packages/dashboard/.next/"
  fi
fi

# --- Copy migration SQL files ---
echo "Copying migrations..."
for migdir in "$REPO_ROOT"/packages/*/src/migrations; do
  if [ -d "$migdir" ]; then
    pkg_name="$(basename "$(dirname "$(dirname "$migdir")")")"
    dest="$PAYLOAD_DIR/packages/$pkg_name/src/migrations"
    mkdir -p "$dest"
    cp "$migdir"/*.sql "$dest/"
  fi
done

# --- 3. Create tarball ---
echo "Creating tarball..."
mkdir -p "$BUILD_DIR"
(cd "$PAYLOAD_DIR" && tar czf "$BUILD_DIR/murph-payload.tar.gz" .)

PAYLOAD_SIZE=$(du -sh "$BUILD_DIR/murph-payload.tar.gz" | cut -f1)
echo "=== Payload built: $BUILD_DIR/murph-payload.tar.gz ($PAYLOAD_SIZE) ==="
