# Threads Scraper setup — Windows
# Run from the scraper\ directory: .\setup.ps1
# If blocked by execution policy: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$ErrorActionPreference = "Stop"

Write-Host "=== Threads Scraper Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version 2>&1
    Write-Host "Node.js: $nodeVersion"
} catch {
    Write-Host "Node.js not found. Install from https://nodejs.org (v18+) and re-run." -ForegroundColor Red
    exit 1
}

# Install dependencies (from repo root to respect workspaces)
$repoRoot = Split-Path -Parent $PSScriptRoot
Write-Host ""
Write-Host "Installing dependencies..."
Push-Location $repoRoot
npm install
Pop-Location

# Install Playwright Chromium
Write-Host ""
Write-Host "Installing Playwright Chromium..."
Push-Location $repoRoot
npx playwright install chromium
Pop-Location

# Create scraper/.env if it doesn't exist
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "=== Configure scraper/.env ===" -ForegroundColor Cyan
    $supabaseUrl   = Read-Host "SUPABASE_URL (e.g. https://xxx.supabase.co)"
    $serviceKey    = Read-Host "SUPABASE_SERVICE_KEY"
    $scraperId     = Read-Host "SCRAPER_USER_ID (your name, e.g. tony)"

    @"
SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_KEY=$serviceKey
SCRAPER_USER_ID=$scraperId
"@ | Set-Content -Path $envFile -Encoding UTF8

    Write-Host ".env created." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "scraper\.env already exists — skipping." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Setup complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. npm run scraper:login    -- log in to Threads (one-time)"
Write-Host "  2. npm run scraper:server   -- start the local API server"
Write-Host "  3. Open the app and go to /scraper to control scraping from the UI"
