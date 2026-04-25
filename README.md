# Social Amp

An internal tool for validating product ideas through coordinated social media activity. AI-assisted content creation across multiple accounts — no OAuth, no live posting. Data stored in Supabase (cloud); scrapers run locally via Playwright.

## What it does

| Module | Path | Purpose |
|--------|------|---------|
| **Products** | `/products` | Create and manage product briefs. Name, problem statement, target persona, KSPs, platform selection, stage, visual tones, preferred colors, and content languages. Import from any public URL — Gemini fetches the page and pre-fills the brief. |
| **Accounts** | `/accounts` | Manage social accounts and their posting voices. Tone preset, free-text persona, and per-account language tags. |
| **Playbook** | `/playbook` | Per-platform limits (char, word, hashtag, link, video) and named content strategies. Active strategy directives are injected into every draft. Limits are injected as hard constraints. |
| **Content Studio** | `/studio/:id` | Generate platform-adapted drafts for multiple accounts × languages in parallel. Visual descriptor panel, AI image generation, inline editing, char/word count, approve/needs-work status, save to calendar. |
| **Calendar Planner** | `/planner` | Generate a full month of skeleton post slots based on best-practice frequency, optimal times, and platform-specific day distribution. |
| **Calendar** | `/calendar` | Monthly grid of all posts. Draft slots (from planner) and ready posts (from studio) shown with distinct visual states. Click any date to open Quick Create pre-filled with that date. |
| **Pulse** | `/pulse` | Daily trend and planning view. Upcoming cultural moments (next 6 weeks, region-aware) alongside live trend snapshots across Twitter, Reddit, Instagram, and the web. Star trends, send directly to Content Studio as an angle. |
| **Scraper** | `/scraper` | Multi-platform feed monitor with two tabs — **Threads** and **Twitter / X**. Each scrapes your home feed via Playwright, stores engagement snapshots in Supabase, and calculates velocity to surface viral posts. Twitter adds keyword search, view counts, and an **Account Tracker** tab for monitoring watched handles and finding reply opportunities. Feed and leaderboard data loads from Supabase on all devices — Start/Stop/Logs controls only appear when a local scraper server is reachable. |
| **Quick Create** | Sidebar `+ New Post` | Right-side overlay drawer. 4-step wizard to go from zero to a scheduled post without leaving the current view. |
| **Booster** | `/booster` | Single-account Threads content decision system. Import post history, build a Brand Voice profile, surface topics worth writing, generate voice-aligned drafts, diagnose posts before publishing, predict 24-hour performance, and run post-publish feedback loops to improve future predictions. Separate from the multi-account Social Amp workflow — operates entirely on one Threads handle at a time. |

---

## Monorepo structure

```
social-amp/
├── src/                        # React web app (Vite)
│   ├── components/             # Layout, Sidebar, Topbar, Icons, QuickCreateDrawer
│   ├── context/                # AppContext — API key modal + quick create drawer
│   ├── data/                   # upcomingEvents.js, visualPresets.js, languages.js
│   ├── services/
│   │   ├── gemini.js           # All Gemini API calls
│   │   ├── storage.js          # Supabase CRUD (products, accounts, calendar, trends, platform configs, Twitter watch accounts)
│   │   ├── threads.js          # Threads scraper API client (local server)
│   │   ├── twitter.js          # Twitter scraper API client (local server + Supabase RPCs)
│   │   └── planner.js          # Scheduling algorithm — no AI
│   ├── styles/
│   │   └── tokens.css          # Design tokens
│   └── views/
│       ├── ProductList/
│       ├── ProductSetup/
│       ├── AccountHub/
│       ├── Playbook/
│       ├── ContentStudio/
│       ├── Planner/
│       ├── Calendar/
│       ├── Pulse/
│       ├── Scraper/            # Scraper.jsx (platform tabs), ThreadsScraper.jsx, TwitterScraper.jsx
│       └── Booster/            # Booster.jsx shell + panels/{Setup,Voice,Topics,Draft,Analyze,Predict,Review}Panel.jsx
├── scraper/                    # Node.js scraper workspace (TypeScript)
│   ├── src/
│   │   ├── agent/
│   │   │   ├── browser.ts          # Playwright launch (shared, accepts profileDir override)
│   │   │   ├── parser.ts           # Threads GraphQL counter-refresh parsing
│   │   │   ├── scraper.ts          # Threads DOM scraping, feed loop
│   │   │   ├── twitter-browser.ts  # Twitter nav helpers (home, search, profile)
│   │   │   └── twitter-scraper.ts  # Twitter DOM scraping, TweetPost type, feed loop
│   │   ├── storage/
│   │   │   ├── db.ts               # Threads Supabase CRUD
│   │   │   └── twitter-db.ts       # Twitter Supabase CRUD + getWatchAccounts
│   │   ├── analyzer/
│   │   │   └── velocity.ts         # (stub — velocity computed in Supabase RPCs)
│   │   ├── cli/
│   │   │   ├── login.ts            # One-time Threads login
│   │   │   ├── start.ts            # Threads continuous home feed loop
│   │   │   ├── search.ts           # Threads one-shot keyword scrape
│   │   │   ├── test-scrape.ts      # Threads one-shot test, no DB
│   │   │   ├── dump-raw.ts         # Threads raw DOM debug dump
│   │   │   ├── twitter-login.ts    # One-time Twitter/X login
│   │   │   ├── twitter-start.ts    # Twitter continuous home feed loop
│   │   │   ├── twitter-search.ts   # Twitter one-shot keyword scrape
│   │   │   ├── twitter-accounts.ts # Twitter account tracker scrape (watched handles)
│   │   │   └── twitter-test.ts     # Twitter one-shot test, no DB
│   │   ├── config.ts               # Paths, URLs, timing constants (Threads + Twitter)
│   │   └── server.ts               # Express API server — /api/threads/* + /api/twitter/*
│   ├── package.json
│   └── tsconfig.json
├── package.json                # Workspace root — scripts for both packages
└── .env.local                  # VITE_LOCAL_API_URL (gitignored — local only)
```

