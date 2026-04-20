/**
 * Test scrape — one-shot feed extraction.
 * Opens your saved session, loads the feed, extracts posts, prints them.
 * No scrolling, no database, no loop.
 *
 * Usage: npm run test-scrape
 */

import { launchBrowser, isLoggedIn } from '../agent/browser';
import { scrapeCurrentPage } from '../agent/scraper';
import { CONFIG } from '../config';

async function main() {
  console.log('🧪 Threads Tracker — Test Scrape');
  console.log(`   Profile dir: ${CONFIG.BROWSER_PROFILE_DIR}\n`);

  const { context, page } = await launchBrowser(false); // headful so you can see

  try {
    // Verify login
    console.log('⏳ Loading feed...');
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      console.error('❌ Not logged in. Run `npm run login` first.');
      return;
    }

    // Wait for post containers to appear in the DOM
    console.log('⏳ Waiting for feed content...');
    await page.waitForSelector("div[data-pressable-container='true']", { timeout: 15000 });
    await page.waitForTimeout(2000); // brief settle after first post appears

    // Extract posts
    console.log('🔍 Extracting posts from page...\n');
    const posts = await scrapeCurrentPage(page);


    if (posts.length === 0) {
      console.log('⚠️  No posts found!');
      console.log('');
      console.log('   This could mean:');
      console.log('   1. The <script data-sjs> selector needs updating');
      console.log('   2. Threads changed their hidden data format');
      console.log('   3. The feed hasn\'t fully loaded yet');
      console.log('');
      console.log('   Try running: npm run dump-raw');
      console.log('   This will save the raw page data for debugging.');
      return;
    }

    // Print results
    console.log(`✅ Found ${posts.length} posts:\n`);
    console.log('─'.repeat(80));

    for (const post of posts) {
      const age = post.created_at > 0
        ? `${Math.round((Date.now() / 1000 - post.created_at) / 60)}m ago`
        : 'unknown age';

      const verified = post.author_verified ? ' ✓' : '';
      const textPreview = post.text
        ? post.text.substring(0, 100) + (post.text.length > 100 ? '...' : '')
        : '[no text]';

      console.log(`@${post.author_username}${verified} · ${age}`);
      console.log(`  ${textPreview}`);
      console.log(`  ❤️ ${post.like_count}  💬 ${post.reply_count}  🔄 ${post.repost_count}  📤 ${post.reshare_count ?? 0}`);
      console.log(`  🔗 ${post.permalink}`);
      console.log('─'.repeat(80));
    }

    // Print summary
    console.log(`\n📊 Summary:`);
    console.log(`   Posts found: ${posts.length}`);
    console.log(`   With text: ${posts.filter(p => p.text).length}`);
    console.log(`   With engagement: ${posts.filter(p => p.like_count > 0).length}`);
    console.log(`   Verified authors: ${posts.filter(p => p.author_verified).length}`);

    const topPost = posts.sort((a, b) => b.like_count - a.like_count)[0];
    if (topPost) {
      console.log(`\n   🏆 Top post: ${topPost.like_count} likes by @${topPost.author_username}`);
    }

  } finally {
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
