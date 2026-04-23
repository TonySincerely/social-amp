import { Page } from 'playwright';
import { scrollTwitterFeed } from './twitter-browser';

export interface TweetPost {
  post_id:         string;
  author_username: string;
  author_verified: boolean;
  text:            string | null;
  permalink:       string;
  created_at:      number;   // Unix timestamp
  first_seen_at:   string;   // ISO
  media_type:      'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  is_reply:        boolean;
  is_promoted:     boolean;
  view_count:      number;
  like_count:      number;
  reply_count:     number;
  retweet_count:   number;
  quote_count:     number;
}

export interface TweetSnapshot {
  post_id:       string;
  observed_at:   string;
  view_count:    number;
  like_count:    number;
  reply_count:   number;
  retweet_count: number;
  quote_count:   number;
}

export async function scrapeCurrentPage(page: Page): Promise<TweetPost[]> {
  const now = new Date().toISOString();

  const raw = await page.evaluate(() => {
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

    // aria-label format: "3 Replies. Reply" or "Like" (count 0)
    function countFromLabel(label: string): number {
      const m = label.match(/^([\d,]+)/);
      return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
    }

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const seen = new Set<string>();
    const results: Array<{
      tweetId: string; username: string; createdAt: number;
      text: string | null; mediaType: string; isReply: boolean; isPromoted: boolean;
      viewCount: number; likeCount: number; replyCount: number;
      retweetCount: number; quoteCount: number;
    }> = [];

    for (const article of articles) {
      try {
        // Tweet ID from timestamp anchor href
        const timeEl   = article.querySelector('time');
        const timeLink = timeEl?.closest('a') as HTMLAnchorElement | null;
        const href     = timeLink?.getAttribute('href') || '';
        const idMatch  = href.match(/\/status\/(\d+)/);
        const tweetId  = idMatch ? idMatch[1] : '';
        if (!tweetId || seen.has(tweetId)) continue;
        seen.add(tweetId);

        const createdAt = timeEl?.getAttribute('datetime')
          ? Math.floor(new Date(timeEl.getAttribute('datetime')!).getTime() / 1000)
          : 0;

        // Author — first /username href that isn't a /status path
        const userNameEl = article.querySelector('[data-testid="User-Name"]');
        let username = '';
        for (const a of Array.from(userNameEl?.querySelectorAll('a') ?? [])) {
          const h = a.getAttribute('href') || '';
          const m = h.match(/^\/([A-Za-z0-9_]+)$/);
          if (m) { username = m[1]; break; }
        }

        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text   = textEl?.textContent?.trim() || null;

        // Media type
        const hasVideo  = !!article.querySelector('video');
        const mediaImgs = Array.from(article.querySelectorAll('img')).filter(img =>
          (img.getAttribute('src') || '').includes('pbs.twimg.com/media')
        );
        const mediaType = hasVideo          ? 'VIDEO'
          : mediaImgs.length > 1            ? 'CAROUSEL'
          : mediaImgs.length === 1          ? 'IMAGE'
          : 'TEXT';

        const isReply = !!Array.from(article.querySelectorAll('span')).find(
          s => s.textContent?.trim() === 'Replying to'
        );
        const isPromoted = !!Array.from(article.querySelectorAll('span')).find(
          s => s.textContent?.trim() === 'Promoted'
        );

        // Engagement via aria-labels
        const replyLabel   = article.querySelector('[data-testid="reply"]')?.getAttribute('aria-label')   || '';
        const retweetLabel = article.querySelector('[data-testid="retweet"]')?.getAttribute('aria-label') || '';
        const likeLabel    = article.querySelector('[data-testid="like"]')?.getAttribute('aria-label')    || '';

        const replyCount   = countFromLabel(replyLabel);
        const retweetCount = countFromLabel(retweetLabel);
        const likeCount    = countFromLabel(likeLabel);

        // View count — three fallback strategies
        let viewCount = 0;
        const analyticsLink = article.querySelector('a[href*="/analytics"]');
        if (analyticsLink) viewCount = parseCount(analyticsLink.textContent?.trim() || '');

        if (viewCount === 0) {
          const appSwitch = article.querySelector('[data-testid="app-text-switch"]');
          if (appSwitch) viewCount = parseCount(appSwitch.textContent?.trim() || '');
        }

        if (viewCount === 0) {
          for (const span of Array.from(article.querySelectorAll('span'))) {
            const t = span.textContent?.trim() || '';
            if (/views?$/i.test(t)) {
              viewCount = parseCount(t);
              if (viewCount > 0) break;
            }
          }
        }

        results.push({
          tweetId, username, createdAt, text,
          mediaType, isReply, isPromoted,
          viewCount, likeCount, replyCount, retweetCount,
          quoteCount: 0, // quote count not exposed in feed DOM
        });
      } catch {
        // skip malformed containers
      }
    }
    return results;
  });

  return raw.map(r => ({
    post_id:         r.tweetId,
    author_username: r.username || 'unknown',
    author_verified: false, // verified badge not needed for feed scoring
    text:            r.text,
    permalink:       r.username ? `https://x.com/${r.username}/status/${r.tweetId}` : '',
    created_at:      r.createdAt,
    first_seen_at:   now,
    media_type:      r.mediaType as TweetPost['media_type'],
    is_reply:        r.isReply,
    is_promoted:     r.isPromoted,
    view_count:      r.viewCount,
    like_count:      r.likeCount,
    reply_count:     r.replyCount,
    retweet_count:   r.retweetCount,
    quote_count:     r.quoteCount,
  }));
}

export async function scrapeTwitterFeed(
  page: Page,
  scrollCount = 3
): Promise<TweetPost[]> {
  const allPosts = new Map<string, TweetPost>();

  const initial = await scrapeCurrentPage(page);
  for (const p of initial) allPosts.set(p.post_id, p);
  console.log(`  📄 Initial load: ${initial.length} tweets`);

  for (let i = 0; i < scrollCount; i++) {
    await scrollTwitterFeed(page);
    const batch = await scrapeCurrentPage(page);
    let newCount = 0;
    for (const p of batch) {
      if (!allPosts.has(p.post_id)) { newCount++; allPosts.set(p.post_id, p); }
    }
    console.log(`  📜 Scroll ${i + 1}/${scrollCount}: +${newCount} new (${allPosts.size} total)`);
  }

  return Array.from(allPosts.values());
}
