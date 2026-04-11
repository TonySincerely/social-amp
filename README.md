# Social Amp

An internal tool for validating product ideas through coordinated social media activity. AI-assisted content creation across multiple accounts — no OAuth, no live posting, all data stays local.

## What it does

| Module | Path | Purpose |
|--------|------|---------|
| **Products** | `/products` | Create and manage product briefs. Name, problem statement, target persona, KSPs, platform selection, stage, visual tones, preferred colors, and content languages. |
| **Accounts** | `/accounts` | Manage social accounts and their posting voices. Tone preset, free-text persona, and per-account language tags. |
| **Playbook** | `/playbook` | Per-platform limits (char, word, hashtag, link, video) and named content strategies. Active strategy directives are injected into every draft. Limits are injected as hard constraints. |
| **Content Studio** | `/studio/:id` | Generate platform-adapted drafts for multiple accounts × languages in parallel. Visual descriptor panel, AI image generation, inline editing, char/word count, approve/needs-work status, save to calendar. |
| **Calendar Planner** | `/planner` | Generate a full month of skeleton post slots based on best-practice frequency, optimal times, and platform-specific day distribution. |
| **Calendar** | `/calendar` | Monthly grid of all posts. Draft slots (from planner) and ready posts (from studio) shown with distinct visual states. |
| **Pulse** | `/pulse` | Daily trend and planning view. Upcoming cultural moments (next 6 weeks, region-aware) alongside live trend snapshots across Twitter, Reddit, Instagram, and the web. Star trends, send directly to Content Studio as an angle. |
| **Quick Create** | Sidebar `+ New Post` | Right-side overlay drawer. 4-step wizard to go from zero to a scheduled post without leaving the current view. |

## How it works

### Product setup

Create a product brief — name, problem statement, target persona, key selling points (up to 6 chips, press Enter to add), platform selection, stage, and validation goal. KSPs feed directly into AI prompts as selling context.

Hard required fields (block save): name, problem statement, target persona, at least one platform.
Soft required fields (warning only): stage, validation goal.

**Visual tones** — optional mood or style descriptors (e.g. *minimalist*, *editorial*, *warm*) stored on the product and pre-loaded in Content Studio. Injected into draft prompts as a `Visual aesthetic:` line and used as context for image generation.

**Preferred colors** — optional color descriptions (e.g. *warm ivory*, *deep navy*) stored alongside visual tones.

**Content languages** — one or more languages assigned to the product as a default. Accounts can override this with their own language tags.

On save, the product opens directly in the Content Studio.

### Accounts

Accounts store platform, handle, follower count, one or more **language tags**, a **tone preset**, and an optional free-text **persona**.

- **Language tags** — per-account language selection (e.g. English, Traditional Chinese). When set, overrides the product's language list for that account. When not set, falls back to the product's language list, then English.
- **Tone preset** — default voice style when no persona is set.
- **Persona** — free text; overrides tone preset and all identity/tone instructions at generation time.

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
2. **Setup** — enter or select an angle. If a trend brief exists, angles are shown as clickable chips immediately; a refresh icon lets you update them. A collapsible Visual section carries over mood and color descriptors. Select accounts to generate for. Angle and accounts are optional — if either is missing, a warning banner replaces the footer and asks you to confirm before continuing. Missing context reduces draft quality but doesn't block.
3. **Draft** — generate one draft per account × language slot in parallel, using the same Playbook limits and active strategy directives as Content Studio. Per-tab approve/needs-work controls. At least one approved draft is required to advance; if some remain unapproved, a confirmation dialog warns that they will be discarded.
4. **Schedule** — pick a publish date and time (down to the hour). The dominant platform of the selected accounts drives an inline time recommendation (e.g. *11:00 AM recommended · instagram*) with a one-click "Use" button. The step 4 summary lists only approved posts and shows an "image" badge on any slot with a generated image.

On save, each approved draft is written to the calendar as a `ready` post. If an image was generated for that slot, `imageBase64`, `imageMimeType`, and `imagePrompt` are stored on the record. The drawer closes and navigates to the calendar for the saved month.

### Calendar Planner

1. **Setup** — pick a month, confirm timezone (auto-detected), select one or more products.
2. **Frequency** — set posts per week per platform per product. Recommended ranges shown inline.
3. **Review** — mini calendar shows proposed slots colour-coded by product. Click any date to inspect and delete individual slots. Collisions (same account twice in a day) flagged with an amber warning.
4. **Confirm** — summary of total posts, then save. All slots land in the calendar as drafts.

Draft slots show as dashed amber chips on the calendar. Click to open the drawer and hit **Write in Studio →** — the studio opens with angle, account, and date pre-filled.

### Pulse

1. **Upcoming** — cultural moments and events in the next 6 weeks, filtered by region. Driven by a static events file (`src/data/upcomingEvents.js`) — no API call required. Each card shows date, platforms, a suggested angle, and **Add to planner →**.
2. **Live Trends** — hit **Refresh** to fetch a live trend snapshot (single grounded Gemini call). Each refresh prepends a new timestamped block; previous snapshots push down so you can compare what changed across the day. Platform filter chips narrow the view client-side.
3. **Star** any trend to bookmark it (stored in LocalStorage). **Post as →** sends the trend topic as a pre-filled angle to the Content Studio — an inline dropdown picks the product if you have more than one.
4. Twitter and Instagram cards are labelled **search-derived** — they come from Google Search grounding rather than a live platform API.

Snapshots are stored in IndexedDB and pruned automatically to the 5 most recent.

## AI generation model

Every draft is shaped by layered instructions in this order (bottom = highest model attention):

