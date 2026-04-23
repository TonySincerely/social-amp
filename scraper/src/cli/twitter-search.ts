/**
 * Twitter/X keyword search scraper — one-shot.
 * Navigates to the search URL for KEYWORD, scrapes tweets, saves to Supabase
 * with source='keyword' so they appear in the keyword tab.
 *
 * Usage:
 *   KEYWORD=ai npx ts-node src/cli/twitter-search.ts
 *   npm run twitter:search  (set KEYWORD in env or .env)
 */

import { launchTwitterBrowser, navigateToTwitterSearch } from '../agent/twitter-browser';
import { scrapeTwitterFeed } from '../agent/twitter-scraper';
import { saveTweets } from '../storage/twitter-db';

const KEYWORD      = (process.env.KEYWORD || '').trim();
const SCROLL_COUNT = parseInt(process.env.SCROLL_COUNT || '3', 10);
const HEADLESS     = process.env.HEADLESS === '1';

async function main() {
  if (!KEYWORD) {
    console.error('❌  KEYWORD env var is required. Example: KEYWORD=ai npm run twitter:search');
    process.exit(1);
  }

  console.log(`🔍 Twitter — Keyword search: "${KEYWORD}"`);
  console.log(`   Scrolls: ${SCROLL_COUNT}`);
  console.log(`   Storage: Supabase (${process.env.SUPABASE_URL})\n`);

  const { context, page } = await launchTwitterBrowser(HEADLESS);

  const shutdown = async () => {
    await context.close();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await navigateToTwitterSearch(page, KEYWORD);
    const tweets = await scrapeTwitterFeed(page, SCROLL_COUNT);
    console.log(`\n  📦 Scraped ${tweets.length} tweets`);

    const { newCount } = await saveTweets(tweets, 'keyword', KEYWORD);
    console.log(`  💾 Saved: ${newCount} tweets for "${KEYWORD}" → Supabase`);
  } catch (err: any) {
    console.error(`\n❌ Search error: ${err.message}`);
  } finally {
    await context.close();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
