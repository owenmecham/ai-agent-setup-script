#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check() { printf "  %-40s" "$1..."; }
ok() { echo -e "${GREEN}OK${NC}"; }
installing() { echo -e "${YELLOW}Installing...${NC}"; }
skip() { echo -e "${GREEN}Already installed${NC}"; }
fail() { echo -e "${RED}FAILED${NC}"; echo "  $1"; }

# Ensure brew runs under native ARM on Apple Silicon (avoids Rosetta 2 conflicts)
if [ "$(uname -m)" = "arm64" ] || [ -d /opt/homebrew ]; then
  brew() { arch -arm64 /opt/homebrew/bin/brew "$@"; }
elif [ -x /usr/local/bin/brew ]; then
  brew() { /usr/local/bin/brew "$@"; }
fi

# Parse flags
UPDATE_ONLY=false
SKIP_CONFIRM=false
for arg in "$@"; do
  case "$arg" in
    --update|-u) UPDATE_ONLY=true ;;
    --yes|-y) SKIP_CONFIRM=true ;;
  esac
done

# --- Update-only path ---
if [ "$UPDATE_ONLY" = true ]; then
  echo "======================================"
  echo "  Murph Update"
  echo "======================================"
  echo ""

  # Detect install directory
  INSTALL_DIR="$HOME/murph"
  if git -C "$(pwd)" remote get-url origin 2>/dev/null | grep -q "ai-agent-setup-script"; then
    INSTALL_DIR="$(pwd)"
  fi

  # Pull latest code
  check "Pulling latest code"
  if git -C "$INSTALL_DIR" pull --ff-only; then
    ok
  else
    fail "Git pull failed. Run the full installer or resolve conflicts in $INSTALL_DIR."
    exit 1
  fi

  cd "$INSTALL_DIR"

  # Install deps, build, migrate
  echo ""
  echo "Installing dependencies..."
  pnpm install

  echo ""
  echo "Building..."
  pnpm build

  echo ""
  echo "Running migrations..."
  pnpm run migrate

  # Stop and restart via LaunchAgent
  echo ""
  AGENT_LABEL="com.murph.agent"
  PLIST="$HOME/Library/LaunchAgents/${AGENT_LABEL}.plist"

  if launchctl list "$AGENT_LABEL" &>/dev/null 2>&1; then
    # LaunchAgent is loaded — stop it (KeepAlive will restart with new code)
    check "Restarting Murph via LaunchAgent"
    launchctl stop "$AGENT_LABEL" 2>/dev/null || true
    sleep 3

    # Verify it came back
    if launchctl list "$AGENT_LABEL" &>/dev/null 2>&1; then
      ok
    else
      fail "Agent did not restart. Check: launchctl list $AGENT_LABEL"
    fi
  else
    # LaunchAgent not installed — install it, then start
    check "Installing LaunchAgent"
    # Generate plist using the installer module
    if [ -f "$INSTALL_DIR/packages/installer/dist/launchctl.js" ]; then
      node -e "
        import('$INSTALL_DIR/packages/installer/dist/launchctl.js').then(m => {
          const plist = m.buildAgentPlist('$INSTALL_DIR');
          m.installAgent(m.AGENT_LABEL, plist);
        });
      " 2>/dev/null && ok || {
        # Fallback: use nohup if installer module is not available
        echo -e "${YELLOW}LaunchAgent module not available, using nohup fallback${NC}"
        # Kill any existing processes
        pkill -f "tsx packages/core/src/cli.ts" 2>/dev/null || true
        PORT_PIDS="$(lsof -ti :3140 2>/dev/null || true)"
        [ -n "$PORT_PIDS" ] && echo "$PORT_PIDS" | xargs kill 2>/dev/null || true
        DASH_PIDS="$(lsof -ti :3141 2>/dev/null || true)"
        [ -n "$DASH_PIDS" ] && echo "$DASH_PIDS" | xargs kill 2>/dev/null || true
        rm -f "$HOME/.murph/agent.sock"
        sleep 2

        nohup pnpm murph start >> "$INSTALL_DIR/murph.log" 2>&1 &
        sleep 3
        if pgrep -f "tsx packages/core/src/cli.ts" &>/dev/null; then
          ok
        else
          fail "Murph failed to start. Check $INSTALL_DIR/murph.log"
          exit 1
        fi
      }
    else
      # Installer module not built — fallback to nohup
      echo -e "${YELLOW}Using nohup fallback (LaunchAgent module not built)${NC}"
      pkill -f "tsx packages/core/src/cli.ts" 2>/dev/null || true
      PORT_PIDS="$(lsof -ti :3140 2>/dev/null || true)"
      [ -n "$PORT_PIDS" ] && echo "$PORT_PIDS" | xargs kill 2>/dev/null || true
      DASH_PIDS="$(lsof -ti :3141 2>/dev/null || true)"
      [ -n "$DASH_PIDS" ] && echo "$DASH_PIDS" | xargs kill 2>/dev/null || true
      rm -f "$HOME/.murph/agent.sock"
      sleep 2

      nohup pnpm murph start >> "$INSTALL_DIR/murph.log" 2>&1 &
      sleep 3
      if pgrep -f "tsx packages/core/src/cli.ts" &>/dev/null; then
        ok
      else
        fail "Murph failed to start. Check $INSTALL_DIR/murph.log"
        exit 1
      fi
    fi
  fi

  echo ""
  echo -e "${GREEN}Update complete! Murph is running.${NC}"
  echo "Agent logs: ~/.murph/agent.stdout.log"
  echo "Dashboard: http://localhost:3141"
  exit 0