---

## Getting started

### Prerequisites

- Node.js 18+

No native build tools required. `npm install` compiles nothing — the scraper writes directly to Supabase, so `better-sqlite3` has been removed entirely.

### Web app setup

```bash
cd social-amp
npm install
npm run dev       # http://localhost:5173
```

**`.env`** (committed — Supabase credentials):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

**`.env.local`** (gitignored — enables scraper control bar in the UI):
```
VITE_LOCAL_API_URL=http://localhost:3001
```

Without `VITE_LOCAL_API_URL`, the Scraper view shows the feed and leaderboard (read from Supabase) but hides Start/Stop controls. The rest of the app is unaffected.

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey). Enter it via the settings icon (top right). Stored in LocalStorage.

> **Image generation** requires a paid Gemini API plan. Draft generation and trend features work on the free tier.

### Scraper setup (new machine — Mac or Windows)

The scraper runs locally (Playwright browser with your Threads session) and writes data to the shared Supabase project. All teammates share the same feed and leaderboard.

#### Option A — Installer (non-technical teammates)

**What to include in the zip:**
```
install-mac.command
install-windows.bat
install-windows.ps1
scraper/
  package.json
  tsconfig.json
  src/
```
Do not include `node_modules/`, `.env`, or any browser profile directories — the installer handles those on the target machine.

Share via Google Drive or USB. See `SCRAPER_SETUP.md` for the user-facing guide.

**Important when zipping:** create the zip on Mac (or a tool that preserves Unix permissions) so `install-mac.command` keeps its execute bit and LF line endings.

- **Mac:** double-click `install-mac.command` (right-click → Open if Gatekeeper blocks it)
- **Windows:** double-click `install-windows.bat` (More info → Run anyway if SmartScreen warns)

Both installers: check Node.js, run `npm install`, download Playwright Chromium, prompt for `scraper/.env` credentials, then step through platform logins:

1. **Threads login** `(Y/n)` — default yes. Opens a browser; log in, then press Enter to confirm.
2. **Twitter / X login** `(y/N)` — default no (optional). Same browser flow.

Either login can be skipped and completed later by re-running the installer — already-done steps (Node check, dependencies, Playwright, credentials) are skipped automatically on re-run.

After logins, the installer drops a **"Start Scraper"** shortcut on the Desktop.

**Daily use after install:** double-click "Start Scraper" on Desktop → keep that window open → open the Vercel app → Scraper controls appear automatically.

**Do not move the extracted folder** after setup — the desktop launcher hardcodes the path.

#### Option B — Manual setup (developers)

**Mac:**
```bash
cd scraper
bash setup.sh
```

**Windows (PowerShell):**
```powershell
cd scraper
.\setup.ps1
```

