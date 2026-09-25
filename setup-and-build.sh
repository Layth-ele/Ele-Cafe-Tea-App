#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# setup-and-build.sh — clean install + build, in one command.
#
# Run this when you've just unzipped the app. Handles the two-package
# install (root client + functions) and gives readable error output if
# anything's missing — a much friendlier path than diagnosing
# "tsc: Cannot find module" or "vite: command not found" yourself.
#
# Usage:
#   chmod +x setup-and-build.sh    (only needed once, on first run)
#   ./setup-and-build.sh
#
# Exit codes:
#   0  success
#   1  prerequisite missing (Node, npm, .env)
#   2  install failed
#   3  build failed
# ─────────────────────────────────────────────────────────────────────────
set -e

# Colors for readability (degrades gracefully when the terminal doesn't
# support them — these escape codes are no-ops on dumb terminals).
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

step() { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
err()  { echo -e "${RED}  ✗ $1${NC}"; }

# ── 1. Prerequisites ────────────────────────────────────────────────────
step "Checking prerequisites"

if ! command -v node >/dev/null 2>&1; then
  err "Node.js not installed. Get it from https://nodejs.org (need v18 or higher)."
  exit 1
fi
NODE_VERSION=$(node -v)
ok "Node.js $NODE_VERSION"

if ! command -v npm >/dev/null 2>&1; then
  err "npm not installed (should come with Node.js)."
  exit 1
fi
ok "npm $(npm -v)"

# ── 2. Environment file ────────────────────────────────────────────────
step "Checking .env file"

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    warn ".env not found. Copy .env.example to .env and fill in values:"
    echo "       cp .env.example .env"
    echo "       # then edit .env with your Firebase project values"
    err "Aborting — build will fail without Firebase env vars."
    exit 1
  else
    err ".env not found and .env.example missing. Create .env with your Firebase config."
    exit 1
  fi
fi

# Sanity-check the required keys exist (vite.config.ts hard-fails the
# build if they're missing, but a clearer error here saves time).
for key in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID; do
  if ! grep -qE "^${key}=." .env; then
    err "Required env var $key is missing or empty in .env"
    exit 1
  fi
done
ok ".env present with required Firebase keys"

# ── 3. Clean any stale build artifacts ────────────────────────────────
step "Cleaning stale build artifacts"

# Remove old node_modules + dist + functions/lib so we start from a
# known state. Skip if you want speed and trust the existing state —
# but for the common "I just unzipped over an old copy" scenario, this
# removes the most common source of weird build errors.
rm -rf node_modules dist functions/node_modules functions/lib 2>/dev/null || true
ok "Cleaned"

# ── 4. Install client deps ─────────────────────────────────────────────
step "Installing client dependencies (this is the big one — ~30s)"

if ! npm install --no-audit --no-fund; then
  err "npm install failed at root. Check the error above. Common causes:"
  echo "       • No internet connection"
  echo "       • Node version too old (need 18+)"
  echo "       • Disk full"
  exit 2
fi
ok "Client deps installed"

# ── 5. Install Cloud Function deps ─────────────────────────────────────
step "Installing Cloud Functions dependencies (separate package, separate install)"

if ! (cd functions && npm install --no-audit --no-fund); then
  err "npm install failed in functions/. Check the error above."
  err "If you don't deploy Cloud Functions, this isn't strictly required —"
  err "but firebase deploy will fail without it."
  exit 2
fi
ok "Functions deps installed"

# ── 6. Type-check + lint as a sanity gate ──────────────────────────────
step "Type-checking client (catches issues before build)"
if ! npm run typecheck 2>&1; then
  err "TypeScript errors. Fix the errors above before deploying."
  exit 3
fi
ok "TypeScript clean"

# ── 7. Build the client ────────────────────────────────────────────────
step "Building production bundle (vite build → dist/)"
if ! npm run build; then
  err "Build failed. See the error above."
  exit 3
fi
ok "Client built"

# ── 8. Build the functions ─────────────────────────────────────────────
step "Building Cloud Functions (tsc → functions/lib)"
if ! (cd functions && npm run build); then
  err "Functions build failed. Check the error above."
  exit 3
fi
ok "Functions built"

# ── Done ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All set. Deploy with:${NC}"
echo ""
echo -e "${GREEN}    firebase deploy --project ele-cafe-d7237${NC}"
echo ""
echo -e "${GREEN}  Or stage by stage (recommended for production):${NC}"
echo -e "${GREEN}    firebase deploy --only firestore:rules${NC}"
echo -e "${GREEN}    firebase deploy --only firestore:indexes${NC}"
echo -e "${GREEN}    firebase deploy --only functions${NC}"
echo -e "${GREEN}    firebase deploy --only hosting${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