fi

# --- Full install path ---
echo "======================================"
echo "  Murph AI Agent Framework Installer"
echo "======================================"
echo ""

# Prerequisites check
echo "Before running this installer, ensure the following are complete:"
echo ""
echo "  1. A dedicated Apple ID has been created for this machine"
echo "     - Create one at https://appleid.apple.com"
echo "  2. This Mac is signed into that Apple ID"
echo "     - System Settings > Apple ID > Sign In"
echo "  3. iMessage is signed in and active with that Apple ID"
echo "     - Open Messages.app > Settings > iMessage > Sign In"
echo ""

# Allow skipping with --yes flag (for updates/CI)
if [ "$SKIP_CONFIRM" = false ]; then
  read -rp "Have you completed these steps? (y/N) " prereq_confirm
  if [[ "$prereq_confirm" != [yY] ]]; then
    echo "Please complete the prerequisites above and re-run this script."
    exit 0
  fi
fi
echo ""

# 1. macOS check
check "macOS"
if [[ "$(uname)" != "Darwin" ]]; then
  fail "Murph requires macOS"
  exit 1
fi
ok

# 2. Xcode CLI tools
check "Xcode CLI tools"
if xcode-select -p &>/dev/null; then
  skip
else
  installing
  xcode-select --install 2>/dev/null || true
  echo ""
  echo "  Xcode CLI tools installer launched."
  echo "  Please click 'Install' in the dialog that appeared."
  echo ""
  printf "  Waiting for installation to complete"
  XCODE_TRIES=0
  until xcode-select -p &>/dev/null; do
    XCODE_TRIES=$((XCODE_TRIES + 1))
    if [ "$XCODE_TRIES" -ge 120 ]; then
      echo ""
      fail "Timed out waiting for Xcode CLI tools. Please install manually and re-run."
      exit 1
    fi
    printf "."
    sleep 5
  done
  echo ""
  ok
fi

# 3. Homebrew
check "Homebrew"
if command -v brew &>/dev/null; then
  skip
else
  installing
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for the rest of this script (Apple Silicon or Intel)
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  ok
fi

# 4. Git
check "Git"
if command -v git &>/dev/null; then
  skip
