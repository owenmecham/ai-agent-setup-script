#!/usr/bin/env bash
# Build a DMG containing the Murph Installer app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$INSTALLER_DIR/build"
DMG_NAME="Murph-Installer"
DMG_VOLUME="Murph Installer"
DMG_PATH="$BUILD_DIR/${DMG_NAME}.dmg"
STAGING_DIR="$BUILD_DIR/dmg-staging"

# Build the apps first
"$SCRIPT_DIR/build-apps.sh"

echo ""
echo "Building DMG..."

# Clean up staging
rm -rf "$STAGING_DIR" "$DMG_PATH"
mkdir -p "$STAGING_DIR"

# Copy installer app to staging
cp -R "$BUILD_DIR/Murph Installer.app" "$STAGING_DIR/"

# Create Applications symlink
ln -s /Applications "$STAGING_DIR/Applications"

# Create the DMG
hdiutil create \
  -volname "$DMG_VOLUME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

# Clean up staging
rm -rf "$STAGING_DIR"

echo ""
echo "DMG created: $DMG_PATH"
echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
