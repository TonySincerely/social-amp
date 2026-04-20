#!/usr/bin/env bash
# Threads Scraper setup — Mac / Linux
# Run from the scraper/ directory: bash setup.sh

set -e

echo "=== Threads Scraper Setup ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Install it from https://nodejs.org (v18+) and re-run."
  exit 1
fi
echo "Node.js: $(node --version)"

# Install dependencies (run from repo root to respect workspaces)
cd "$(dirname "$0")/.."
echo ""
echo "Installing dependencies..."
npm install

# Install Playwright Chromium browser
echo ""
echo "Installing Playwright Chromium..."
npx playwright install chromium

# Create scraper/.env if it doesn't exist
cd scraper
if [ ! -f .env ]; then
  echo ""
  echo "=== Configure scraper/.env ==="
  read -rp "SUPABASE_URL (e.g. https://xxx.supabase.co): " SUPABASE_URL
  read -rp "SUPABASE_SERVICE_KEY: "                        SUPABASE_SERVICE_KEY
  read -rp "SCRAPER_USER_ID (your name, e.g. tony): "     SCRAPER_USER_ID

  cat > .env <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
SCRAPER_USER_ID=$SCRAPER_USER_ID
EOF
  echo ".env created."
else
  echo ""
  echo "scraper/.env already exists — skipping."
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. npm run scraper:login    — log in to Threads (one-time)"
echo "  2. npm run scraper:server   — start the local API server"
echo "  3. Open the app and go to /scraper to control scraping from the UI"
