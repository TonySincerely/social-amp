/**
 * Start — continuous scraping loop.
 *
 * Options (env vars):
 *   HEADLESS=1        Run browser in headless mode (default: headful)
 *   SCROLL_COUNT=5    Number of scrolls per cycle (default: 3)
 *   MIN_INTERVAL=5    Minimum minutes between cycles (default: 5)
 *   MAX_INTERVAL=15   Maximum minutes between cycles (default: 15)
 */

import { launchBrowser, randomDelay } from '../agent/browser';
import { scrapeFeed, setupCounterInterceptor } from '../agent/scraper';
import { savePosts, saveSnapshots, closeDb } from '../storage/db';
import { CONFIG } from '../config';

const HEADLESS     = process.env.HEADLESS === '1';
const SCROLL_COUNT = parseInt(process.env.SCROLL_COUNT  || '3',  10);
const MIN_INTERVAL = parseInt(process.env.MIN_INTERVAL  || '5',  10) * 60 * 1000;
const MAX_INTERVAL = parseInt(process.env.MAX_INTERVAL  || '15', 10) * 60 * 1000;
const SINGLE_RUN   = process.env.SINGLE_RUN === '1';

async function main() {
  console.log('🚀 Threads Tracker — Starting');
  console.log(`   Mode: ${HEADLESS ? 'headless' : 'headful'}`);
  console.log(`   Scrolls per cycle: ${SCROLL_COUNT}`);
  console.log(`   Interval: ${MIN_INTERVAL / 60000}-${MAX_INTERVAL / 60000} minutes`);
  console.log(`   Storage: Supabase (${process.env.SUPABASE_URL})\n`);

  const { context, page } = await launchBrowser(HEADLESS);

  const interceptor = setupCounterInterceptor(page);

  let running = true;
  const shutdown = async () => {
    console.log('\n\n🛑 Shutting down...');
    running = false;
    interceptor.stop();
    closeDb();
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
      await page.goto(CONFIG.THREADS_HOME, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      const posts            = await scrapeFeed(page, SCROLL_COUNT);
      const counterSnapshots = interceptor.flush();

      const { newCount } = await savePosts(posts);
      console.log(`\n  💾 Saved: ${newCount} posts → Supabase`);

      if (counterSnapshots.length > 0) {
        const saved = await saveSnapshots(counterSnapshots);
        console.log(`  📊 Counter snapshots: ${saved}`);
      }
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
  closeDb();
  process.exit(1);
});