else
  installing
  brew install git
  ok
fi

# 5. Murph source code
REPO_URL="https://github.com/owenmecham/ai-agent-setup-script.git"
INSTALL_DIR="$HOME/murph"

# Detect if we're already inside the repo
if git -C "$(pwd)" remote get-url origin 2>/dev/null | grep -q "ai-agent-setup-script"; then
  INSTALL_DIR="$(pwd)"
fi

check "Murph source code"
if [ -d "$INSTALL_DIR/.git" ]; then
  # Existing install — pull latest
  echo -e "${YELLOW}Updating...${NC}"
  git -C "$INSTALL_DIR" pull --ff-only || {
    fail "Git pull failed. Resolve conflicts in $INSTALL_DIR and re-run."
    exit 1
  }
else
  installing
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
ok

# Change to install directory for remaining steps
cd "$INSTALL_DIR"

# 6. Node.js (official .pkg installer)
check "Node.js 22+"
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [[ "$NODE_MAJOR" -ge 22 ]]; then
  skip
else
  installing
  NODE_VERSION="v22.15.0"
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}.pkg" -o "/tmp/node-${NODE_VERSION}.pkg"
  sudo installer -pkg "/tmp/node-${NODE_VERSION}.pkg" -target /
  rm -f "/tmp/node-${NODE_VERSION}.pkg"
  ok
fi

# Clean up legacy ~/murph/bin/node from previous NVM-based installs
[ -f "$HOME/murph/bin/node" ] && rm -f "$HOME/murph/bin/node"

# 6. pnpm
check "pnpm"
if command -v pnpm &>/dev/null; then
  skip
else
  installing
  sudo corepack enable
  sudo corepack prepare pnpm@latest --activate
  ok
fi

# Ensure pnpm global bin directory exists (needed for pnpm add -g)
export PNPM_HOME="$HOME/Library/pnpm"
mkdir -p "$PNPM_HOME"
export PATH="$PNPM_HOME:$PATH"

# 7. Python 3
check "Python 3"
if command -v python3 &>/dev/null; then
  skip
else
  installing
  brew install python@3.12
  ok
fi

# 7b. uv (Python package manager — needed for Plaud MCP)
check "uv (Python package manager)"
if command -v uv &>/dev/null; then
  skip
else
  installing
  brew install uv
  ok
fi

# Ensure uv tool binaries are on PATH
export PATH="$HOME/.local/bin:$PATH"
if ! grep -q '\.local/bin' "$HOME/.zshrc" 2>/dev/null; then
  cat >> "$HOME/.zshrc" <<'ZSHRC'

# uv tool binaries
export PATH="$HOME/.local/bin:$PATH"
ZSHRC
fi

# 8. PostgreSQL + pgvector
check "PostgreSQL 16"
if brew list postgresql@16 &>/dev/null; then
  skip
else
  installing
  brew install postgresql@16
  ok
fi

# Ensure PostgreSQL binaries are on PATH (keg-only formula)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
if ! grep -q 'postgresql@16/bin' "$HOME/.zshrc" 2>/dev/null; then
  cat >> "$HOME/.zshrc" <<'ZSHRC'

# PostgreSQL 16 (Homebrew keg-only)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
ZSHRC
fi

check "pgvector extension"
PG_CONFIG="/opt/homebrew/opt/postgresql@16/bin/pg_config"
VECTOR_CONTROL="$("$PG_CONFIG" --sharedir)/extension/vector.control"
if [ -f "$VECTOR_CONTROL" ]; then
  skip
else
  installing
  # Build from source against postgresql@16 (brew pgvector targets the
  # default postgresql formula, which may be a different major version)
  brew install gcc make git 2>/dev/null || true
  PGVECTOR_TMPDIR="$(mktemp -d)"
  git clone --branch v0.8.0 --depth 1 https://github.com/pgvector/pgvector.git "$PGVECTOR_TMPDIR"
  make -C "$PGVECTOR_TMPDIR" PG_CONFIG="$PG_CONFIG"
  make -C "$PGVECTOR_TMPDIR" install PG_CONFIG="$PG_CONFIG"
  rm -rf "$PGVECTOR_TMPDIR"
  ok
