#!/usr/bin/env bash
# Social Amp Scraper — Mac Setup
# If double-clicking is blocked: right-click → Open

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRAPER_DIR="$SCRIPT_DIR/scraper"

clear
echo "================================"
echo "  Social Amp Scraper — Setup"
echo "================================"
echo ""

# ── Node.js ───────────────────────────────────────────────────────────────────
echo "Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo ""
  echo "  Node.js is not installed."
  echo "  Opening nodejs.org — install the LTS version, then re-run this script."
  open "https://nodejs.org"
  echo ""
  read -rp "  Press Enter once Node.js is installed to continue..."
  if ! command -v node &>/dev/null; then
    echo "  Node.js still not found. Please install it and re-run this script."
    read -rp "  Press Enter to close..."
    exit 1
  fi
fi
echo "  ✓ Node.js $(node --version)"
echo ""

# ── Install dependencies ──────────────────────────────────────────────────────
echo "Installing dependencies (this may take a minute)..."
if [ ! -d "$SCRAPER_DIR" ]; then
  echo "  ERROR: scraper folder not found at $SCRAPER_DIR"
  echo "  Make sure install-mac.command is in the same folder as the scraper/ folder."
  read -rp "  Press Enter to close..."
  exit 1
fi
cd "$SCRAPER_DIR"
if ! npm install; then
  echo ""
  echo "  ERROR: npm install failed. See the error above."
  read -rp "  Press Enter to close..."
  exit 1
fi
echo "  ✓ Done"
echo ""

# ── Install Playwright browser ────────────────────────────────────────────────
echo "Downloading Playwright browser (~150 MB)..."
npx playwright install chromium
echo "  ✓ Done"
echo ""

# ── Credentials ───────────────────────────────────────────────────────────────
if [ -f "$SCRAPER_DIR/.env" ]; then
  echo "  Credentials already saved — skipping."
  echo ""
else
  echo "================================"
  echo "  Enter your credentials"
  echo "  (Ask Tony for these values)"
  echo "================================"
  echo ""
  read -rp "  Supabase URL: "            SUPABASE_URL
  read -rp "  Supabase Service Key: "    SUPABASE_SERVICE_KEY
  read -rp "  Your name (e.g. zack): "  SCRAPER_USER_ID
  printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_KEY=%s\nSCRAPER_USER_ID=%s\n' \
    "$SUPABASE_URL" "$SUPABASE_SERVICE_KEY" "$SCRAPER_USER_ID" > "$SCRAPER_DIR/.env"
  echo ""
  echo "  ✓ Credentials saved."
  echo ""
fi

# ── Threads login ─────────────────────────────────────────────────────────────
echo "================================"
echo "  Log in to Threads"
echo "================================"
echo ""
echo "  A browser window will open. Log in to your Threads account."
echo "  Once you can see your feed, come back here and press Enter."
echo ""
cd "$SCRAPER_DIR"
if npm run login; then
  echo ""
  echo "  ✓ Login verified."
  echo ""
else
  echo ""
  echo "  ⚠ Login could not be verified."
  echo "  If you completed login, this may be a browser issue — you can retry later:"
  echo "    cd $SCRAPER_DIR && npm run login"
  echo ""
  read -rp "  Press Enter to continue anyway, or Ctrl+C to exit and retry..."
  echo ""
fi

# ── Desktop launcher ──────────────────────────────────────────────────────────
LAUNCHER="$HOME/Desktop/Start Scraper.command"
{
  printf '#!/usr/bin/env bash\n'
  printf '# NOTE: Do not move the social-amp-scraper folder or this launcher will break.\n'
  printf 'cd "%s"\n' "$SCRAPER_DIR"
  printf 'clear\n'
  printf 'echo "================================"\n'
  printf 'echo "  Social Amp Scraper"\n'
  printf 'echo "================================"\n'
  printf 'echo ""\n'
  printf 'echo "  Server running on http://localhost:3001"\n'
  printf 'echo "  Keep this window open while using the scraper."\n'
  printf 'echo "  Close it to stop the server."\n'
  printf 'echo ""\n'
  printf 'npm run server\n'
} > "$LAUNCHER"
chmod +x "$LAUNCHER"
echo "  ✓ 'Start Scraper' added to your Desktop."
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo "================================"
echo "  All done!"
echo "================================"
echo ""
echo "  Every day:"
echo "   1. Double-click 'Start Scraper' on your Desktop"
echo "   2. Keep that window open"
echo "   3. Open https://social-amp.vercel.app in your browser"
echo "   4. Go to Scraper — controls will appear automatically"
echo ""
echo "  Important: Do not move the social-amp-scraper folder"
echo "             or the desktop launcher will stop working."
echo ""
read -rp "  Press Enter to close..."
