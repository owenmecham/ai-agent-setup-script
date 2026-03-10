#!/usr/bin/env bash
# Build the Murph .app bundles
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$INSTALLER_DIR/build"

PAYLOAD="$BUILD_DIR/murph-payload.tar.gz"

echo "Building Murph app bundles..."

# Preserve payload if it exists (built by build-payload.sh)
if [ -f "$PAYLOAD" ]; then
  cp "$PAYLOAD" /tmp/murph-payload-keep.tar.gz
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Restore payload
if [ -f /tmp/murph-payload-keep.tar.gz ]; then
  mv /tmp/murph-payload-keep.tar.gz "$PAYLOAD"
fi

# --- Build "Murph Installer.app" ---
INSTALLER_APP="$BUILD_DIR/Murph Installer.app"
mkdir -p "$INSTALLER_APP/Contents/MacOS"
mkdir -p "$INSTALLER_APP/Contents/Resources"

cp "$INSTALLER_DIR/bootstrap/Info.plist" "$INSTALLER_APP/Contents/Info.plist"
cp "$INSTALLER_DIR/bootstrap/launcher" "$INSTALLER_APP/Contents/MacOS/launcher"
chmod +x "$INSTALLER_APP/Contents/MacOS/launcher"

# Copy icon if it exists
if [ -f "$INSTALLER_DIR/bootstrap/murph.icns" ]; then
  cp "$INSTALLER_DIR/bootstrap/murph.icns" "$INSTALLER_APP/Contents/Resources/murph.icns"
fi

# Embed payload in .app Resources
if [ -f "$PAYLOAD" ]; then
  cp "$PAYLOAD" "$INSTALLER_APP/Contents/Resources/murph-payload.tar.gz"
  echo "  Embedded payload ($(du -sh "$PAYLOAD" | cut -f1))"
else
  echo "  WARNING: No payload found at $PAYLOAD"
  echo "  Run build-payload.sh first for a self-contained installer."
fi

echo "  Built: Murph Installer.app"

# --- Build "Murph.app" (dashboard launcher) ---
MURPH_APP="$BUILD_DIR/Murph.app"
mkdir -p "$MURPH_APP/Contents/MacOS"
mkdir -p "$MURPH_APP/Contents/Resources"


# Create the Murph.app launcher script
cat > "$MURPH_APP/Contents/MacOS/murph" << 'LAUNCHER'
#!/usr/bin/env bash
# Murph.app - Opens the dashboard, starting the agent if needed

AGENT_LABEL="com.murph.agent"

# Check if agent is running
if ! launchctl list "$AGENT_LABEL" &>/dev/null; then
  # Try to load it
  PLIST="$HOME/Library/LaunchAgents/${AGENT_LABEL}.plist"
  if [ -f "$PLIST" ]; then
    launchctl load "$PLIST" 2>/dev/null || true
    launchctl start "$AGENT_LABEL" 2>/dev/null || true
    sleep 3
  else
    osascript -e 'display alert "Murph" message "Murph is not installed. Please run the Murph Installer first." as warning' 2>/dev/null
    exit 1
  fi
fi

# Open dashboard
open "http://localhost:3141"
LAUNCHER
chmod +x "$MURPH_APP/Contents/MacOS/murph"

# Create Info.plist for Murph.app
cat > "$MURPH_APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Murph</string>
  <key>CFBundleDisplayName</key>
  <string>Murph</string>
  <key>CFBundleIdentifier</key>
  <string>com.murph.app</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>murph</string>
  <key>CFBundleIconFile</key>
  <string>murph</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSUIElement</key>
  <false/>
</dict>
</plist>
PLIST

# Copy icon if it exists
if [ -f "$INSTALLER_DIR/bootstrap/murph.icns" ]; then
  cp "$INSTALLER_DIR/bootstrap/murph.icns" "$MURPH_APP/Contents/Resources/murph.icns"
fi

echo "  Built: Murph.app"

# --- Build "Update Murph.app" ---
UPDATE_APP="$BUILD_DIR/Update Murph.app"
mkdir -p "$UPDATE_APP/Contents/MacOS"
mkdir -p "$UPDATE_APP/Contents/Resources"

cat > "$UPDATE_APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Update Murph</string>
  <key>CFBundleDisplayName</key>
  <string>Update Murph</string>
  <key>CFBundleIdentifier</key>
  <string>com.murph.updater</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>update-murph</string>
  <key>CFBundleIconFile</key>
  <string>murph</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

cat > "$UPDATE_APP/Contents/MacOS/update-murph" << 'LAUNCHER'
#!/usr/bin/env bash
if [ -z "$TERM_PROGRAM" ]; then
  open -a Terminal "$0"
  exit 0
fi

echo "======================================"
echo "  Murph Updater"
echo "======================================"
echo ""

if [ -f "$HOME/murph/install.sh" ]; then
  "$HOME/murph/install.sh" --update --yes
  echo ""
  osascript -e 'display notification "Murph has been updated and restarted." with title "Murph"' 2>/dev/null || true
else
  echo "ERROR: install.sh not found at ~/murph/install.sh"
  echo "Please run the full installer first."
  exit 1
fi

echo ""
echo "You can close this window."
read -rsp "Press any key to exit..." -n1
LAUNCHER
chmod +x "$UPDATE_APP/Contents/MacOS/update-murph"

if [ -f "$INSTALLER_DIR/bootstrap/murph.icns" ]; then
  cp "$INSTALLER_DIR/bootstrap/murph.icns" "$UPDATE_APP/Contents/Resources/murph.icns"
fi

echo "  Built: Update Murph.app"
echo ""
echo "App bundles are in: $BUILD_DIR/"
