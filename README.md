# Social Amp

An internal tool for validating product ideas through coordinated social media activity. AI-assisted content creation across multiple accounts — no OAuth, no live posting. Data stored in Supabase (cloud) and local SQLite (scraper).

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
| **Scraper** | `/scraper` | Local Threads feed monitor. Scrapes your Threads home feed via Playwright, stores engagement snapshots in SQLite, calculates velocity to surface viral posts. Controlled from the browser (Start/Stop/Logs). Feed cards link directly to the post on Threads. Leaderboard cards send post text to Content Studio via "Post as →". Requires local API server — hidden/read-only when deployed. |
| **Quick Create** | Sidebar `+ New Post` | Right-side overlay drawer. 4-step wizard to go from zero to a scheduled post without leaving the current view. |

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
│   │   ├── storage.js          # Supabase CRUD (products, accounts, calendar, trends, platform configs)
│   │   ├── threads.js          # Threads scraper API client (local server)
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
│       └── Scraper/            # ThreadsScraper.jsx — control bar, SSE logs, leaderboard, feed
├── scraper/                    # Node.js scraper workspace (TypeScript)
│   ├── src/
│   │   ├── agent/
│   │   │   ├── browser.ts      # Playwright launch, login, scrolling
│   │   │   ├── parser.ts       # GraphQL counter-refresh parsing
│   │   │   └── scraper.ts      # DOM scraping (primary), feed loop
│   │   ├── storage/
│   │   │   └── db.ts           # SQLite schema, upsert, snapshots (better-sqlite3)
│   │   ├── analyzer/
│   │   │   └── velocity.ts     # Engagement velocity calculation
│   │   ├── cli/
│   │   │   ├── login.ts        # One-time Threads login
│   │   │   ├── start.ts        # Continuous scraping loop
│   │   │   ├── test-scrape.ts  # One-shot test, no DB
│   │   │   ├── test-scroll.ts  # Scroll + save test
│   │   │   └── dump-raw.ts     # Raw DOM debug dump
│   │   ├── config.ts           # Paths, URLs, timing constants
│   │   └── server.ts           # Express API server — scraper control + data endpoints
│   ├── package.json
│   └── tsconfig.json
├── package.json                # Workspace root — scripts for both packages
└── .env.local                  # VITE_LOCAL_API_URL (gitignored — local only)
```

---

## Getting started

### Prerequisites

- Node.js 18+

No native build tools required. The C++ dependency (`better-sqlite3`) has been replaced by Supabase — `npm install` compiles nothing.

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

**Start the local API server** (required for Start/Stop/Logs in the UI):
```bash
npm run scraper:server   # Express server on http://localhost:3001
```

**CLI usage** (bypass the UI):
```bash
npm run scraper:start    # continuous loop, 5–15 min interval
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

### Scraper

The Scraper module collects real engagement data from your Threads home feed using a local Playwright browser with your logged-in session. It runs entirely on your machine — no cloud scraping, no external APIs beyond Threads itself.

**How it works:**
1. Playwright opens a persistent Chromium profile (`~/.threads-tracker/browser-profile/`) where your Threads session is saved
2. Scrapes `div[data-pressable-container='true']` containers for post text, author, timestamp, engagement counts, and media type
3. Media type detected from DOM: `video` element → `VIDEO`; multiple non-profile `img` tags → `CAROUSEL`; one → `IMAGE`; text-only → `TEXT`
4. Engagement buttons identified by SVG `aria-label` values (`讚`/`Like`, `回覆`/`Reply`, `轉發`/`Repost`, `分享`/`Share`)
5. Posts and snapshots written to SQLite at `~/.threads-tracker/tracker.db`
6. Velocity calculated as Δlikes ÷ Δtime between first and last snapshot

**Scraper view (`/scraper → Threads tab`):**
- **Control bar** — unified Start button (context-aware: `Start scraper` on home feed, `Start scraper: [keyword]` with a keyword active), frequency selector (`Once · 30m · 1h · 2h · 4h`, persisted in localStorage), Stop/Cancel loop, collapsible log panel (SSE stream from server stdout). Status dot: green pulse (running) / teal (loop countdown) / grey (idle). Status label shows countdown between runs: `Next run in 14m · "ai"`.
- **Leaderboard tab** — posts ranked by **viral score** (composite velocity across likes, replies ×2, reposts ×3) over a 6h window. Requires ≥2 scrape cycles. Each card shows the score, absolute engagement counts, media type badge, age-band left border, and a **Go to →** link.
- **Feed tab** — keyword bar at the top + posts with a filter/sort bar, pagination. Each card shows the post's published time, a `scraped [date time]` label, and a coloured left border indicating content age (green < 6h, amber 6–24h, orange 24–48h). Media type badges (`img` / `vid` / `carousel`) shown next to repost count when applicable. **Go to →** link opens the post on Threads in a new tab.
- Control bar hidden when `VITE_LOCAL_API_URL` is not set (deployed mode)

**Feed filters and sort:**
- **Author** — free-text filter on handle
- **Min likes** — numeric threshold
- **Sort** — `Scraped` (default, ordered by when the post was collected) or `Posted` (ordered by publish time; posts with no timestamp fall back to scrape time and sort to the bottom)
- **Time window** — `Live · 6h / 24h / 48h`, default 24h. Filters by published time when available, scrape time otherwise. "All time" and "7d" removed — posts older than 48h are past the Threads viral window and add noise.
- **Media** — `All / Img / Vid / Carousel / Text` multi-select chips. `Text` includes posts with no detected media type.