fi

# Verify PostgreSQL is running with retry loop
check "PostgreSQL service"
if brew services list | grep postgresql@16 | grep started &>/dev/null; then
  skip
else
  installing
  brew services start postgresql@16

  PG_READY=false
  for i in $(seq 1 15); do
    if pg_isready -q 2>/dev/null; then
      PG_READY=true
      break
    fi
    sleep 2
  done

  if [ "$PG_READY" = false ]; then
    fail "PostgreSQL failed to start after 30 seconds. Check: brew services list"
    exit 1
  fi
  ok
fi

# Create database with proper error checking
check "Murph database"
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw murph; then
  skip
else
  installing
  if ! createdb murph 2>/dev/null; then
    fail "Failed to create database 'murph'. Check PostgreSQL is running and your user has permissions."
    exit 1
  fi

  if ! psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'; then
    fail "Failed to create uuid-ossp extension."
    exit 1
  fi

  if ! psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "vector";'; then
    fail "Failed to create vector extension. Verify pgvector is installed: ls \"\$(pg_config --sharedir)/extension/vector.control\""
    exit 1
  fi

  # Verify database is accessible
  if ! psql -d murph -c "SELECT 1;" &>/dev/null; then
    fail "Database 'murph' was created but is not accessible."
    exit 1
  fi
  ok
fi

# 9. Ollama
check "Ollama"
if command -v ollama &>/dev/null; then
  skip
else
  installing
  brew install ollama
  ok
fi

# Ensure Ollama is running before pulling models
check "Ollama service"
if curl -sf http://localhost:11434/api/tags &>/dev/null; then
  skip
else
  installing
  ollama serve &>/dev/null &
  OLLAMA_PID=$!

  OLLAMA_READY=false
  for i in 1 2 3 4 5 6; do
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
      OLLAMA_READY=true
      break
    fi
    sleep 2
  done

  if [ "$OLLAMA_READY" = false ]; then
    fail "Ollama failed to start. Try running 'ollama serve' manually."
    exit 1
  fi
  ok
fi

check "Ollama nomic-embed-text model"
if ollama list 2>/dev/null | grep -q nomic-embed-text; then
  skip
else
  installing
  ollama pull nomic-embed-text
  ok
fi

# 10. Claude Code CLI
check "Claude Code CLI"
if command -v claude &>/dev/null; then
  skip
else
  installing
  npm install -g @anthropic-ai/claude-code
  ok
fi

# 10a. Google Cloud SDK (required by gws CLI)
check "Google Cloud SDK (gcloud)"
if command -v gcloud &>/dev/null; then
  skip
else
  installing
  brew install --cask google-cloud-sdk
  # Source gcloud shell integration for the current session
  if [ -f "$(brew --prefix)/share/google-cloud-sdk/path.bash.inc" ]; then
    source "$(brew --prefix)/share/google-cloud-sdk/path.bash.inc"
  fi
  ok
fi

# 10b. Google Workspace CLI (auth deferred to `pnpm murph google-auth`)
check "Google Workspace CLI"
if command -v gws &>/dev/null; then
  skip
else
  installing
  npm install -g @googleworkspace/cli@0.6.3
  ok
fi

# Ensure npm global bin is on PATH (needed when nvm was just installed)
NPM_GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin" || true
if [ -n "$NPM_GLOBAL_BIN" ] && [ -d "$NPM_GLOBAL_BIN" ]; then
  export PATH="$NPM_GLOBAL_BIN:$PATH"
fi

# 11. Claude Desktop
check "Claude Desktop"
if [ -d "/Applications/Claude.app" ]; then
  skip
else
  installing
  brew install --cask claude
  ok