1. Product context — name, problem statement, persona, KSPs
2. Voice — identity instruction or persona override
3. Tone — post intent (omitted when persona is set)
4. Visual aesthetic — mood/style descriptors and preferred colors (omitted when empty)
5. Writing rules — native format, angle-first, subtle CTA
6. **Language directive** — injected for non-English drafts only
7. **Hard constraints** — platform limits from Playbook (char, word, hashtag, link)
8. **Strategy directives** — extracted directives from active Playbook strategy

Constraints at positions 6–8 are placed last in the prompt to maximise adherence. Word limit is the most reliable length control — set it in Playbook Limits rather than relying on a strategy directive alone.

## Tech stack

- **React 19 + Vite 7** — React Router v7
- **State** — React Context (`AppContext` — API key modal + quick create drawer) + component `useState`
- **Storage** — IndexedDB via `idb` (v3: products, accounts, calendarPosts, trendSnapshots, platformConfigs) · LocalStorage (API key, timezone, pulse preferences)
- **AI** — `@google/generative-ai` SDK — Gemini Flash / Pro with Google Search grounding for trend briefs and pulse snapshots; standard generation for drafts and strategy distillation; `gemini-2.5-flash-image` (Nano Banana) via direct `fetch` for post image generation
- **Scheduling** — `src/services/planner.js` — pure JS, no AI calls
- **Styling** — CSS custom properties (`src/styles/tokens.css`)
- **Upcoming events** — `src/data/upcomingEvents.js` — static recurring calendar, region-aware, variable-date computation

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey). Click the settings icon (top right) to enter it. The key is stored in LocalStorage and only ever sent to Google's Gemini API.

> **Image generation** requires a paid Gemini API plan. Draft generation and trend features work on the free tier.

## Project structure

```
src/
├── components/         # Layout, Sidebar, Topbar, Icons, ApiKeyModal, QuickCreateDrawer
├── context/            # AppContext — API key modal state
├── data/
│   ├── upcomingEvents.js   # Static region-aware cultural calendar
│   ├── visualPresets.js    # Mood/style preset chips for Content Studio
│   └── languages.js        # Supported language list + short labels
├── services/
│   ├── gemini.js       # Trend brief, pulse snapshot, draft generation, strategy distillation, image generation
│   ├── storage.js      # IndexedDB CRUD + platform config defaults
│   └── planner.js      # Scheduling algorithm — best-practice day/time distribution
├── styles/
│   └── tokens.css      # Design tokens
└── views/
    ├── ProductList/    # Product dashboard with KSP pills
    ├── ProductSetup/   # Brief form — name, problem, persona, KSPs, platforms, stage, goal, visual tones, languages
    ├── AccountHub/     # Account + persona + language management
    ├── Playbook/       # Platform limits + content strategy management
    ├── ContentStudio/  # Draft generation, visual descriptors, image generation, multi-language slots, save to calendar
    ├── Planner/        # 4-step scheduling flow
    ├── Calendar/       # Monthly grid — draft and ready post states
    └── Pulse/          # Upcoming events + live trend snapshots
```

## Data model

All data is stored locally in IndexedDB under the `socialamp` database (v3).

**Products** — `{ id, name, problemStatement, targetPersona, ksp[], stage, platforms[], accountIds[], validationGoal, trendBrief, visualTones[], preferredColors[], languages[], createdAt, updatedAt }`

- `trendBrief` — `{ topics[], angles[], competitors[], fetchedAt }` — fetched on demand in the studio, preserved across edits.
- `visualTones[]` — mood/style descriptors (e.g. `["minimalist", "editorial"]`)
- `preferredColors[]` — color descriptions (e.g. `["warm ivory", "deep navy"]`)
- `languages[]` — default language list for the product (e.g. `["English", "Traditional Chinese"]`)

**Accounts** — `{ id, handle, platform, followerCount, tonePreset, persona, languages[], createdAt, updatedAt }`

- `languages[]` — per-account language override; if set, takes priority over the product's language list
- `tonePreset` — default tone when no persona is set (educator, puncher, helper, jester, closer, storyteller, neutral)
- `persona` — free text; when set, overrides all identity and tone instructions at generation time

**Calendar posts** — `{ id, productId, accountId, platform, accountHandle, copy, angle, identity, postTone, date, time, monthKey, scheduledOffset, status, imageBase64?, imageMimeType?, imagePrompt?, createdAt, updatedAt }`

`status` — `'draft'` for planner skeleton slots · `'ready'` for posts with written copy.

`time` — optional `HH:MM` string set when the post is saved from Quick Create or Content Studio with a time selected.

`imageBase64` / `imageMimeType` / `imagePrompt` — optional; present when an image was generated for the post in Content Studio or Quick Create.

**Trend snapshots** — `{ id, location, region, fetchedAt, trends[], upcomingBuzz[], createdAt }`

Pruned to 5 most recent on each save.

**Platform configs** — `{ platform, limits: { charLimit, wordLimit, hashtagLimit, linkInPost, videoMaxSec }, strategies[], selectedStrategyId, updatedAt }`

`strategies[]` — `{ id, name, content, directives[], distilledAt, createdAt }` — `directives` is the AI-extracted list injected into prompts; `content` is the raw source document kept for editing.

## Privacy

All data is stored in your browser. Nothing is synced to a server. Gemini API calls send prompt text to Google's API — see [Google's privacy policy](https://policies.google.com/privacy).

## Out of scope — Phase 1

- OAuth / live platform connections
- Actual post scheduling and publishing automation
- Engagement triage and reply drafts
- Validation dashboard and signal scoring
- User roles and permissions
