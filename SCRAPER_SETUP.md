# Social Amp Scraper — Setup Guide

This tool runs quietly on your computer and collects posts from your Threads feed. Everyone on the team shares the same dashboard at **social-amp.vercel.app** — the more people running the scraper, the better the data.

---

## Before you start

You will need:
- The **Supabase URL** and **Supabase Service Key** — ask Tony
- Your **Threads login** (your personal account)
- About 10 minutes and a stable internet connection

---

## One-time setup

### Mac

1. Extract this zip to a permanent location — for example, your **Documents** folder. Do not move it afterwards.
2. Double-click **install-mac.command**
3. If you see a security warning, right-click the file → **Open** → **Open**
4. A Terminal window opens and walks you through the rest:
   - If Node.js is missing, it opens the download page — install it, come back, press Enter
   - It downloads a browser (~150 MB) — this takes a minute
   - It asks for your credentials — enter the Supabase URL, Service Key, and your first name
   - It opens a browser window — log in to Threads, then close the browser
5. Done — a **"Start Scraper"** shortcut appears on your Desktop

### Windows

1. Extract this zip to a permanent location — for example, your **Documents** folder. Do not move it afterwards.
2. Double-click **install-windows.bat**
3. If Windows shows a blue warning screen, click **More info** → **Run anyway**
4. A window opens and walks you through the rest:
   - If Node.js is missing, it opens the download page — install it, come back, press Enter
   - It downloads a browser (~150 MB) — this takes a minute
   - It asks for your credentials — enter the Supabase URL, Service Key, and your first name
   - It opens a browser window — log in to Threads, then close the browser
5. Done — a **"Start Scraper"** shortcut appears on your Desktop

---

## Every day

1. Double-click **Start Scraper** on your Desktop
2. A window opens — **keep it open** while you work (closing it stops the scraper)
3. Go to **social-amp.vercel.app** in your browser
4. Click **Scraper** in the sidebar — Start/Stop controls will appear

That's it. Your posts will appear in the shared feed for the whole team.

---

## Stopping the scraper

Close the "Start Scraper" window. You can reopen it whenever you want to start again.

---

## Troubleshooting

**"Start Scraper" shortcut doesn't work**
The scraper folder was moved after setup. Re-run the installer from its new location.

**Scraper controls don't appear on the website**
The local server isn't running. Double-click "Start Scraper" on your Desktop first.

**Browser opens but Threads doesn't load**
Check your internet connection, then close and reopen the Start Scraper window.

**Something else is wrong**
Slack Tony with a screenshot.

---

## Important notes

- **Do not move the extracted folder** after setup — the desktop shortcut points to it directly
- The scraper only reads posts — it never likes, replies, or posts anything
- Your Threads session is saved privately on your own computer
- Scraped posts are visible to the whole team in the shared feed
