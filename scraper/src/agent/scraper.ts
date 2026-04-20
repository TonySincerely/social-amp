import { Page } from 'playwright';
import {
  ThreadPost,
  EngagementSnapshot,
  parseCounterRefresh,
  isCounterRefreshResponse,
} from './parser';
import { scrollFeed } from './browser';

/**
 * Scrape the current page content for thread posts.
 * Uses DOM scraping: reads rendered post containers directly.
 * Selectors confirmed working from reference implementations.
 */
export async function scrapeCurrentPage(page: Page): Promise<ThreadPost[]> {
  const now = new Date().toISOString();

  const rawPosts = await page.evaluate(() => {
    function parseCount(el: Element | null): number {
      const txt = el?.textContent?.trim() || '';
      const m = txt.match(/([\d,]+\.?\d*)\s*([KkMm萬]?)/);
      if (!m) return 0;
      const n = parseFloat(m[1].replace(/,/g, ''));
      const s = m[2];
      if (s === 'K' || s === 'k') return Math.round(n * 1000);
      if (s === 'M' || s === 'm') return Math.round(n * 1000000);
      if (s === '萬') return Math.round(n * 10000);
      return Math.round(n);
    }

    const containers = document.querySelectorAll("div[data-pressable-container='true']");
    const results: Array<{
      code: string; username: string; text: string | null;
      created_at: number; likeCount: number; replyCount: number; repostCount: number; shareCount: number;
      mediaType: string;
    }> = [];
    const seen = new Set<string>();

    for (const container of Array.from(containers)) {
      try {
        // Post code from permalink — skip posts with no code (ads, suggestions)
        const postLink = container.querySelector('a[href*="/post/"]') as HTMLAnchorElement | null;
        const href = postLink?.getAttribute('href') || '';
        const codeMatch = href.match(/\/post\/([^/?#]+)/);
        const code = codeMatch ? codeMatch[1] : '';
        if (!code) continue;
        if (seen.has(code)) continue;
        seen.add(code);

        // Author username
        const authorLink = container.querySelector('a[href^="/@"]') as HTMLAnchorElement | null;
        const authorHref = authorLink?.getAttribute('href') || '';
        const usernameMatch = authorHref.match(/\/@([^/?#]+)/);
        const username = usernameMatch ? usernameMatch[1] : 'unknown';

        // Timestamp from <time datetime="...">
        const timeEl = container.querySelector('time');
        const datetimeStr = timeEl?.getAttribute('datetime') || '';
        const created_at = datetimeStr ? Math.floor(new Date(datetimeStr).getTime() / 1000) : 0;

        // Post text — skip spans/divs that share a parent with the <time> element
        // (those are timestamp displays like "7小時"). Also check div[dir='auto']
        // which Threads uses for longer post bodies.
        let text: string | null = null;
        const textCandidates = Array.from(
          container.querySelectorAll("span[dir='auto'], div[dir='auto']")
        );
        for (const el of textCandidates) {
          if (el.closest('a') || el.closest('button')) continue;
          // Skip if this element's immediate parent also contains the <time> node
          if (timeEl && el.parentElement?.contains(timeEl)) continue;
          const t = el.textContent?.trim() || '';
          if (t.length >= 1) { text = t; break; }
        }

        // Engagement counts — find div[role="button"] by its inner SVG aria-label.
        // Threads uses no data-testid; labels are locale-aware (zh-TW + English fallback).
        function findBtn(labels: string[]): Element | null {
          for (const btn of Array.from(container.querySelectorAll('div[role="button"]'))) {
            const label = btn.querySelector('svg[aria-label]')?.getAttribute('aria-label') || '';
            if (labels.includes(label)) return btn;
          }
          return null;
        }
        const likeCount  = parseCount(findBtn(['讚', 'Like']));
        const replyCount = parseCount(findBtn(['回覆', 'Reply']));
        const repostCount = parseCount(findBtn(['轉發', 'Repost', 'Repost or quote']));
        const shareCount = parseCount(findBtn(['分享', 'Share']));

        // Media detection — video > carousel (multiple post images) > image > text
        const hasVideo = Boolean(container.querySelector('video'));
        const postImgs = Array.from(container.querySelectorAll('img')).filter(
          img => !img.closest('a[href^="/@"]') && !img.closest('button')
        );
        const mediaType = hasVideo ? 'VIDEO'
          : postImgs.length > 1 ? 'CAROUSEL'
          : postImgs.length === 1 ? 'IMAGE'
          : 'TEXT';

        results.push({ code, username, text, created_at, likeCount, replyCount, repostCount, shareCount, mediaType });
      } catch {
        // skip malformed containers
      }
    }
    return results;
  });

  return rawPosts.map(r => ({
    post_id: r.code,
    code: r.code,
    author_username: r.username,
    author_verified: false,
    author_pk: '',
    author_pic_url: null,
    text: r.text,
    permalink: `https://www.threads.net/@${r.username}/post/${r.code}`,
    created_at: r.created_at,
    media_type: r.mediaType as ThreadPost['media_type'],
    like_count: r.likeCount,
    reply_count: r.replyCount,
    repost_count: r.repostCount,
    quote_count: 0,
    reshare_count: r.shareCount || null,
    first_seen_at: now,
  }));
}

/**
 * Set up a response interceptor for counter-refresh GraphQL calls.
 * Uses Strategy B: intercept network responses.
 *
 * Returns a function to retrieve all captured snapshots and clear the buffer.
 */
export function setupCounterInterceptor(page: Page): {
  flush: () => EngagementSnapshot[];
  stop: () => void;
} {
  const buffer: EngagementSnapshot[] = [];

  const handler = async (response: any) => {
    try {
      const url: string = response.url();
      if (!url.includes('/graphql')) return;

      const status = response.status();
      if (status !== 200) return;

      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/javascript')) return;

      const body = await response.json();
      if (isCounterRefreshResponse(body)) {
        const snapshots = parseCounterRefresh(body);
        buffer.push(...snapshots);
      }
    } catch {
      // Response parsing failed (binary, redirect, etc.) — ignore
    }
  };

  page.on('response', handler);

  return {
    flush: () => {
      const copy = [...buffer];
      buffer.length = 0;
      return copy;
    },
    stop: () => {
      page.removeListener('response', handler);
    },
  };
}

/**
 * Perform a full scrape cycle:
 * 1. Extract posts from current page (Strategy A)
 * 2. Scroll N times, extracting after each scroll
 * 3. Return all unique posts found
 */
export async function scrapeFeed(
  page: Page,
  scrollCount: number = 3
): Promise<ThreadPost[]> {
  const allPosts = new Map<string, ThreadPost>();

  // Extract from initial page load
  const initial = await scrapeCurrentPage(page);
  for (const post of initial) {
    allPosts.set(post.post_id, post);
  }
  console.log(`  📄 Initial load: ${initial.length} posts`);

  // Scroll and extract more
  for (let i = 0; i < scrollCount; i++) {
    await scrollFeed(page);
    const batch = await scrapeCurrentPage(page);
    let newCount = 0;
    for (const post of batch) {
      if (!allPosts.has(post.post_id)) {
        newCount++;
        allPosts.set(post.post_id, post);
      }
    }
    console.log(`  📜 Scroll ${i + 1}/${scrollCount}: +${newCount} new (${allPosts.size} total)`);
  }

  return Array.from(allPosts.values());
}
