# Social Amp

An internal tool for validating product ideas through coordinated social media activity. AI-assisted content creation across multiple accounts — no OAuth, no live posting, all data stays local.

## What it does

| Module | Path | Purpose |
|--------|------|---------|
| **Products** | `/products` | Create and manage product briefs. Each product has a name, problem statement, target persona, platform selection, and validation goal. |
| **Accounts** | `/accounts` | Manage social accounts and their posting voices. Set a persona (free-text, overrides tone) or choose a tone preset per account. No live platform connection. |
| **Content Studio** | `/studio/:id` | Generate platform-adapted copy drafts for multiple accounts in parallel. Per-account tone control, inline editing, approve/needs-work status, save to calendar. |
| **Calendar Planner** | `/planner` | Generate a full month of skeleton post slots based on best-practice posting frequency, optimal times, and platform-specific day distribution. |
| **Calendar** | `/calendar` | Monthly grid of all posts. Draft slots (from planner) and ready posts (from studio) shown with distinct visual states. |

## How it works

### Product setup (Module 1)

Create a product with a brief — name, problem statement, target persona, platform selection, and optional validation goal. On save, the AI immediately pre-populates a trend brief in the background so the Content Studio is ready when you arrive.

Hard required fields (block save): name, problem statement, target persona, at least one platform.
Soft required fields (warning only): product stage, validation goal.

### Content Studio (Module 2)

1. Open a product — trend brief is pre-loaded. Refresh if older than 24 hours.
2. Pick an angle from the AI-suggested list or type your own.
3. Select which accounts will post. Each account shows its voice (persona or tone preset).
4. For accounts without a persona, choose a tone preset. The persona always overrides.
5. Hit Generate — one draft per account, all in parallel.
6. Review drafts in per-account tabs. Edit inline, regenerate individually, mark approved or needs work.
7. Once all drafts are approved, save to the calendar with a date.

### Calendar Planner

1. **Setup** — pick a month, confirm your timezone (auto-detected), select one or more products.
2. **Frequency** — set posts per week per platform per product. Recommended ranges shown inline.
3. **Review** — mini calendar shows proposed slots colour-coded by product. Click any date to inspect and delete individual slots. Collisions (same account twice in a day) flagged with amber warning.
4. **Confirm** — summary of total posts, then save. All slots land in the calendar as drafts.

Draft slots on the calendar show a dashed amber chip. Click to open the drawer and hit **Write in Studio →** — the Content Studio opens with the angle, account, and date pre-filled. Saving from the studio marks the slot as ready.

### Tone presets

Six presets map to AI prompt variables (length, helpfulness, humor, formality):

| Preset | Best for |
|--------|----------|
| Educator | LinkedIn, Reddit, expert accounts |
| Puncher | X, Threads, opinionated content |
| Helper | Instagram, Facebook, community accounts |
| Jester | Threads, viral/humor posts |
| Closer | Launch week, preorder pushes |
| Storyteller | Instagram captions, founder accounts |

A saved persona on an account overrides the tone preset entirely.

## Tech stack

- **React 19 + Vite 7** — React Router v7
- **State** — React Context + component `useState`
- **Storage** — IndexedDB via `idb` (products, accounts, calendar posts) · LocalStorage (API key, timezone)
- **AI** — `@google/generative-ai` SDK (Gemini Flash / Pro with Google Search grounding for trend briefs)
- **Scheduling** — `src/services/planner.js` — pure JS, no AI calls (skeleton mode)
- **Styling** — CSS custom properties (`src/styles/tokens.css`)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey). Click the settings icon (top right) to enter it. The key is stored in LocalStorage and only ever sent to Google's Gemini API.

## Project structure

```
src/
├── components/         # Layout, Sidebar, Topbar, Button, Icons, ApiKeyModal
├── context/            # AppContext — API key state
├── services/
│   ├── gemini.js       # Trend brief + multi-account draft generation
│   ├── storage.js      # IndexedDB CRUD (products, accounts, calendarPosts)
│   └── planner.js      # Scheduling algorithm — best-practice day/time distribution
├── styles/
│   └── tokens.css      # Design tokens
└── views/
    ├── ProductList/    # Product dashboard
    ├── ProductSetup/   # Module 1 — brief form + account selection
    ├── AccountHub/     # Account + persona management
    ├── ContentStudio/  # Module 2 — draft generation + review
    ├── Planner/        # Calendar planner — 4-step scheduling flow
    └── Calendar/       # Monthly grid with draft + ready states
```

## Data model

All data is stored locally in IndexedDB under the `socialamp` database.

**Products** — `{ id, name, problemStatement, targetPersona, stage, platforms[], accountIds[], validationGoal, trendBrief, createdAt }`

**Accounts** — `{ id, handle, platform, followerCount, persona, tonePreset, createdAt }`

**Calendar posts** — `{ id, productId, accountId, platform, accountHandle, copy, angle, tonePreset, date, time, monthKey, status }`

`status` is `'draft'` for planner-generated skeleton slots and `'ready'` for posts with copy written in the studio.

## Privacy

All data is stored in your browser. Nothing is synced to a server. Gemini API calls send your prompt text to Google's API — see [Google's privacy policy](https://policies.google.com/privacy).

## Out of scope — Phase 1

- OAuth / live platform connections
- Actual post scheduling and publishing automation
- Image generation
- Engagement triage and reply drafts
- Validation dashboard and signal scoring
- Multi-language support
- User roles and permissions
