/**
 * Search — one-shot keyword scrape.
 *
 * Options (env vars):
 *   KEYWORD=ai       Keyword to search (required)
 *   HEADLESS=1       Run browser in headless mode (default: headful)
 *   SCROLL_COUNT=3   Number of scrolls (default: 3)
 */

import { launchBrowser, isLoggedIn, navigateToSearch } from '../agent/browser';
import { scrapeFeed, setupCounterInterceptor } from '../agent/scraper';
import { savePosts, saveSnapshots, closeDb } from '../storage/db';

const KEYWORD      = (process.env.KEYWORD || '').trim();
const HEADLESS     = process.env.HEADLESS === '1';
const SCROLL_COUNT = parseInt(process.env.SCROLL_COUNT || '3', 10);

async function main() {
  if (!KEYWORD) {
    console.error('❌ KEYWORD env var is required.');
    process.exit(1);
  }

  console.log(`🔍 Keyword search: "${KEYWORD}"`);
  console.log(`   Scrolls: ${SCROLL_COUNT}`);
  console.log(`   Storage: Supabase (${process.env.SUPABASE_URL})\n`);

  const { context, page } = await launchBrowser(HEADLESS);

  console.log('⏳ Verifying login...');
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    console.error('❌ Not logged in. Run `npm run scraper:login` first.');
    await context.close();
    process.exit(1);
  }
  console.log('✅ Logged in.\n');

  const interceptor = setupCounterInterceptor(page);

  const shutdown = async () => {
    interceptor.stop();
    closeDb();
    await context.close();
  };
  process.on('SIGTERM', shutdown);

  try {
    console.log(`⏳ Navigating to search: "${KEYWORD}"`);
    await navigateToSearch(page, KEYWORD);

    const posts            = await scrapeFeed(page, SCROLL_COUNT);
    const counterSnapshots = interceptor.flush();

    const { newCount } = await savePosts(posts, KEYWORD);
    console.log(`\n💾 Saved: ${newCount} posts → Supabase`);

    if (counterSnapshots.length > 0) {
      const saved = await saveSnapshots(counterSnapshots);
      console.log(`📊 Counter snapshots: ${saved}`);
    }

    console.log(`\n✅ Search complete — ${posts.length} posts for "${KEYWORD}"`);
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
  }

  await shutdown();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal:', err.message);
  closeDb();
  process.exit(1);
});
