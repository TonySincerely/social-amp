/**
 * Twitter/X home feed scraper — continuous loop.
 *
 * Env overrides:
 *   HEADLESS=1           Run headless (not recommended — higher detection risk)
 *   SCROLL_COUNT=3       Scrolls per cycle (default: 3, keep ≤ 4 for Twitter)
 *   MIN_INTERVAL=8       Minimum minutes between cycles (default: 8)
 *   MAX_INTERVAL=20      Maximum minutes between cycles (default: 20)
 *   SINGLE_RUN=1         One cycle then exit (used by the UI server)
 */

import { launchTwitterBrowser, navigateToTwitterHome } from '../agent/twitter-browser';
import { scrapeTwitterFeed } from '../agent/twitter-scraper';
import { saveTweets } from '../storage/twitter-db';
import { randomDelay } from '../agent/browser';
import { CONFIG } from '../config';

const HEADLESS     = process.env.HEADLESS === '1';
const SCROLL_COUNT = parseInt(process.env.SCROLL_COUNT  || '3',  10);
const MIN_INTERVAL = parseInt(process.env.MIN_INTERVAL  || String(CONFIG.TWITTER_POLL_INTERVAL_MIN_MS / 60000), 10) * 60 * 1000;
const MAX_INTERVAL = parseInt(process.env.MAX_INTERVAL  || String(CONFIG.TWITTER_POLL_INTERVAL_MAX_MS / 60000), 10) * 60 * 1000;
const SINGLE_RUN   = process.env.SINGLE_RUN === '1';

async function main() {
  console.log('🐦 Twitter Tracker — Starting');
  console.log(`   Mode: ${HEADLESS ? 'headless' : 'headful'}`);
  console.log(`   Scrolls per cycle: ${SCROLL_COUNT}`);
  console.log(`   Interval: ${MIN_INTERVAL / 60000}–${MAX_INTERVAL / 60000} minutes`);
  console.log(`   Storage: Supabase (${process.env.SUPABASE_URL})\n`);

  const { context, page } = await launchTwitterBrowser(HEADLESS);

  let running = true;
  const shutdown = async () => {
    console.log('\n\n🛑 Shutting down...');
    running = false;
    await context.close();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  let cycleCount = 0;

  while (running) {
    cycleCount++;
    const cycleStart = new Date();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Cycle #${cycleCount} — ${cycleStart.toLocaleTimeString()}`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
      await navigateToTwitterHome(page);
      const tweets = await scrapeTwitterFeed(page, SCROLL_COUNT);
      const { newCount } = await saveTweets(tweets, 'home');
      console.log(`\n  💾 Saved: ${newCount} tweets → Supabase`);
    } catch (err: any) {
      console.error(`\n  ❌ Cycle error: ${err.message}`);
      if (err.message.includes('login') || err.message.includes('navigation')) {
        console.error('  ⚠️  Session may have expired. Stopping.');
        break;
      }
    }

    if (SINGLE_RUN) break;

    const interval = randomDelay(MIN_INTERVAL, MAX_INTERVAL);
    const nextTime = new Date(Date.now() + interval);
    console.log(`\n  ⏰ Next cycle at ${nextTime.toLocaleTimeString()} (${(interval / 60000).toFixed(1)} min)`);
    console.log('     Press Ctrl+C to stop.\n');

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, interval);
      if (!running) { clearTimeout(timer); resolve(); }
    });
  }

  await shutdown();
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
