/**
 * Test scroll — scrape feed with scrolling and save to database.
 * Opens your saved session, loads the feed, scrolls 3 times,
 * extracts posts, saves to SQLite, prints summary.
 *
 * Usage: npm run test-scroll
 */

import { launchBrowser, isLoggedIn } from '../agent/browser';
import { scrapeFeed } from '../agent/scraper';
import { setupCounterInterceptor } from '../agent/scraper';
import { savePosts, saveSnapshots, getStats, closeDb } from '../storage/db';
import { getTopPosts } from '../analyzer/velocity';
import { CONFIG } from '../config';

async function main() {
  console.log('🧪 Threads Tracker — Test Scroll');
  console.log(`   Profile: ${CONFIG.BROWSER_PROFILE_DIR}`);
  console.log(`   Database: ${CONFIG.DB_PATH}\n`);

  const { context, page } = await launchBrowser(false);

  try {
    console.log('⏳ Loading feed...');
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      console.error('❌ Not logged in. Run `npm run login` first.');
      return;
    }

    // Set up counter interception (Strategy B)
    const interceptor = setupCounterInterceptor(page);

    // Wait for feed to hydrate
    await page.waitForTimeout(5000);

    // Scrape with scrolling (Strategy A)
    console.log('\n📜 Scraping feed with 3 scrolls...\n');
    const posts = await scrapeFeed(page, 3);

    // Flush any counter-refresh snapshots captured during scrolling
    const counterSnapshots = interceptor.flush();
    interceptor.stop();

    // Save to database
    console.log('\n💾 Saving to database...');
    const { newCount, updatedCount } = savePosts(posts);
    console.log(`   Posts: ${newCount} new, ${updatedCount} updated`);

    if (counterSnapshots.length > 0) {
      const savedSnaps = saveSnapshots(counterSnapshots);
      console.log(`   Counter snapshots: ${savedSnaps} saved (from ${counterSnapshots.length} captured)`);
    }

    // Show top posts
    const topPosts = getTopPosts(10);
    if (topPosts.length > 0) {
      console.log('\n🏆 Top 10 posts by likes:\n');
      console.log('─'.repeat(80));
      for (const p of topPosts) {
        const textPreview = p.text
          ? p.text.substring(0, 80) + (p.text.length > 80 ? '...' : '')
          : '[no text]';
        console.log(`  @${p.author_username}${p.author_verified ? ' ✓' : ''}`);
        console.log(`  ${textPreview}`);
        console.log(`  ❤️ ${p.like_count}  💬 ${p.reply_count}  🔄 ${p.repost_count}`);
        console.log('─'.repeat(80));
      }
    }

    // DB stats
    const stats = getStats();
    console.log('\n📊 Database stats:');
    console.log(`   Total posts: ${stats.totalPosts}`);
    console.log(`   Total snapshots: ${stats.totalSnapshots}`);
    console.log(`   Unique authors: ${stats.uniqueAuthors}`);
    console.log(`   Oldest post: ${stats.oldestPost}`);
    console.log(`   Newest post: ${stats.newestPost}`);

  } finally {
    closeDb();
    console.log('\n   Press Enter to close browser...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
    await context.close();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