Both scripts install dependencies, download the Playwright Chromium binary, and interactively create `scraper/.env`. On Windows, if the script is blocked by execution policy, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` first.

**`scraper/.env`** (gitignored — one per machine):
```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SCRAPER_USER_ID=yourname
```

`SCRAPER_USER_ID` identifies which machine/person collected each post. Use a short, unique label (e.g. `tony`, `alice`). Posts from all scrapers are visible to everyone in the shared feed.

**One-time Threads login** (saves session to `~/.threads-tracker/browser-profile/`):
```bash
npm run scraper:login
```

**One-time Twitter/X login** (saves session to `~/.twitter-tracker/browser-profile/`):
```bash
cd scraper && npm run twitter:login
```

**Start the local API server** (required for Start/Stop/Logs in the UI — serves both Threads and Twitter):
```bash
npm run scraper:server   # Express server on http://localhost:3001
```

**CLI usage** (bypass the UI):
```bash
npm run scraper:start         # Threads continuous loop, 5–15 min interval
npm run twitter:start         # Twitter continuous home feed loop, 8–20 min interval
KEYWORD=ai npm run twitter:search    # Twitter one-shot keyword scrape
npm run twitter:accounts      # Scrape all watched accounts (Account Tracker)
```

---

## How it works

### Product setup

Create a product brief — name, problem statement, target persona, key selling points (up to 6 chips, press Enter to add), platform selection, stage, and validation goal. KSPs feed directly into AI prompts as selling context.

Hard required fields (block save): name, problem statement, target persona, at least one platform.
Soft required fields (warning only): stage, validation goal.

**Import from URL** — paste any public product page, landing page, App Store listing, or competitor URL into the import field at the top of the new product form. Gemini fetches the page directly via `url_context` and extracts name, problem statement, target persona, and KSPs. Fields that can't be confidently extracted are left blank. Available on new products only — review and edit everything before saving.

**Visual tones** — optional mood or style descriptors (e.g. *minimalist*, *editorial*, *warm*) stored on the product and pre-loaded in Content Studio. Injected into draft prompts as a `Visual aesthetic:` line and used as context for image generation.

**Preferred colors** — optional color descriptions (e.g. *warm ivory*, *deep navy*) stored alongside visual tones.

**Content languages** — one or more languages assigned to the product as a default. Accounts can override this with their own language tags.

On save, the product opens directly in the Content Studio.

### Accounts

Accounts store platform, handle, follower count, one or more **language tags**, a **tone preset**, an optional free-text **persona**, and optional **writing patterns** distilled from top posts.

- **Language tags** — per-account language selection (e.g. English, Traditional Chinese). When set, overrides the product's language list for that account. When not set, falls back to the product's language list, then English.
- **Tone preset** — default voice style when no persona is set.
- **Persona** — free text; overrides tone preset and all identity/tone instructions at generation time.
- **Writing patterns** — paste 3–10 top-performing posts (separated by `---`) and hit **✦ Distill patterns**. Gemini analyzes the posts and extracts 5–8 behavioral rules covering hook structure, sentence rhythm, formatting conventions, hashtag behavior, CTA style, and voice markers. These patterns are stored on the account and injected into every draft as a voice layer that supplements the persona. During generation in Content Studio and Quick Create, a per-account **✦ patterns** toggle lets you disable them for the current session without editing the account.

### Playbook

Configure per-platform defaults before generating drafts. Two sections per platform:

**Limits** — inline-editable hard constraints injected into every generation prompt:
- **Char limit** — maximum post length in characters
- **Word limit** — maximum post length in words (takes priority over char limit in the prompt — set this for reliable length control)
- **Hashtag rec.** — maximum hashtags
- **Link in post** — whether links are allowed in the post body
- **Video cap** — maximum video length in seconds

Click any value to edit. Toggle boolean fields. Restore defaults resets to platform-standard values.

**Strategies** — named content strategy units. Paste a full document, style guide, or set of rules into the source field. Click **✦ Distill** to preview extracted directives before saving, or save directly and distillation runs in the background. The strategy card shows the extracted directive list once ready (✦ badge). Only one strategy can be active (radio select) per platform — the active strategy's directives are injected into every draft for that platform.

Both limits and strategy directives are placed at the **end** of the generation prompt, after the writing rules, for maximum model attention.

### Content Studio

1. Open a product — trend brief loads if one has been fetched. Hit the refresh icon to fetch or update.
2. Set **Identity** (session-level): *Random user* (organic, unaffiliated) or *Founder* (first-person, mission-driven).
3. Set **Tone** (session-level): *Promoting*, *Showcasing*, *Discussing*, *Questioning*, or *Jesting*.
4. Expand **Visual** to set mood presets and color descriptors. Pre-loaded from the product record; changes are session-only unless saved back to the product.
5. Pick an angle from the AI-suggested list or type your own.
6. Select accounts — accounts with a persona badge override identity and tone at generation time. Accounts with multiple language tags show a language indicator (e.g. `EN · 繁體`).
7. Hit **Generate** — one draft per account × language slot, all in parallel.
8. Review drafts in per-slot tabs. When an account has multiple language slots, each tab shows the language short code. Edit inline. The counter below the textarea shows word count always, and char count / word count with warn/over states when limits are configured in Playbook.
9. **Generate Image** — inside each draft card, hit the image button to generate a platform-appropriate visual via Gemini image generation. Aspect ratios: Instagram/Pinterest → 3:4 portrait, X → 16:9 landscape, all others → square. The image prompt is built by a first Gemini text call incorporating the post copy, visual descriptors, and colors; the image is then generated by `gemini-2.5-flash-image`.
10. Regenerate individually, mark approved or needs work.
11. Once all drafts are approved, save to the calendar with a date.

**Arriving from the calendar:**
- Draft slot → *Write in Studio →* opens with angle, account, and date pre-filled.
- Ready post → *Edit in Studio →* opens with the existing copy, angle, identity, tone, account, and date restored. The draft starts at approved status.

**Arriving from Pulse:**
- *Post as →* opens the studio with the trend topic pre-filled as the angle.

**Arriving from Scraper:**
- *Post as →* on any Leaderboard card opens the studio with the Threads post text pre-filled as the angle.

### Multi-language draft generation

When an account has multiple language tags, Content Studio expands it into one draft slot per language. Slot keys follow the pattern `accountId::language`. Each slot generates a fully independent draft with a language directive injected near the bottom of the prompt:

```
LANGUAGE: Write the post entirely in Traditional Chinese. Use phrasing, idioms, and social media conventions natural to native Traditional Chinese speakers.
```

Language is omitted from the prompt for English drafts (it's the default). Image prompts are always written in English regardless of post language.

The language resolution chain: `account.languages[] → product.languages[] → ['English']`.

### Quick Create

The **+ New Post** button in the sidebar opens a right-side overlay drawer accessible from anywhere in the app. A 4-step wizard replaces the full Content Studio flow for fast single-post creation:

1. **Context** — select a product (auto-selected if only one exists), pick identity and tone from dropdowns.
2. **Setup** — enter or select an angle. If a trend brief exists, angles are shown as clickable chips immediately; a refresh icon lets you update them. A collapsible **Trends & Moments** panel surfaces upcoming cultural events (next 2 weeks, region-aware) and live trending topics from the latest Pulse snapshot — clicking any chip fills the angle field. Starred trends appear first. A collapsible Visual section carries over mood and color descriptors. Select accounts to generate for. Angle and accounts are optional — if either is missing, a warning banner replaces the footer and asks you to confirm before continuing. Missing context reduces draft quality but doesn't block.
3. **Draft** — generate one draft per account × language slot in parallel, using the same Playbook limits and active strategy directives as Content Studio. Per-tab approve/needs-work controls. At least one approved draft is required to advance; if some remain unapproved, a confirmation dialog warns that they will be discarded.
4. **Schedule** — pick a publish date and time (down to the hour). The dominant platform of the selected accounts drives an inline time recommendation (e.g. *11:00 AM recommended · instagram*) with a one-click "Use" button. The step 4 summary lists only approved posts and shows an "image" badge on any slot with a generated image.

On save, each approved draft is written to the calendar as a `ready` post. If an image was generated for that slot, `imageBase64`, `imageMimeType`, and `imagePrompt` are stored on the record. The drawer closes and navigates to the calendar for the saved month.

### Calendar Planner

1. **Setup** — pick a month, confirm timezone (auto-detected), select one or more products.
2. **Frequency** — set posts per week per platform per product. Recommended ranges shown inline.
3. **Review** — mini calendar shows proposed slots colour-coded by product. Click any date to inspect and delete individual slots. Collisions (same account twice in a day) flagged with an amber warning.
4. **Confirm** — summary of total posts, then save. All slots land in the calendar as drafts.

Draft slots show as dashed amber chips on the calendar. Click to open the drawer and hit **Write in Studio →** — the studio opens with angle, account, and date pre-filled.

**Click-to-create:** Clicking any date cell on the calendar grid opens the Quick Create drawer with that date pre-filled in the Schedule step. Clicking an existing post chip opens the post detail drawer as usual.

### Pulse

1. **Upcoming** — cultural moments and events in the next 6 weeks, filtered by region. Driven by a static events file (`src/data/upcomingEvents.js`) — no API call required. Each card shows date, platforms, a suggested angle, and **Add to planner →**.
2. **Live Trends** — hit **Refresh** to fetch a live trend snapshot (single grounded Gemini call). Each refresh prepends a new timestamped block; previous snapshots push down so you can compare what changed across the day. Platform filter chips narrow the view client-side.
3. **Star** any trend to bookmark it (stored in LocalStorage). **Post as →** sends the trend topic as a pre-filled angle to the Content Studio — an inline dropdown picks the product if you have more than one.
4. Twitter and Instagram cards are labelled **search-derived** — they come from Google Search grounding rather than a live platform API.

Snapshots stored in Supabase (`trend_snapshots` table), pruned to 5 most recent on each save.

### Scraper — Threads tab

Collects engagement data from your Threads home feed using a local Playwright browser with your logged-in session.

**How it works:**
1. Playwright opens a persistent Chromium profile (`~/.threads-tracker/browser-profile/`)
2. Scrapes `div[data-pressable-container='true']` containers for post text, author, timestamp, engagement counts, and media type
3. Engagement buttons identified by SVG `aria-label` values (`讚`/`Like`, `回覆`/`Reply`, `轉發`/`Repost`, `分享`/`Share`)
4. Posts and snapshots written directly to Supabase via the service-role key
5. Velocity calculated as Δlikes ÷ Δtime between snapshots via Supabase RPC

**Scraper view (`/scraper → Threads tab`):**
- **Control bar** — only rendered when the local server is reachable. Start button (context-aware: `Start scraper` on home feed, `Start scraper: [keyword]` with a keyword active), frequency selector (`Once · 30m · 1h · 2h · 4h`), Stop/Cancel loop, collapsible log panel (SSE stream).
- **Feed tab** (default) — keyword bar + filter tray + paginated post cards. Age-band left border (green < 6h, amber < 24h, orange 24h+). **Go to →** and **Hide** (team-wide).
- **Leaderboard tab** — viral score (Δlikes×1 + Δreplies×2 + Δreposts×3) / minutes, 6h window. Cross-scraper boost: ×(1 + (scraper_count − 1) × 0.5).

**Filter tray:** Time window · Sort (Recent / Posted / Top) · Media type · Scrapers ▾ · Filters ▾ (author, min likes).

**Keyword search:** Add keyword chips (shared in Supabase). Click a chip to filter feed. Start button becomes `Start scraper: [keyword]` to scrape that keyword.

**Local API endpoints (`/api/threads/*`):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/threads/status` | `{ running, pid, keyword }` |
| `POST` | `/api/threads/start` | spawn home feed scraper |
| `POST` | `/api/threads/stop` | SIGTERM |
| `POST` | `/api/threads/search` | body `{ keyword }` — one-shot keyword scrape |
| `GET` | `/api/threads/stream` | SSE log stream |

**Safety:** Default 5–15 min interval. Keep `SCROLL_COUNT` ≤ 8. Never run two sessions against the same profile.

```bash
SCROLL_COUNT=8 npm run scraper:start
MIN_INTERVAL=3 MAX_INTERVAL=8 npm run scraper:start
```

> **Do not use `HEADLESS=1`** — headless browsers are easier to detect.

**Debugging:** `cd scraper && npx ts-node src/cli/test-scrape.ts`

---

### Scraper — Twitter / X tab

Collects engagement data from Twitter/X using a separate Playwright browser profile (`~/.twitter-tracker/browser-profile/`). Requires a one-time login (`npm run twitter:login`). Data written to Supabase and shared across all team members.

**How it works:**
1. Playwright opens a persistent Chromium profile at `~/.twitter-tracker/browser-profile/`
2. Scrapes `article[data-testid="tweet"]` containers — text, author, timestamp, media type
3. Engagement extracted from `data-testid` button `aria-label` values (`"154 Likes. Like"`, `"14 reposts. Repost"`, etc.)
4. View counts extracted from span text matching `/views?$/i` near the tweet action bar
5. Posts saved to `twitter_posts` with `source` tag (`home`, `keyword`, or `account`)

**Scraper view (`/scraper → Twitter / X tab`):**
- **Control bar** — same pattern as Threads. Start button is context-aware: `Start scraper` for home feed, `Start scraper: [keyword]` when a keyword chip is active.
- **Feed tab** — keyword bar + full filter tray + paginated tweet cards. Cards show view count (👁), likes, replies, RTs, quote count, reply badge, verified badge, media badge. **Reply on X →** opens the tweet directly. **Hide** removes team-wide.
- **Leaderboard tab** — viral score: (Δviews×0.3 + Δretweets×3 + Δquotes×2 + Δreplies×1.5 + Δlikes×1) / minutes. Velocity arrows (↑/↑↑/↑↑↑) on each card. 4h window.
- **Account Tracker tab** — posts from watched accounts sorted by **reply score** (velocity × recency decay, half-value at 3 min). Red pulsing dot on tab label when live posts exist. Time window: < 5m / < 10m / < 20m / All (default 10m). Cards show precise age (`3m ago`) and velocity arrows. **Reply on X →** button.

**Watched Accounts:**
Add @handles in the Account Tracker tab. Stored in `twitter_watch_accounts` (Supabase), shared across team. **↻ Scrape accounts** button triggers a one-shot scrape of all watched handles. Account Tracker shows posts from watched handles regardless of how they were scraped (home feed, keyword, or dedicated account scrape).

**Keyword search:** Same pattern as Threads. Keywords shared in `twitter_keywords`. Clicking a chip filters the feed; the Start button becomes `Start scraper: [keyword]` to scrape that keyword via `x.com/search?q=keyword&src=typed_query`.

**Local API endpoints (`/api/twitter/*`):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/twitter/status` | `{ running, pid, mode }` — mode: `null \| 'home' \| 'search' \| 'accounts'` |
| `POST` | `/api/twitter/start` | spawn home feed scraper |
| `POST` | `/api/twitter/stop` | SIGTERM |
| `POST` | `/api/twitter/search` | body `{ keyword }` — one-shot keyword scrape |
| `POST` | `/api/twitter/accounts` | scrape all watched accounts |
| `GET` | `/api/twitter/stream` | SSE log stream |

Data (feed, leaderboard, Account Tracker) is queried from Supabase directly by the frontend via RPCs (`get_twitter_posts`, `get_twitter_velocity_leaderboard`, `get_twitter_hot_window`).

**Safety:** Default 8–20 min interval (Twitter is more aggressive than Threads). Keep `SCROLL_COUNT` ≤ 4. Max 5 accounts per cycle. Never run home feed and account scraping simultaneously. Separate browser profile from Threads — never share.

```bash
SCROLL_COUNT=3 npm run twitter:start
MIN_INTERVAL=8 MAX_INTERVAL=20 npm run twitter:start
MAX_ACCOUNTS=3 npm run twitter:accounts
```

> **Do not use `HEADLESS=1`** — headless browsers are easier for X to detect.

**Debugging:** `cd scraper && npm run twitter:test`

If the Account Tracker shows no posts after adding watched accounts, the `get_twitter_hot_window` RPC needs `supabase/migrations/006_account_tracker_fix.sql` applied — this switches the filter to match by `author_username` rather than `watch_username`, so home-feed posts from watched handles appear immediately.

---

## Booster

A single-account Threads content decision system at `/booster`. Operates independently from the multi-account Social Amp workflow — one Threads handle at a time, with its own Supabase table (`booster_trackers`).

The system improves with use: each panel feeds the next, and post-publish feedback writes learning back into the tracker so predictions get more accurate over time.

### Panel overview

| Panel | Purpose |
|-------|---------|
| **Setup** | Import historical post data via 5 paths: Threads API (token + cursor pagination), JSON file upload, paste (JSON or plain text with Gemini fallback), Playwright profile scraper, or legacy migration. Generates a **Style Guide** (quantitative writing patterns) and **Concept Library** (concepts explained, analogies used, gaps to fill). |
| **Voice** | Deep qualitative analysis of post history across 14 dimensions — sentence rhythm, tone switching, emotional expression, humor style, argumentation, signature phrases, and more. Produces an editable `brand_voice.md`. Re-runs preserve the `## Manual Refinements` section the user hand-edits. Brand Voice is the primary composition driver in Draft; all other panels treat it as observation-only. |
| **Topics** | Mines comment demand (recurring questions, validated demand from author replies), historical performance by topic and content type, and internal freshness (semantic repetition risk). Recommends 3–5 topics with source badge, freshness label, self-repetition risk, suggested angles, and "Send to Draft →" handoff. Persists last result per handle. |
| **Draft** | Generates a voice-aligned draft from a topic. Passes Brand Voice (up to 2500 chars), Style Guide, and Concept Library as composition context. Optional toggles (persisted per handle): freshness gate (internal repetition check), angle alternatives (2–3 options with "Use this" buttons), improvement questions (3–5 specific questions tied to draft lines). Draft → Analyze and Draft → Predict one-click handoffs. |
| **Analyze** | Always-accessible pre-publish diagnostic — no tracker required. Runs three rounds: (1) algorithm red-line scan (R1–R11), (2) suppression risk scan, (3) signal assessment. Also covers psychology analysis (hook mechanism, hook/payoff gap, share motivation split, retellability, comment depth) and AI-tone detection across sentence, structure, and content layers. Pointed changes section gives exact location → issue → suggested fix → priority for each finding. Accepts text from Draft → Analyze handoff. Result saved to `config.last_analyze` with timestamp; reloads on panel return. |
| **Predict** | Estimates 24-hour performance range (保守 / 基準 / 樂觀) for likes, replies, and reposts. Finds 3–5 nearest-neighbor posts by content type, hook type, word count band, and topic. Shows comparable post cards with match dimensions and actual metrics. Includes trend direction badge and upside/uncertainty factors. Accepts text from Draft → Predict handoff. Persists last prediction per handle with visible "predicted N minutes ago" timestamp. |
| **Review** | Post-publish feedback loop. Select a tracker post (searchable list with "有預測" / "已復盤" badges), enter actual metrics + checkpoint (24h / 72h / 7日). If a prediction snapshot exists, shows a prediction vs actual table with deviation % and band-hit classification. Generates deviation reasons, signal validation, learning points, calibration notes, and follow-up questions. Saves `review_state` back to the tracker post in Supabase. |

### Data flow

```
Setup → Style Guide + Concept Library
     ↓
Voice → brand_voice.md (editable)
     ↓
Topics → topic recommendations → Draft (pendingTopic)
     ↓
Draft → draft text → Analyze (pendingText) or Predict (pendingText)
     ↓
Predict → prediction_snapshot stored on tracker post
     ↓
Review → review_state written back to tracker post
```

### Supabase — booster_trackers table

| Column | Type | Notes |
|--------|------|-------|
| `handle` | TEXT UNIQUE | @username |
| `tracker` | JSONB | Full tracker: `{ account, posts[], last_updated }` — posts carry metrics, snapshots, prediction_snapshot, review_state |
| `style_guide` | TEXT | Markdown — generated by Setup |
| `concept_library` | TEXT | Markdown — generated by Setup |
| `brand_voice` | TEXT | Markdown — generated by Voice; Manual Refinements section preserved on re-run |
| `config` | JSONB | Per-handle settings: `draft_settings`, `last_topics`, `last_draft`, `last_prediction`, `last_analyze` |

### Post schema (`tracker.posts[]`)

Each post follows the v1 tracker schema:

```json
{
  "id": "post_id",
  "text": "...",
  "created_at": "ISO",
  "metrics": { "likes": 0, "replies": 0, "reposts": 0, "views": 0 },
  "word_count": 0,
  "is_reply_post": false,
  "snapshots": [{ "captured_at": "ISO", "likes": 0, "replies": 0 }],
  "prediction_snapshot": { "predicted_at": "ISO", "confidence_level": "Usable", "ranges": { "likes": { "conservative": 0, "baseline": 0, "optimistic": 0 } }, "upside_drivers": [], "uncertainty_factors": [] },
  "review_state": { "last_reviewed_at": "ISO", "actual_checkpoint_hours": 24, "actual_metrics": {}, "deviation_summary": "...", "calibration_notes": "...", "validated_signals": {}, "learning_points": [] }
}
```

### Data confidence levels

Used across Topics, Analyze, and Predict to honestly label how strong the evidence is:

| Level | Posts with metrics | What you can claim |
|-------|-------------------|--------------------|
| Directional | < 5 | Sample too small for stable conclusions |
| Weak | 5–9 | Tendency visible, not yet evidence |
| Usable | 10–19 | Stable enough to guide decisions |
| Strong | 20–49 | Reliable working baseline |
| Deep | 50+ | Cross-dimensional analysis meaningful |

### Import paths (Setup panel)

| Path | When to use |
|------|------------|
| **A — Threads API** | You have a Threads API token. Cursor-paginated, most complete. Requires local scraper server running. |
| **B — File upload** | You have a JSON export (Threads API format, Meta data export, tracker v1, or raw array). |
| **C — Paste** | Paste JSON directly or plain text — Gemini extracts posts from unstructured text as fallback. |
| **D — Profile scrape** | No API token. Playwright scrapes your Threads profile via the local browser session. Two independent initiators: **Posts** (scrapes `/@handle`) and **Replies** (scrapes `/@handle/replies`), each with its own target count selector (20 / 50 / 100 / 150 / 200). Either can be run independently; both stop early after two consecutive dry scrolls. Post links are matched against `/@owner/post/` to prevent parent-post text leaking into reply records. Requires local scraper server. |
| **E — Migrate** | Import from a legacy tracker JSON — auto-detected and normalized by the same format detector as Path C. |

---

## AI generation model

Every draft is shaped by layered instructions in this order (bottom = highest model attention):

1. Product context — name, problem statement, persona, KSPs
2. Voice — identity instruction or persona override
3. Tone — post intent (omitted when persona is set)
4. Visual aesthetic — mood/style descriptors and preferred colors (omitted when empty)
5. **Writing patterns** — behavioral directives distilled from the account's top posts (omitted when none or toggled off)
6. Writing rules — native format, angle-first, subtle CTA
7. **Language directive** — injected for non-English drafts only
8. **Hard constraints** — platform limits from Playbook (char, word, hashtag, link)
9. **Strategy directives** — extracted directives from active Playbook strategy

Constraints at positions 6–8 are placed last in the prompt to maximise adherence. Word limit is the most reliable length control — set it in Playbook Limits rather than relying on a strategy directive alone.

---

## Tech stack

**Web app:**
- **React 19 + Vite 7** — React Router v7
- **State** — React Context (`AppContext` — API key modal + quick create drawer) + component `useState`
- **Storage** — Supabase (products, accounts, calendar posts, trend snapshots, platform configs, scraper keywords) · LocalStorage (API key, timezone, pulse starred/preferences, scraper frequency, last scraped timestamps)
- **AI** — `@google/generative-ai` SDK — Gemini Flash / Pro with Google Search grounding for trend briefs and pulse snapshots; `gemini-2.5-flash-image` for post image generation
- **Scheduling** — `src/services/planner.js` — pure JS, no AI calls
- **Styling** — CSS custom properties (`src/styles/tokens.css`)

**Scraper (`scraper/`):**
- **Playwright** — persistent Chromium profile, DOM scraping
- **better-sqlite3** — local SQLite for posts and engagement snapshots
- **Express + CORS** — local API server, SSE for log streaming
- **TypeScript + ts-node** — compiled via ts-node at runtime

---

## Data model

### Supabase (web app)

**Products** — `{ id, name, problemStatement, targetPersona, ksp[], stage, platforms[], accountIds[], validationGoal, trendBrief, visualTones[], preferredColors[], languages[], createdAt, updatedAt }`

- `trendBrief` — `{ topics[], angles[], competitors[], fetchedAt }` — fetched on demand in the studio, preserved across edits.
- `visualTones[]` — mood/style descriptors (e.g. `["minimalist", "editorial"]`)
- `preferredColors[]` — color descriptions (e.g. `["warm ivory", "deep navy"]`)
- `languages[]` — default language list for the product (e.g. `["English", "Traditional Chinese"]`)

**Accounts** — `{ id, handle, platform, followerCount, tonePreset, persona, languages[], topPostsRaw?, postPatterns[]?, createdAt, updatedAt }`

**Calendar posts** — `{ id, productId, accountId, platform, accountHandle, copy, angle, identity, postTone, date, time, monthKey, scheduledOffset, status, language?, imageBase64?, imageMimeType?, imagePrompt?, createdAt, updatedAt }`

`status` — `'draft'` for planner skeleton slots · `'ready'` for posts with written copy.

**Trend snapshots** — `{ id, location, region, fetchedAt, trends[], upcomingBuzz[], createdAt }` — pruned to 5 most recent.

**Platform configs** — `{ platform, limits: { charLimit, wordLimit, hashtagLimit, linkInPost, videoMaxSec }, strategies[], selectedStrategyId, updatedAt }`

### Supabase — threads tables

**threads_keywords** — shared keyword list across all team members

| Column | Notes |
|--------|-------|
| `keyword` | search keyword (PK) |
| `created_at` | when the keyword was added |

**threads_posts** — one row per unique Threads post

| Column | Notes |
|--------|-------|
| `post_id` | short code from post URL (PK) |
| `author_username` | @handle |
| `text` | post content |
| `permalink` | full URL |
| `created_at` | Unix timestamp from `<time datetime>` on Threads |
| `first_seen_at` | timestamp of first observation (immutable via DB trigger) |
| `scraper_user_id` | which team member's scraper collected this post |
| `keyword` | search keyword that produced this post; `NULL` for home feed posts |
| `media_type` | `TEXT / IMAGE / VIDEO / CAROUSEL` — detected from DOM |
| `hidden` | `true` if hidden by a team member — filtered out of feed and leaderboard for all users |
| `like_count`, `reply_count`, `repost_count`, `reshare_count` | latest counts (updated on each scrape) |

**threads_snapshots** — one row per engagement observation per post (used for velocity)

| Column | Notes |
|--------|-------|
| `post_id` | FK → threads_posts |
| `observed_at` | timestamp of this observation |
| `like_count`, `reply_count`, `repost_count`, `reshare_count` | counts at observation time |

**threads_post_scrapers** — which scrapers have seen each post (junction table)

| Column | Notes |
|--------|-------|
| `post_id` | FK → threads_posts (composite PK) |
| `scraper_user_id` | which scraper saw this post (composite PK) |
| `first_seen_at` | when this scraper first observed the post |

Velocity, feed queries, and cross-bubble scoring are served via Postgres RPC functions (`get_velocity_leaderboard`, `get_threads_posts`) — see `supabase/migrations/001_threads_tables.sql`.

### Supabase — twitter tables

**twitter_posts** — one row per unique tweet

| Column | Notes |
|--------|-------|
| `post_id` | numeric tweet ID as text (PK) |
| `author_username` | @handle |
| `author_verified` | boolean |
| `text` | tweet content |
| `permalink` | full URL |
| `created_at` | Unix timestamp |
| `first_seen_at` | timestamp of first observation (immutable via DB trigger) |
| `scraper_user_id` | which team member's scraper collected this post |
| `source` | `home` · `keyword` · `account` |
| `keyword` | set when source=keyword |
| `watch_username` | set when source=account |
| `media_type` | `TEXT / IMAGE / VIDEO / CAROUSEL` |
| `is_reply` | whether the tweet is a reply |
| `is_promoted` | promoted tweets are never persisted |
| `hidden` | team-wide hide via `hide_twitter_post` RPC |
| `view_count`, `like_count`, `reply_count`, `retweet_count`, `quote_count` | latest counts |

**twitter_snapshots** — one row per engagement observation per post (used for velocity)

**twitter_post_scrapers** — which scrapers have seen each post (junction table, same pattern as Threads)

**twitter_keywords** — shared keyword list (same pattern as `threads_keywords`)

**twitter_watch_accounts** — accounts monitored in the Account Tracker

| Column | Notes |
|--------|-------|
| `username` | handle without @ (PK) |
| `display_name` | optional display name |
| `added_by` | scraper_user_id of who added it |
| `added_at` | timestamp |

Supabase RPC functions: `get_twitter_posts`, `get_twitter_velocity_leaderboard`, `get_twitter_hot_window`, `hide_twitter_post` — see `supabase/migrations/005_twitter_tables.sql` and `006_account_tracker_fix.sql`.

---

## Current status

**Working as of 2026-04-25.**

- Scraper login, post extraction, engagement counts, Supabase persistence — functional
- Scraper control from browser UI (Start/Stop/Logs via SSE) — functional
- Feed and leaderboard load from Supabase on all devices regardless of local server availability; Start/Stop/Logs controls appear only when a local scraper server is reachable; "retry detection" link in the no-server notice for when the page loads before the server starts — functional
- Feed tab is the default view (tab order: Feed | Leaderboard)
- No-server notice hints to use Chrome if scraper is running but not detected (Safari blocks HTTP fetch from HTTPS pages; Chrome has a localhost exception) — open issue, Safari not yet supported for scraper control
- Local server detected at runtime — control bar appears automatically when `npm run scraper:server` is running, even on the deployed Vercel app; no `.env.local` required
- Feed cards: published time (hover reveals full posted time, scraped time, and scraper ID); text clamped to 3 lines; media type badges; age-band left border — functional
- Feed sort: Recent (scrape time) · Posted (publish time) · Top (most likes). Top sort requires `supabase/migrations/002_top_sort.sql` to be applied in the Supabase SQL editor.
- Feed media type filter (All / Img / Vid / Carousel / Text, multi-select chips) — functional
- Feed time window (Live · 6h / 24h / 48h / All, default 24h) — filters by published time with scrape-time fallback — functional
- Feed shows count of posts hidden by the active time window with a one-click "show all" link — functional
- Scrapers filter: multi-select dropdown (scales to large teams); Author and Min likes collapsed into Filters ▾ popover — functional
- Data freshness badge: "Last scraped X ago" persisted in localStorage, turns amber when >2h stale — functional
- ↻ Scrape now inline button in keyword bar when server is idle — functional
- Leaderboard viral score: composite velocity (Δlikes×1 + Δreplies×2 + Δreposts×3) / minutes, 6h window — computed via Supabase RPC
- Cross-bubble score boost: leaderboard score multiplied by `1 + (scraper_count − 1) × 0.5` — posts seen by multiple scrapers rank higher
- Leaderboard cards show "seen by N scrapers" badge + amber left border when scraper_count > 1 — functional
- Scraper attribution: each post tagged with `scraper_user_id`; sightings tracked in `threads_post_scrapers` junction table
- Multi-scraper support: multiple team members scrape from their own Threads accounts; all data merges into the shared Supabase project
- `better-sqlite3` removed — scraper writes directly to Supabase; no native compilation or Python required during `npm install`, works on Node 24
- RLS error on `savePosts` now logs a clear hint to check `SUPABASE_SERVICE_KEY` (must be the service_role key, not the anon key)
- **Keyword sync** — saved keywords stored in Supabase (`threads_keywords`), shared across all team members and devices; requires `supabase/migrations/004_keywords_and_hide.sql`
- **Hide post** — Hide button on feed and leaderboard cards; sets `hidden = true` via a `SECURITY DEFINER` RPC; hidden posts are filtered out of feed and leaderboard queries for all users team-wide; requires `supabase/migrations/004_keywords_and_hide.sql`
- Login flow redesigned — automated DOM detection removed (fragile against Threads markup changes); installer opens browser then waits for user to visually confirm login and press Enter; startup login gate removed from scraper so a stale session shows as 0 posts rather than a hard exit
- Installer (`install-mac.command`): desktop launcher now written with `printf` instead of a heredoc — fixes silent failure on Mac when the file has Windows CRLF line endings; "Press Enter to open the browser" prompt removed before `npm run login` to prevent the stale keypress from auto-confirming the login step; `process.stdin.destroy()` called after confirmation so Node exits cleanly and the installer continues
- Installer login steps are now Y/N-gated — Threads `(Y/n)` default yes, Twitter / X `(y/N)` default no; either can be skipped and completed by re-running the installer; already-done steps skip automatically on re-run
- Distribution zip: `install-mac.command`, `install-windows.bat`, `install-windows.ps1`, and `scraper/` subfolder containing `package.json`, `tsconfig.json`, and `src/` (all agent, cli, storage, analyzer files) — do not include `node_modules/`, `.env`, browser profile directories, or debug-only scripts (`test-scrape.ts`, `test-scroll.ts`, `dump-raw.ts`, `migrate.ts`)
- **Twitter scraper** — home feed, keyword search, account tracker, Feed + Leaderboard + Account Tracker tabs — functional
- Twitter feed: view counts, retweet/quote counts, reply badge, verified badge, **Reply on X →** — functional
- Twitter leaderboard: view-weighted viral score, velocity arrows (↑/↑↑/↑↑↑), cross-scraper boost — functional
- Twitter Account Tracker: watched accounts panel (shared in Supabase), time window filter (< 5m/10m/20m/All), reply-score sort, pulsing tab dot — functional
- Account Tracker matches posts by `author_username` (any source) — requires `supabase/migrations/006_account_tracker_fix.sql`
- Twitter keyword search URL: `x.com/search?q=typed_query&src=typed_query` — home-first navigation to avoid SPA redirect to /home
- **Booster module** (Phases 1–9) — all panels functional; Setup, Voice, Topics, Draft, Analyze, Predict, Review
- Booster Setup Path D (profile scrape) — two independent initiators: Posts tab and Replies tab, each with own target count selector (20–200) and Stop button; both use dry-scroll early exit; post links matched against `/@owner/post/` to prevent parent-post text leaking into reply records
- Booster profile scraper — `postsTarget` / `repliesTarget` env vars replace old `SCROLL_COUNT`; 0 skips a tab; hard cap of 50 scrolls per tab
- Booster panel results — all panels (Topics, Draft, Analyze, Predict, Review) save last result to Supabase and restore on panel return; generated-at timestamp displayed next to each generate button; Analyze previously had no save — now writes to `config.last_analyze`

**Known issues:**
- Safari blocks HTTP fetch from HTTPS pages — scraper control bar not reachable from Safari; use Chrome. Long-term fix: Supabase-based control (no local server required) or HTTPS local server with trusted cert via mkcert
- `npm run scraper:migrate` references removed SQLite dependency — safe to ignore, migration was a one-time operation
- `test-scroll.ts` references removed SQLite symbols — safe to ignore, debug script only

**Known Windows-specific notes:**
- Scraper must be spawned with `stdio: ['inherit', 'pipe', 'pipe']` — Chrome exits with code 21 if stdin handle is `INVALID_HANDLE_VALUE`
- ts-node is invoked via `process.execPath` + `ts-node/dist/bin.js` directly (no shell layer) — avoids Playwright pipe handle inheritance issues with `shell: true`

---

## What's next

- **Safari support for scraper control** — replace local HTTP server with Supabase-based command/status table so control works from any browser without mixed-content restrictions
- **Twitter scraper — Phase 4: Trending tab** — scrape X Explore trending topics, store as timestamped snapshots, surface in a Trending tab with `Search →` and `Post as →` actions
- **Per-author block** — block all posts from a given handle team-wide via a `threads_blocked_authors` table; blocked authors filterable via Filters ▾ popover

---

## Privacy

Supabase data (including scraped Threads posts) is synced to your Supabase project. Gemini API calls send prompt text to Google's API — see [Google's privacy policy](https://policies.google.com/privacy).

## Out of scope — Phase 1

- OAuth / live platform connections
- Actual post scheduling and publishing automation
- Engagement triage and reply drafts
- Validation dashboard and signal scoring
- User roles and permissions
