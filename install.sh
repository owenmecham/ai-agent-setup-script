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

  # Stop old process and restart
  echo ""
  check "Stopping Murph"
  if pkill -f "tsx packages/core/src/cli.ts" 2>/dev/null; then
    sleep 2
    ok
  else
    echo -e "${YELLOW}Not running${NC}"
  fi

  check "Starting Murph"
  nohup pnpm murph start >> "$INSTALL_DIR/murph.log" 2>&1 &
  sleep 3

  # Quick health check
  if pgrep -f "tsx packages/core/src/cli.ts" &>/dev/null; then
    ok
  else
    fail "Murph failed to start. Check $INSTALL_DIR/murph.log"
    exit 1
  fi

  echo ""
  echo -e "${GREEN}Update complete! Murph is running.${NC}"
  echo "Logs: $INSTALL_DIR/murph.log"
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

# 6. Node.js (via nvm)
check "Node.js 20+"
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [[ "$NODE_MAJOR" -ge 20 ]]; then
  skip
else
  installing
  if ! command -v nvm &>/dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
  nvm install 20
  nvm use 20
  ok
fi

# 6. pnpm
check "pnpm"
if command -v pnpm &>/dev/null; then
  skip
else
  installing
  corepack enable
  corepack prepare pnpm@latest --activate
  ok
fi

# 7. Python 3
check "Python 3"
if command -v python3 &>/dev/null; then
  skip
else
  installing
  brew install python@3.12
  ok
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

check "pgvector extension"
if brew list pgvector &>/dev/null; then
  skip
else
  installing
  brew install pgvector
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

  if ! psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' 2>/dev/null; then
    fail "Failed to create uuid-ossp extension."
    exit 1
  fi

  if ! psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "vector";' 2>/dev/null; then
    fail "Failed to create vector extension. Make sure pgvector is installed."
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

# 11. Claude Desktop
check "Claude Desktop"
if [ -d "/Applications/Claude.app" ]; then
  skip
else
  installing
  brew install --cask claude
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

# 13. Playwright
check "Playwright Chromium"
if npx playwright --version &>/dev/null 2>&1; then
  skip
else
  installing
  npx playwright install chromium
  ok
fi

echo ""
echo "======================================"
echo "  Installing project dependencies..."
echo "======================================"
pnpm install

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
echo "  2. Set up secrets:"
echo "     pnpm murph secret set TELEGRAM_BOT_TOKEN <your-token>"
echo "     pnpm murph secret set BLUEBUBBLES_PASSWORD <your-password>"
echo ""
echo "  3. BlueBubbles setup (for iMessage):"
echo "     - Download BlueBubbles from https://bluebubbles.app"
echo "     - Enable Private API in BlueBubbles settings"
echo "     - Configure REST API on port 1234"
echo "     - Set webhook URL to http://localhost:3142/webhook"
echo ""
echo "  4. Google API setup (for Gmail/Drive):"
echo "     - Create a project in Google Cloud Console"
echo "     - Enable Gmail and Drive APIs"
echo "     - Create OAuth 2.0 credentials"
echo "     - Download credentials.json"
echo ""
echo "  5. macOS Permissions:"
echo "     - Grant Full Disk Access to your terminal app"
echo "     - Grant Accessibility access for AppleScript"
echo ""
echo "  6. Run diagnostics:"
echo "     pnpm murph doctor"
echo ""
echo "  7. Start Murph:"
echo "     cd $INSTALL_DIR && pnpm murph start"
echo ""
echo "  To update Murph later (code only):"
echo "     $INSTALL_DIR/install.sh --update"
echo ""
echo "  For a full re-install (tools + code):"
echo "     $INSTALL_DIR/install.sh"
echo ""
