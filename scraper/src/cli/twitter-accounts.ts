/**
 * Twitter/X account tracker scraper.
 * Scrapes the profile feed of each watched account and saves tweets
 * with source='account' so they appear in the Account Tracker tab.
 *
 * Usage: npm run twitter:accounts
 *
 * Env overrides:
 *   SCROLL_COUNT=2      Scrolls per account (default: 2 — keep low)
 *   MAX_ACCOUNTS=5      Max accounts per cycle (default: 5)
 *   HEADLESS=1          Headless mode (not recommended)
 */

import { launchTwitterBrowser, navigateToTwitterProfile } from '../agent/twitter-browser';
import { scrapeTwitterFeed } from '../agent/twitter-scraper';
import { saveTweets, getWatchAccounts } from '../storage/twitter-db';
import { randomDelay } from '../agent/browser';

const SCROLL_COUNT  = parseInt(process.env.SCROLL_COUNT  || '2', 10);
const MAX_ACCOUNTS  = parseInt(process.env.MAX_ACCOUNTS  || '5', 10);
const HEADLESS      = process.env.HEADLESS === '1';

async function main() {
  const accounts = await getWatchAccounts();

  if (accounts.length === 0) {
    console.log('ℹ️  No watched accounts configured. Add accounts in the Account Tracker tab first.');
    process.exit(0);
  }

  const toScrape = accounts.slice(0, MAX_ACCOUNTS);
  console.log('🎯 Twitter — Account Tracker scrape');
  console.log(`   Accounts: ${toScrape.map(a => '@' + a.username).join(', ')}`);
  console.log(`   Scrolls per account: ${SCROLL_COUNT}\n`);

  const { context, page } = await launchTwitterBrowser(HEADLESS);

  const shutdown = async () => {
    await context.close();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  let totalSaved = 0;

  for (let i = 0; i < toScrape.length; i++) {
    const account = toScrape[i];
    console.log(`\n  → @${account.username} (${i + 1}/${toScrape.length})`);
    try {
      await navigateToTwitterProfile(page, account.username);
      const tweets = await scrapeTwitterFeed(page, SCROLL_COUNT);
      const { newCount } = await saveTweets(tweets, 'account', undefined, account.username);
      console.log(`     💾 ${newCount} tweets saved`);
      totalSaved += newCount;
    } catch (err: any) {
      console.error(`     ❌ ${err.message}`);
    }

    // Human-like pause between accounts — skip after last one
    if (i < toScrape.length - 1) {
      const delay = randomDelay(3000, 8000);
      console.log(`     ⏳ Waiting ${(delay / 1000).toFixed(1)}s before next account...`);
      await page.waitForTimeout(delay);
    }
  }

  console.log(`\n  ✅ Done — ${totalSaved} total tweets saved`);
  await context.close();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
