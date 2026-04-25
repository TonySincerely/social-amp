/**
 * profile-scrape — Scrape a Threads profile page and save posts to booster_trackers.
 *
 * Env vars:
 *   HANDLE          Threads handle to scrape (with or without @)
 *   POSTS_TARGET    Posts tab target count (0 = skip, default: 50)
 *   REPLIES_TARGET  Replies tab target count (0 = skip, default: 0)
 *   HEADLESS=1      Run headless (not recommended)
 */

import { launchBrowser } from '../agent/browser';
import { scrapeProfileFull } from '../agent/threads-profile';
import { upsertBoosterPosts } from '../storage/booster-db';
import { CONFIG } from '../config';

const HANDLE         = (process.env.HANDLE || '').replace(/^@/, '');
const POSTS_TARGET   = parseInt(process.env.POSTS_TARGET   || '50', 10);
const REPLIES_TARGET = parseInt(process.env.REPLIES_TARGET || '0',  10);
const HEADLESS       = process.env.HEADLESS === '1';

async function main() {
  if (!HANDLE) {
    console.error('❌  HANDLE env var is required (e.g. HANDLE=yourname)');
    process.exit(1);
  }

  console.log(`\n🔍 Booster Profile Scrape`);
  console.log(`   Handle:          @${HANDLE}`);
  console.log(`   Posts target:    ${POSTS_TARGET}`);
  console.log(`   Replies target:  ${REPLIES_TARGET}`);
  console.log(`   Storage:         Supabase booster_trackers\n`);

  const { context, page } = await launchBrowser(HEADLESS, CONFIG.BROWSER_PROFILE_DIR);

  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    await context.close();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  try {
    console.log(`  🌐 Navigating to @${HANDLE} profile...`);
    const posts = await scrapeProfileFull(page, HANDLE, { postsTarget: POSTS_TARGET, repliesTarget: REPLIES_TARGET });

    if (posts.length === 0) {
      console.log('  ⚠️  No posts found. Session may have expired or profile is private.');
      await context.close();
      process.exit(0);
    }

    const original = posts.filter(p => !p.is_reply_post);
    const replies  = posts.filter(p => p.is_reply_post);
    console.log(`\n  📊 Found ${posts.length} posts (${original.length} original, ${replies.length} replies)`);

    console.log('  💾 Saving to Supabase booster_trackers...');
    const { inserted, updated } = await upsertBoosterPosts(`@${HANDLE}`, posts);
    console.log(`  ✅ Done: ${inserted} new, ${updated} updated`);
  } catch (err: any) {
    console.error(`\n  ❌ Error: ${err.message}`);
    await context.close();
    process.exit(1);
  }

  await context.close();
  process.exit(0);
}

main();
