#!/bin/bash
set -euo pipefail

# ── Cocapn Sandbox Installer ────────────────────────────────────────
# Usage: curl -sSL https://raw.githubusercontent.com/CedarBeach2019/cocapn/main/docker-sandbox/install.sh | bash
# Or:   bash install.sh
# ─────────────────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()  { echo -e "${GREEN}[info]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[warn]${RESET} $*"; }
error() { echo -e "${RED}[error]${RESET} $*"; exit 1; }

REPO="https://github.com/CedarBeach2019/cocapn.git"
SANDBOX_DIR="cocapn/docker-sandbox"

# ── Prerequisites ────────────────────────────────────────────────────

info "Checking prerequisites..."

command -v git >/dev/null 2>&1   || error "git is required. Install it first."
command -v docker >/dev/null 2>&1 || error "docker is required. Install it first."

docker info >/dev/null 2>&1 || error "Docker daemon is not running. Start it first."

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  error "docker compose (v2) or docker-compose is required."
fi

info "Prerequisites OK."

# ── Clone ────────────────────────────────────────────────────────────

if [ -d "cocapn" ]; then
  warn "cocapn/ directory already exists. Using existing clone."
  warn "Pulling latest changes..."
  (cd cocapn && git pull --ff-only) || warn "Could not pull — continuing with local state."
else
  info "Cloning cocapn (shallow)..."
  git clone --depth 1 "$REPO"
fi

cd "$SANDBOX_DIR" || error "Sandbox directory not found."

# ── Configure ────────────────────────────────────────────────────────

if [ -f ".env" ]; then
  warn ".env already exists. Leaving it unchanged."
else
  info "Setting up configuration..."
  cp .env.example .env

  # Prompt for API key if not headless
  if [ -t 0 ]; then
    echo ""
    echo -e "${BOLD}Which LLM provider do you want to use?${RESET}"
    echo "  1) DeepSeek (default, cheapest)"
    echo "  2) OpenAI"
    echo "  3) Anthropic"
    read -rp "Enter choice [1-3]: " provider_choice

    case "$provider_choice" in
      2)
        read -rsp "Enter your OpenAI API key: " openai_key
        echo
        sed -i "s|^# OPENAI_API_KEY=.*|OPENAI_API_KEY=${openai_key}|" .env
        sed -i "s|^COCAPN_NAME=.*|COCAPN_NAME=My Agent (OpenAI)|" .env
        ;;
      3)
        read -rsp "Enter your Anthropic API key: " anthropic_key
        echo
        sed -i "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${anthropic_key}|" .env
        sed -i "s|^COCAPN_NAME=.*|COCAPN_NAME=My Agent (Anthropic)|" .env
        ;;
      *)
        read -rsp "Enter your DeepSeek API key: " deepseek_key
        echo
        sed -i "s|^DEEPSEEK_API_KEY=.*|DEEPSEEK_API_KEY=${deepseek_key}|" .env
        ;;
    esac
  else
    warn "Running headless — set API keys in .env manually before starting."
  fi
fi

# ── Build ────────────────────────────────────────────────────────────

info "Building Docker image (this may take a few minutes)..."
$COMPOSE build

# ── Start ────────────────────────────────────────────────────────────

info "Starting cocapn sandbox..."
$COMPOSE up -d

# ── Verify ───────────────────────────────────────────────────────────

info "Waiting for health check..."
retries=0
max_retries=30
while [ $retries -lt $max_retries ]; do
  if curl -fs http://localhost:3100/health >/dev/null 2>&1; then
    break
  fi
  retries=$((retries + 1))
  sleep 2
done

if [ $retries -eq $max_retries ]; then
  error "Agent did not start within 60 seconds. Check logs: docker compose logs cocapn"
fi

echo ""
echo -e "${GREEN}${BOLD}Cocapn sandbox is running!${RESET}"
echo ""
echo "  Health:  http://localhost:3100/health"
echo "  Chat:    POST http://localhost:3100/api/chat"
echo "  Logs:    $COMPOSE logs -f cocapn"
echo "  Stop:    $COMPOSE down"
echo "  Test:    bash test-sandbox.sh"
echo ""

# Open browser if possible
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3100 2>/dev/null || true
elif command -v open >/dev/null 2>&1; then
  open http://localhost:3100 2>/dev/null || true
fi
