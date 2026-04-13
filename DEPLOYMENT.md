# Deployment Guide — Supabase + Vercel

## Prerequisites
- GitHub repo pushed and up to date
- Supabase project created at supabase.com
- Vercel account at vercel.com (sign in with GitHub)
- Gemini API key from aistudio.google.com

---

## 1. Run the database schema

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Paste the full contents of `supabase/schema.sql`
5. Click **Run** — every statement should return "Success"

Only needs to be done once. Re-running is safe (uses `create table` without `if not exists` — if you need to reset, drop tables first).

---

## 2. Generate AUTH_SECRET

Run in terminal:

```bash
openssl rand -hex 32
```

Save the output — this is your `AUTH_SECRET`. It's a random token stored in the auth cookie. Never share it or commit it.

---

## 3. Create the Vercel project

1. Go to vercel.com → **Add New… → Project**
2. Import the GitHub repo
3. Framework preset auto-detects as **Vite** — leave all build settings as-is
4. Do not click Deploy yet — add environment variables first (same screen, scroll down)

---

## 4. Set environment variables in Vercel

In the project setup screen (or later via Project → Settings → Environment Variables), add all 5:

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `VITE_GEMINI_API_KEY` | aistudio.google.com/app/apikey |
| `AUTH_PASSWORD` | The password users will type to access the site |
| `AUTH_SECRET` | The hex string from Step 2 |

`VITE_*` variables are bundled into the client JS at build time. `AUTH_PASSWORD` and `AUTH_SECRET` are server-only — never exposed to the browser.

---

## 5. Deploy

Click **Deploy**. Vercel builds the Vite app and deploys in ~1 minute. You'll get a `.vercel.app` URL on completion.

Any subsequent `git push` to `master` triggers an automatic redeploy.

---

## 6. Verify the deployment

1. Open the `.vercel.app` URL → should redirect to `/login`
2. Enter the `AUTH_PASSWORD` → should reach the app
3. Create a test record → refresh the page → confirm it persists (proves Supabase is wired up)
4. Open a second browser or incognito window → confirm it sees the same data

---

## Local development

Create `.env.local` in the project root (gitignored — never committed):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GEMINI_API_KEY=AIza...
```

`AUTH_PASSWORD` and `AUTH_SECRET` are not needed locally — the password gate only runs on Vercel.

```bash
npm run dev
```

Local dev hits the same Supabase database as production. If you want an isolated dev database, create a second Supabase project and point `.env.local` there.

---

## Updating environment variables

1. Vercel → Project → **Settings → Environment Variables**
2. Edit the variable
3. Go to **Deployments** → find the latest deployment → **Redeploy** (to pick up the new value without a code push)

---

## Custom domain (optional)

1. Vercel → Project → **Settings → Domains**
2. Add your domain and follow the DNS instructions
3. SSL is provisioned automatically

---

## Resetting the database

To wipe all data and start fresh:

```sql
-- Run in Supabase SQL Editor
truncate table products, accounts, calendar_posts, trend_snapshots, platform_configs;
```

To fully recreate the schema (destructive):

```sql
drop table if exists products, accounts, calendar_posts, trend_snapshots, platform_configs cascade;
-- then re-run supabase/schema.sql
```
