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
npm install
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
  read -rp "  Your name (e.g. alice): "  SCRAPER_USER_ID
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
echo "  A browser window will open."
echo "  Log in to your Threads account, then close the browser."
echo ""
read -rp "  Press Enter to open the browser..."
echo ""
cd "$SCRAPER_DIR"
npm run login || true   # browser close can exit non-zero, that's fine
echo ""
echo "  ✓ Login complete."
echo ""

# ── Desktop launcher ──────────────────────────────────────────────────────────
LAUNCHER="$HOME/Desktop/Start Scraper.command"
cat > "$LAUNCHER" <<LAUNCHER_SCRIPT
#!/usr/bin/env bash
# NOTE: Do not move the social-amp-scraper folder or this launcher will break.
cd "$SCRAPER_DIR"
clear
echo "================================"
echo "  Social Amp Scraper"
echo "================================"
echo ""
echo "  Server running on http://localhost:3001"
echo "  Keep this window open while using the scraper."
echo "  Close it to stop the server."
echo ""
npm run server
LAUNCHER_SCRIPT
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