fi

# 11b. Obsidian
check "Obsidian"
if [ -d "/Applications/Obsidian.app" ]; then
  skip
else
  installing
  brew install --cask obsidian
  ok
fi

# 11c. Plaud Desktop
check "Plaud Desktop"
if [ -d "/Applications/PLAUD.app" ]; then
  skip
else
  echo -e "${YELLOW}MANUAL STEP${NC}"
  echo "  Download from: https://global.plaud.ai/pages/app-download"
fi

# 11d. Google Chrome
check "Google Chrome"
if [ -d "/Applications/Google Chrome.app" ]; then
  skip
else
  installing
  brew install --cask google-chrome
  ok
fi

# 12. Wrangler (Cloudflare)
check "Wrangler CLI"
if command -v wrangler &>/dev/null; then
  skip
else
  installing
  pnpm add -g wrangler
  ok
fi

# 13. Playwright (installed after pnpm install; just mark as pending here)
# Playwright browsers are installed after pnpm install below, since
# npx would otherwise prompt to download the package and hang the script.

echo ""
echo "======================================"
echo "  Upgrading installed tools..."
echo "======================================"

# Brew formulae (git, python, uv, postgresql, ollama, etc.)
check "Brew formulae upgrades"
brew upgrade 2>/dev/null || true
ok

# Brew casks (Claude Desktop, Obsidian, Google Chrome)
check "Brew cask upgrades"
brew upgrade --cask 2>/dev/null || true
ok

# npm globals (claude-code, gws)
check "npm global upgrades"
npm update -g @anthropic-ai/claude-code 2>/dev/null || true
npm install -g @googleworkspace/cli@0.6.3 2>/dev/null || true
ok

# pnpm globals (wrangler)
check "pnpm global upgrades"
pnpm update -g 2>/dev/null || true
ok

# uv tools (plaud-mcp)
check "uv tool upgrades"
uv tool upgrade --all 2>/dev/null || true
ok

echo ""
echo "======================================"
echo "  Installing project dependencies..."
echo "======================================"
pnpm install

# 13. Playwright Chromium (idempotent — skips if already downloaded)
check "Playwright Chromium"
installing
pnpm dlx playwright@latest install chromium
ok

# 14. Plaud MCP server (optional — requires Plaud Desktop)
check "Plaud MCP server"
if command -v plaud-mcp &>/dev/null; then
  skip
else
  if [ -d "/Applications/PLAUD.app" ]; then
    installing
    uv tool install plaud-mcp --from "git+https://github.com/davidlinjiahao/plaud-mcp"
    ok
  else
    echo -e "${YELLOW}Skipped${NC} (Plaud Desktop not installed)"
  fi
fi

echo ""
echo "======================================"
echo "  Building Murph..."
echo "======================================"
pnpm build

echo ""
echo "======================================"
echo "  Running database migrations..."
echo "======================================"
pnpm run migrate

echo ""
echo "======================================"
echo "  Running post-install verification..."
echo "======================================"

VERIFY_PASS=true

# Verify PostgreSQL connection
check "PostgreSQL connection"
if psql -d murph -c "SELECT 1;" &>/dev/null; then
  ok
else
  fail "Cannot connect to database"
  VERIFY_PASS=false
fi

# Verify extensions
check "PostgreSQL extensions"
if psql -d murph -c "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector');" 2>/dev/null | grep -q vector; then
  ok
else
  fail "Required extensions missing"
  VERIFY_PASS=false
fi

# Verify Ollama responding
check "Ollama API"
if curl -sf http://localhost:11434/api/tags &>/dev/null; then
  ok
else
  fail "Ollama not responding at http://localhost:11434"
  VERIFY_PASS=false
fi

# Verify nomic-embed-text model
check "nomic-embed-text model"
if ollama list 2>/dev/null | grep -q nomic-embed-text; then
  ok
else
  fail "nomic-embed-text model not found"
  VERIFY_PASS=false
