#!/usr/bin/env bash
set -euo pipefail

echo "======================================"
echo "  Murph AI Agent Framework Installer"
echo "======================================"
echo ""

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
  echo "  Please complete the Xcode CLI tools installation and re-run this script."
  exit 0
fi

# 3. Homebrew
check "Homebrew"
if command -v brew &>/dev/null; then
  skip
else
  installing
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
fi

# 4. Git
check "Git"
if command -v git &>/dev/null; then
  skip
else
  installing
  brew install git
fi

# 5. Node.js (via nvm)
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
fi

# 6. pnpm
check "pnpm"
if command -v pnpm &>/dev/null; then
  skip
else
  installing
  corepack enable
  corepack prepare pnpm@latest --activate
fi

# 7. Python 3
check "Python 3"
if command -v python3 &>/dev/null; then
  skip
else
  installing
  brew install python@3.12
fi

# 8. PostgreSQL + pgvector
check "PostgreSQL 16"
if brew list postgresql@16 &>/dev/null; then
  skip
else
  installing
  brew install postgresql@16
fi

check "pgvector extension"
if brew list pgvector &>/dev/null; then
  skip
else
  installing
  brew install pgvector
fi

check "PostgreSQL service"
if brew services list | grep postgresql@16 | grep started &>/dev/null; then
  skip
else
  installing
  brew services start postgresql@16
  sleep 2
fi

check "Murph database"
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw murph; then
  skip
else
  installing
  createdb murph 2>/dev/null || true
  psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' 2>/dev/null || true
  psql -d murph -c 'CREATE EXTENSION IF NOT EXISTS "vector";' 2>/dev/null || true
fi

# 9. Ollama
check "Ollama"
if command -v ollama &>/dev/null; then
  skip
else
  installing
  brew install ollama
fi

check "Ollama nomic-embed-text model"
if ollama list 2>/dev/null | grep -q nomic-embed-text; then
  skip
else
  installing
  ollama pull nomic-embed-text
fi

# 10. Claude Code CLI
check "Claude Code CLI"
if command -v claude &>/dev/null; then
  skip
else
  installing
  npm install -g @anthropic-ai/claude-code
fi

# 11. Wrangler (Cloudflare)
check "Wrangler CLI"
if command -v wrangler &>/dev/null; then
  skip
else
  installing
  pnpm add -g wrangler
fi

# 12. Playwright
check "Playwright Chromium"
if npx playwright --version &>/dev/null 2>&1; then
  skip
else
  installing
  npx playwright install chromium
fi

echo ""
echo "======================================"
echo "  Installing project dependencies..."
echo "======================================"
pnpm install

echo ""
echo "======================================"
echo "  Running database migrations..."
echo "======================================"
pnpm run migrate

echo ""
echo -e "${GREEN}======================================"
echo "  Murph installation complete!"
echo "======================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit murph.config.yaml with your settings"
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
echo "  6. Start Murph:"
echo "     pnpm murph start"
echo ""
