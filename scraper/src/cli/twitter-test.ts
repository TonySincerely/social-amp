/**
 * Test scrape — one-shot Twitter/X home feed extraction.
 * Opens your saved session, loads the feed, extracts tweets, prints them.
 * No scrolling, no database, no loop.
 *
 * If view counts come back as 0, the raw action bar HTML from the first tweet
 * is printed so you can identify the correct selector from the live DOM.
 *
 * Usage: npm run twitter:test
 */

import { launchBrowser } from '../agent/browser';
import { CONFIG } from '../config';

async function main() {
  console.log('🧪 Twitter Tracker — Test Scrape');
  console.log(`   Profile dir: ${CONFIG.TWITTER_BROWSER_PROFILE_DIR}\n`);

  const { context, page } = await launchBrowser(false, CONFIG.TWITTER_BROWSER_PROFILE_DIR);

  try {
    console.log('⏳ Loading home feed...');
    await page.goto(CONFIG.TWITTER_HOME, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Login check — any redirect away from x.com means not logged in
    const url = page.url();
    const loggedIn = url.includes('x.com') && !url.includes('/login') && !url.includes('/i/flow');
    if (!loggedIn) {
      console.error('❌ Not logged in. Run `npm run twitter:login` first.');
      return;
    }

    console.log('⏳ Waiting for tweets...');
    try {
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
    } catch {
      console.error('❌ No tweet containers found within 15s.');
      console.error('   The selector article[data-testid="tweet"] may need updating.');
      console.error('   Open devtools on x.com and inspect a tweet to find the correct container.');
      return;
    }
    await page.waitForTimeout(2000);

    console.log('🔍 Extracting tweets...\n');

    const { tweets, rawActionBarSample, rawContainerCount } = await page.evaluate(() => {
      function parseCount(str: string): number {
        if (!str) return 0;
        const m = str.match(/([\d,.]+)\s*([KkMmBb]?)/);
        if (!m) return 0;
        const n = parseFloat(m[1].replace(/,/g, ''));
        const s = m[2].toLowerCase();
        if (s === 'k') return Math.round(n * 1_000);
        if (s === 'm') return Math.round(n * 1_000_000);
        if (s === 'b') return Math.round(n * 1_000_000_000);
        return Math.round(n);
      }

      // Twitter aria-labels: "3 Replies. Reply" → 3, "Like" (0) → 0
      function countFromLabel(label: string): number {
        const m = label.match(/^([\d,]+)/);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
      }

      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      const rawContainerCount = articles.length;
      const seen = new Set<string>();
      const tweets: Array<{
        tweetId: string; username: string; text: string | null;
        createdAt: number; mediaType: string; isReply: boolean; isPromoted: boolean;
        replyCount: number; retweetCount: number; likeCount: number;
        bookmarkCount: number; viewCount: number; permalink: string;
        replyLabel: string; retweetLabel: string; likeLabel: string;
      }> = [];
      let rawActionBarSample = '';

      for (const article of articles) {
        try {
          // Tweet ID + permalink from the timestamp anchor
          const timeEl = article.querySelector('time');
          const timeLink = timeEl?.closest('a') as HTMLAnchorElement | null;
          const href = timeLink?.getAttribute('href') || '';
          const idMatch = href.match(/\/status\/(\d+)/);
          const tweetId = idMatch ? idMatch[1] : '';
          if (!tweetId || seen.has(tweetId)) continue;
          seen.add(tweetId);

          const createdAt = timeEl?.getAttribute('datetime')
            ? Math.floor(new Date(timeEl.getAttribute('datetime')!).getTime() / 1000)
            : 0;

          // Author — find the /username href that isn't a /status link
          const userNameEl = article.querySelector('[data-testid="User-Name"]');
          let username = '';
          for (const a of Array.from(userNameEl?.querySelectorAll('a') ?? [])) {
            const h = a.getAttribute('href') || '';
            const m = h.match(/^\/([A-Za-z0-9_]+)$/);
            if (m) { username = m[1]; break; }
          }

          // Text
          const textEl = article.querySelector('[data-testid="tweetText"]');
          const text = textEl?.textContent?.trim() || null;

          // Media type
          const hasVideo = !!article.querySelector('video');
          const mediaImgs = Array.from(article.querySelectorAll('img')).filter(img =>
            (img.getAttribute('src') || '').includes('pbs.twimg.com/media')
          );
          const mediaType = hasVideo ? 'VIDEO'
            : mediaImgs.length > 1 ? 'CAROUSEL'
            : mediaImgs.length === 1 ? 'IMAGE'
            : 'TEXT';

          // Is reply — "Replying to" indicator
          const isReply = !!Array.from(article.querySelectorAll('span')).find(
            s => s.textContent?.trim() === 'Replying to'
          );

          // Promoted tweet
          const isPromoted = !!Array.from(article.querySelectorAll('span')).find(
            s => s.textContent?.trim() === 'Promoted'
          );

          // Engagement counts from aria-labels
          const replyBtn    = article.querySelector('[data-testid="reply"]');
          const retweetBtn  = article.querySelector('[data-testid="retweet"]');
          const likeBtn     = article.querySelector('[data-testid="like"]');
          const bookmarkBtn = article.querySelector('[data-testid="bookmark"]');

          const replyLabel   = replyBtn?.getAttribute('aria-label')   || '';
          const retweetLabel = retweetBtn?.getAttribute('aria-label') || '';
          const likeLabel    = likeBtn?.getAttribute('aria-label')    || '';

          const replyCount    = countFromLabel(replyLabel);
          const retweetCount  = countFromLabel(retweetLabel);
          const likeCount     = countFromLabel(likeLabel);
          const bookmarkCount = bookmarkBtn
            ? countFromLabel(bookmarkBtn.getAttribute('aria-label') || '')
            : 0;

          // View count — try analytics link first, then app-text-switch, then
          // scan all spans near the action group for a number followed by "Views"
          let viewCount = 0;

          const analyticsLink = article.querySelector('a[href*="/analytics"]');
          if (analyticsLink) {
            viewCount = parseCount(analyticsLink.textContent?.trim() || '');
          }

          if (viewCount === 0) {
            const appSwitch = article.querySelector('[data-testid="app-text-switch"]');
            if (appSwitch) viewCount = parseCount(appSwitch.textContent?.trim() || '');
          }

          if (viewCount === 0) {
            // Scan all spans in the article for a pattern like "1.2M Views" or "12K Views"
            for (const span of Array.from(article.querySelectorAll('span'))) {
              const t = span.textContent?.trim() || '';
              if (/views?$/i.test(t)) {
                viewCount = parseCount(t);
                if (viewCount > 0) break;
              }
            }
          }

          // Capture raw action bar HTML on first successful tweet for debugging
          if (tweets.length === 0) {
            const group = article.querySelector('[role="group"]');
            rawActionBarSample = group?.innerHTML?.substring(0, 3000) || '';
          }

          tweets.push({
            tweetId, username, text, createdAt, mediaType, isReply, isPromoted,
            replyCount, retweetCount, likeCount, bookmarkCount, viewCount,
            permalink: username ? `https://x.com/${username}/status/${tweetId}` : '',
            replyLabel, retweetLabel, likeLabel,
          });
        } catch {
          // skip malformed containers
        }
      }

      return { tweets, rawActionBarSample, rawContainerCount };
    });

    if (tweets.length === 0) {
      console.log(`⚠️  Found ${rawContainerCount} article containers but extracted 0 tweets.`);
      console.log('   All tweets may have been skipped (duplicate IDs or missing timestamp links).');
      console.log('   Check devtools on x.com and inspect a tweet\'s anchor around <time>.');
      return;
    }

    console.log(`✅ Found ${tweets.length} tweets (${rawContainerCount} raw containers):\n`);
    console.log('─'.repeat(80));

    for (const t of tweets) {
      const age = t.createdAt > 0
        ? `${Math.round((Date.now() / 1000 - t.createdAt) / 60)}m ago`
        : 'unknown age';
      const textPreview = t.text
        ? t.text.substring(0, 100) + (t.text.length > 100 ? '...' : '')
        : '[no text]';
      const viewStr = t.viewCount > 0 ? `  👁 ${t.viewCount.toLocaleString()}` : '  👁 ?';
      const flags = [
        t.isReply     ? '[reply]'    : '',
        t.isPromoted  ? '[promoted]' : '',
      ].filter(Boolean).join(' ');

      console.log(`@${t.username || '?'} · ${age} · ${t.mediaType}${flags ? '  ' + flags : ''}`);
      console.log(`  ${textPreview}`);
      console.log(`  ❤️ ${t.likeCount}  💬 ${t.replyCount}  🔄 ${t.retweetCount}  🔖 ${t.bookmarkCount}${viewStr}`);
      if (t.permalink) console.log(`  🔗 ${t.permalink}`);
      console.log('─'.repeat(80));
    }

    // Summary
    const viewsMissing = tweets.filter(t => t.viewCount === 0).length;
    console.log('\n📊 Summary:');
    console.log(`   Tweets extracted:  ${tweets.length} / ${rawContainerCount} containers`);
    console.log(`   With text:         ${tweets.filter(t => t.text).length}`);
    console.log(`   With engagement:   ${tweets.filter(t => t.likeCount > 0).length}`);
    console.log(`   With view counts:  ${tweets.filter(t => t.viewCount > 0).length} / ${tweets.length}${viewsMissing > 0 ? '  ⚠️  selector needs fixing' : '  ✅'}`);
    console.log(`   Replies:           ${tweets.filter(t => t.isReply).length}`);
    console.log(`   Promoted:          ${tweets.filter(t => t.isPromoted).length}`);

    const topPost = [...tweets].sort((a, b) => b.likeCount - a.likeCount)[0];
    if (topPost) {
      console.log(`\n   🏆 Most liked: ${topPost.likeCount.toLocaleString()} likes by @${topPost.username}`);
    }

    // Always print aria-labels from first tweet — confirms selector health
    const first = tweets[0];
    if (first) {
      console.log('\n🔬 Selector check (first tweet):');
      console.log(`   reply aria-label:   "${first.replyLabel}"`);
      console.log(`   retweet aria-label: "${first.retweetLabel}"`);
      console.log(`   like aria-label:    "${first.likeLabel}"`);
    }

    // If view counts are missing, dump the raw action bar HTML to help fix the selector
    if (viewsMissing === tweets.length) {
      console.log('\n⚠️  View counts missing on all tweets.');
      console.log('   Raw action bar HTML from first tweet (find the views element):');
      console.log('─'.repeat(40));
      console.log(rawActionBarSample || '(empty — [role="group"] not found)');
      console.log('─'.repeat(40));
      console.log('\n   Look for a span or link containing a number + "Views".');
      console.log('   Update the view count selector in twitter-scraper.ts accordingly.');
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
