# Social Amp Scraper — Windows Setup

$ErrorActionPreference = 'Stop'
$ScriptDir  = $PSScriptRoot
$ScraperDir = Join-Path $ScriptDir 'scraper'

Clear-Host
Write-Host '================================'       -ForegroundColor Cyan
Write-Host '  Social Amp Scraper - Setup'           -ForegroundColor Cyan
Write-Host '================================'       -ForegroundColor Cyan
Write-Host ''

# ── Node.js ───────────────────────────────────────────────────────────────────
Write-Host 'Checking Node.js...'
$nodeFound = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeFound) {
    Write-Host ''
    Write-Host '  Node.js is not installed.' -ForegroundColor Yellow
    Write-Host '  Opening nodejs.org - install the LTS version, then re-run this script.'
    Start-Process 'https://nodejs.org'
    Write-Host ''
    Read-Host '  Press Enter once Node.js is installed to continue'
    $nodeFound = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
    if (-not $nodeFound) {
        Write-Host '  Node.js still not found. Please install it and re-run.' -ForegroundColor Red
        Read-Host 'Press Enter to close'
        exit 1
    }
}
$nodeVer = node --version
Write-Host "  OK Node.js $nodeVer" -ForegroundColor Green
Write-Host ''

# ── Install dependencies ──────────────────────────────────────────────────────
if (-not (Test-Path $ScraperDir)) {
    Write-Host "  ERROR: scraper folder not found at $ScraperDir" -ForegroundColor Red
    Write-Host '  Make sure install-windows.bat is in the same folder as the scraper/ folder.'
    Read-Host 'Press Enter to close'
    exit 1
}
Write-Host 'Installing dependencies (this may take a minute)...'
Push-Location $ScraperDir
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: npm install failed.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
Pop-Location
Write-Host '  OK Done' -ForegroundColor Green
Write-Host ''

# ── Install Playwright browser ────────────────────────────────────────────────
Write-Host 'Downloading Playwright browser (~150 MB)...'
Push-Location $ScraperDir
npx playwright install chromium
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: Playwright install failed.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
Pop-Location
Write-Host '  OK Done' -ForegroundColor Green
Write-Host ''

# ── Credentials ───────────────────────────────────────────────────────────────
$envFile = Join-Path $ScraperDir '.env'
if (Test-Path $envFile) {
    Write-Host '  Credentials already saved - skipping.' -ForegroundColor Yellow
    Write-Host ''
} else {
    Write-Host '================================' -ForegroundColor Cyan
    Write-Host '  Enter your credentials'
    Write-Host '  (Ask Tony for these values)'
    Write-Host '================================' -ForegroundColor Cyan
    Write-Host ''
    $supabaseUrl = Read-Host '  Supabase URL'
    $serviceKey  = Read-Host '  Supabase Service Key'
    $scraperId   = Read-Host '  Your name (e.g. alice)'
    $envContent  = "SUPABASE_URL=$supabaseUrl`nSUPABASE_SERVICE_KEY=$serviceKey`nSCRAPER_USER_ID=$scraperId"
    [System.IO.File]::WriteAllText($envFile, $envContent, [System.Text.Encoding]::UTF8)
    Write-Host ''
    Write-Host '  OK Credentials saved.' -ForegroundColor Green
    Write-Host ''
}

# ── Threads login ─────────────────────────────────────────────────────────────
Write-Host '================================' -ForegroundColor Cyan
Write-Host '  Log in to Threads'
Write-Host '================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  A browser window will open.'
Write-Host '  Log in to your Threads account, then close the browser.'
Write-Host ''
Read-Host '  Press Enter to open the browser'
Write-Host ''
Push-Location $ScraperDir
npm run login
Pop-Location
Write-Host ''
Write-Host '  OK Login complete.' -ForegroundColor Green
Write-Host ''

# ── Desktop launcher ──────────────────────────────────────────────────────────
$desktop  = [Environment]::GetFolderPath('Desktop')
$launcher = Join-Path $desktop 'Start Scraper.bat'
$launcherContent = @"
@echo off
title Social Amp Scraper
cls
echo ================================
echo   Social Amp Scraper
echo ================================
echo.
echo   Server running on http://localhost:3001
echo   Keep this window open while using the scraper.
echo   Close it to stop the server.
echo.
cd /d "$ScraperDir"
npm run server
pause
"@
[System.IO.File]::WriteAllText($launcher, $launcherContent, [System.Text.Encoding]::UTF8)
Write-Host "  OK 'Start Scraper' added to your Desktop." -ForegroundColor Green
Write-Host ''

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host '================================' -ForegroundColor Cyan
Write-Host '  All done!'                      -ForegroundColor Green
Write-Host '================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Every day:'
Write-Host '   1. Double-click "Start Scraper" on your Desktop'
Write-Host '   2. Keep that window open'
Write-Host '   3. Open https://social-amp.vercel.app in your browser'
Write-Host '   4. Go to Scraper - controls will appear automatically'
Write-Host ''
Write-Host '  Important: Do not move the social-amp-scraper folder'
Write-Host '             or the desktop launcher will stop working.'
Write-Host ''
Read-Host 'Press Enter to close'