**Keyword search (Feed tab):**
Type a keyword (e.g. `ai`, `政治`, `可愛`) in the `+ Add keyword…` input and press Enter to save it as a chip. Saved chips persist in localStorage (`threads_saved_keywords`). Chips are **view-only** — clicking switches which results you see without triggering a scrape. To scrape, select the keyword chip (making it active) then hit **Start scraper: [keyword]** in the control bar. A `last scraped X ago` label in the keyword bar shows data freshness. Click **Home feed** to return to untagged home feed posts.

**Loop scheduling:**
The frequency selector controls repeat behaviour. `Once` = one cycle then stop. Any other value (30m–4h) schedules the next run automatically after the current one completes, counting from run end. The loop target (home feed or keyword) is locked at Start time — switching keyword tabs mid-loop does not change what gets scraped. Stop cancels both the active run and any pending next cycle. `Cancel loop` appears in place of Start during the countdown between runs. The backend process always runs a single cycle when launched from the UI; the frontend owns all loop timing. Running `npm run scraper:start` directly (CLI) still uses the built-in continuous loop.

**Local API server** (`scraper/src/server.ts`, port 3001):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/threads/status` | `{ running, pid, keyword }` — `keyword` is non-null during a keyword scrape |
| `POST` | `/api/threads/start` | spawn home feed scraper child process |
| `POST` | `/api/threads/stop` | SIGTERM to child process |
| `POST` | `/api/threads/search` | body `{ keyword }` — stops any running process, spawns one-shot keyword scrape |
| `GET` | `/api/threads/stream` | SSE — scraper stdout/stderr, buffered last 200 lines |
| `GET` | `/api/threads/posts` | paginated posts; no `keyword` param → home feed (`keyword IS NULL`); `keyword=ai` → that keyword's posts. Optional: `sortBy=scraped\|posted`, `mediaTypes=IMAGE,VIDEO,CAROUSEL,TEXT`, `timeWindow` (hours, filters by published time with scrape-time fallback) |
| `GET` | `/api/threads/velocity` | viral score leaderboard — composite score (Δlikes×1 + Δreplies×2 + Δreposts×3) / minutes, 6h window, sorted by score desc. Params: `limit`, `maxAge` (minutes) |

**Safety:**
- Default 5–15 min random interval. Don't go below 3 min.
- Keep `SCROLL_COUNT` at 3–8. High values increase detection risk.
- Run during active hours only. Don't leave running overnight.
- One instance only — never run two sessions against the same browser profile.
- Read-only — never clicks, likes, replies, or posts.

**Env overrides:**
```bash
SCROLL_COUNT=8 npm run scraper:start          # more posts per cycle
MIN_INTERVAL=3 MAX_INTERVAL=8 npm run scraper:start  # faster polling
```

> **Do not use `HEADLESS=1`** — headless browsers are easier for Meta to detect.

**Debugging:**
If the feed shows 0 posts, check that extraction is working:
```bash
cd scraper && npx ts-node src/cli/test-scrape.ts
```

If post containers are found but counts are wrong, Threads may have changed button `aria-label` values — inspect `div[role="button"]` SVG labels in the page.

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
- **Storage** — Supabase (products, accounts, calendar posts, trend snapshots, platform configs) · LocalStorage (API key, timezone, pulse starred/preferences)
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

---

## Current status

**Working as of 2026-04-20.**

- Scraper login, post extraction, engagement counts, Supabase persistence — functional
- Scraper control from browser UI (Start/Stop/Logs via SSE) — functional
- Feed and leaderboard tabs — functional (data served from Supabase, visible when deployed and locally)
- Local server detected at runtime — control bar appears automatically when `npm run scraper:server` is running, even on the deployed Vercel app; no `.env.local` required
- Feed cards: published time + `scraped [date time]` + scraper user ID label; media type badges; age-band left border — functional
- Feed sort by scraped time or published time — functional
- Feed media type filter (All / Img / Vid / Carousel / Text, multi-select) — functional
- Feed time window (Live · 6h / 24h / 48h / All) — filters by published time with scrape-time fallback; "All" shows every saved post regardless of age — functional
- Feed shows count of posts hidden by the active time window with a one-click "show all" link — functional
- Feed scraper filter row — populated dynamically from scrapers in current results; multi-select chips — functional
- Leaderboard viral score: composite velocity (Δlikes×1 + Δreplies×2 + Δreposts×3) / minutes, 6h window — computed via Supabase RPC
- Cross-bubble score boost: leaderboard score multiplied by `1 + (scraper_count − 1) × 0.5` — posts seen by multiple scrapers rank higher
- Leaderboard cards show "seen by N scrapers" badge + amber left border when scraper_count > 1 — functional
- Scraper attribution: each post tagged with `scraper_user_id`; sightings tracked in `threads_post_scrapers` junction table
- Multi-scraper support: multiple team members scrape from their own Threads accounts; all data merges into the shared Supabase project
- Existing SQLite data migrated via `npm run scraper:migrate`

**Known Windows-specific notes:**
- Scraper must be spawned with `stdio: ['inherit', 'pipe', 'pipe']` — Chrome exits with code 21 if stdin handle is `INVALID_HANDLE_VALUE`
- ts-node is invoked via `process.execPath` + `ts-node/dist/bin.js` directly (no shell layer) — avoids Playwright pipe handle inheritance issues with `shell: true`

---

## What's next

- **Topbar title** — add `'/scraper': 'Scraper'` to the `pageTitles` map in `src/components/Topbar.jsx`
- **Additional scraper tabs** — Scraper view is tab-structured for future platforms (Instagram, X, etc.)

---

## Privacy

Supabase data (including scraped Threads posts) is synced to your Supabase project. Gemini API calls send prompt text to Google's API — see [Google's privacy policy](https://policies.google.com/privacy).

## Out of scope — Phase 1

- OAuth / live platform connections
- Actual post scheduling and publishing automation
- Engagement triage and reply drafts
- Validation dashboard and signal scoring
- User roles and permissions