fi

# Verify iMessage database access
check "iMessage database access"
if sqlite3 ~/Library/Messages/chat.db "SELECT 1;" &>/dev/null 2>&1; then
  ok
else
  echo -e "${YELLOW}MANUAL STEP REQUIRED${NC}"
  echo "  Grant Full Disk Access to your terminal:"
  echo "  System Settings → Privacy & Security → Full Disk Access → add Terminal.app"
fi

# Verify Claude CLI
check "Claude CLI"
if command -v claude &>/dev/null; then
  ok
else
  fail "claude command not found in PATH"
  VERIFY_PASS=false
fi

# Verify Claude Desktop
check "Claude Desktop"
if [ -d "/Applications/Claude.app" ]; then
  ok
else
  fail "Claude Desktop not found in /Applications"
  VERIFY_PASS=false
fi

# Verify node_modules
check "node_modules"
if [ -d "node_modules" ]; then
  ok
else
  fail "node_modules directory missing"
  VERIFY_PASS=false
fi

if [ "$VERIFY_PASS" = false ]; then
  echo ""
  echo -e "${YELLOW}Installation completed with warnings. Run 'pnpm murph doctor' for details.${NC}"
else
  echo ""
  echo -e "${GREEN}All post-install checks passed.${NC}"
fi

echo ""
echo -e "${GREEN}======================================"
echo "  Murph installation complete!"
echo "======================================${NC}"
echo ""
echo "Installed to: $INSTALL_DIR"
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit $INSTALL_DIR/murph.config.yaml with your settings"
echo ""
echo "  2. iMessage setup:"
echo "     a. Grant Full Disk Access to your terminal:"
echo "        - Open System Settings → Privacy & Security → Full Disk Access"
echo "        - Click the + button"
echo "        - Navigate to Applications → Utilities → Terminal.app"
echo "          (or your preferred terminal: iTerm2, Warp, etc.)"
echo "        - Toggle the switch ON"
echo "        - Quit and reopen your terminal (permissions apply to new processes only)"
echo "     b. Verify access:"
echo "        sqlite3 ~/Library/Messages/chat.db \"SELECT COUNT(*) FROM message;\""
echo "        (Should print a number. If \"operation not permitted\", FDA is not active.)"
echo "     c. Grant Accessibility access for AppleScript (for sending replies):"
echo "        - System Settings → Privacy & Security → Accessibility"
echo "        - Add your terminal app"
echo ""
echo "  3. Telegram setup (if needed):"
echo "     pnpm murph secret set TELEGRAM_BOT_TOKEN <your-token>"
echo ""
echo "  4. Google Workspace setup (optional — run when ready):"
echo "     pnpm murph google-auth"
echo "     (Walks through Google Cloud project setup + browser OAuth)"
echo ""
echo "  5. Plaud Desktop (if needed):"
echo "     Download from https://global.plaud.ai/pages/app-download"
echo "     Sign in, then run: pnpm murph setup-plaud"
echo ""
echo "  6. Run diagnostics:"
echo "     pnpm murph doctor"
echo ""
echo "  7. Start Murph:"
echo "     Option A (recommended): Use the install wizard for LaunchAgent setup:"
echo "       cd $INSTALL_DIR && node packages/installer/dist/server.js"
echo "       Then open http://localhost:3142 in your browser"
echo ""
echo "     Option B (manual):"
echo "       cd $INSTALL_DIR && pnpm murph start"
echo "       Dashboard: http://localhost:3141"
echo ""
echo "  To update Murph later (code only):"
echo "     $INSTALL_DIR/install.sh --update"
echo ""
echo "  For a full re-install (tools + code):"
echo "     $INSTALL_DIR/install.sh"
echo ""
echo -e "${YELLOW}NOTE: If 'claude' or other commands are not found, restart your terminal"
echo -e "or run:  source ~/.zshrc${NC}"
echo ""
