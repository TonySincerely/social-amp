# Social Amp — To-Do

## Backlog

- [x] **Twitter scraper — Phase 3: Account Tracker + Watched Accounts** — Reply-timing dashboard (posts from watched accounts, <10min old, sorted by reply score, pulsing dot when live posts exist). Includes watched accounts management UI and `twitter-accounts.ts` scraping CLI. No auto-refresh. All backend (RPC, service calls, storage functions) already built.
- [ ] **Twitter scraper — Phase 4: Trending tab + account scraping** — Trending topics snapshot from X Explore page + dedicated account scraping loop.

- [x] **Create post button** — Quick-create CTA at the top of the sidebar nav, always accessible regardless of current view
- [ ] **Reorder menu items** — Review and adjust sidebar navigation order for better workflow progression
- [x] **Visual descriptor section** — Add an inspiration/mood section to Content Studio (images, adjectives, visual references) that feeds into draft generation as creative context
- [ ] **Token efficiency review** — Audit all Gemini prompts for unnecessary verbosity; reduce input token usage without degrading output quality

- [x] **Booster module — Phase 1** — Shell, sidebar nav, Topbar title, Supabase migration (`booster_trackers`), 7 panel stubs (Setup/Voice/Topics/Draft/Analyze/Predict/Review), multi-handle selector
- [x] **Booster module — Phase 2** — Profile scraper: `threads-profile.ts` + `booster-db.ts` + `profile-scrape.ts` + `/api/booster/profile/*` server routes + SetupPanel Path D UI (scrape button, scroll count selector, SSE log panel)
- [x] **Booster module — Phase 3** — Setup panel: all 5 paths (API/file/paste/scrape/migrate), client-side normalization for all JSON formats, Gemini fallback for unstructured text, style guide + concept library generation with inline preview
- [x] **Booster module — Phase 4** — Topics panel
- [x] **Booster module — Phase 5** — Analyze panel
- [x] **Booster module — Phase 6** — Voice panel
- [x] **Booster module — Phase 7** — Draft panel
- [x] **Booster module — Phase 8** — Predict panel
- [x] **Booster module — Phase 9** — Review panel
- [x] **Click-to-create on calendar** — Clicking a date directly on the calendar grid opens a create post flow for that date (no planner required for single posts)
