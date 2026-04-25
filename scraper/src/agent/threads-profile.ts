import { Page } from 'playwright';
import { scrollFeed } from './browser';

export interface ProfilePost {
  post_id: string;
  text: string | null;
  created_at: number;        // unix timestamp
  permalink: string;
  media_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  is_reply_post: boolean;
  like_count: number;
  reply_count: number;
  repost_count: number;
  share_count: number;
}

/**
 * Navigate to a Threads profile page and wait for posts to load.
 * Strips the leading @ from handle if present.
 */
export async function navigateToProfile(page: Page, handle: string): Promise<void> {
  const clean = handle.replace(/^@/, '');
  const url = `https://www.threads.net/@${clean}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Check for private / not-found states
  const title = await page.title();
  if (title.toLowerCase().includes('not found') || title.toLowerCase().includes('page not found')) {
    throw new Error(`Profile @${clean} not found on Threads`);
  }

  // Wait for at least one post container
  await page.waitForSelector("div[data-pressable-container='true']", { timeout: 15000 });
  await page.waitForTimeout(2000);
}

/**
 * Scrape the current profile page for the owner's posts.
 * Detects and marks reply posts. Uses the same container selector as the home feed.
 */
export async function scrapeProfilePage(page: Page, ownerHandle: string): Promise<ProfilePost[]> {
  const now = new Date().toISOString();
  const cleanOwner = ownerHandle.replace(/^@/, '').toLowerCase();

  const rawPosts = await page.evaluate((owner) => {
    function parseCount(el: Element | null): number {
      const txt = el?.textContent?.trim() || '';
      const m = txt.match(/([\d,]+\.?\d*)\s*([KkMm萬]?)/);
      if (!m) return 0;
      const n = parseFloat(m[1].replace(/,/g, ''));
      const s = m[2];
      if (s === 'K' || s === 'k') return Math.round(n * 1000);
      if (s === 'M' || s === 'm') return Math.round(n * 1_000_000);
      if (s === '萬') return Math.round(n * 10000);
      return Math.round(n);
    }

    function findBtn(container: Element, labels: string[]): Element | null {
      for (const btn of Array.from(container.querySelectorAll('div[role="button"]'))) {
        const label = btn.querySelector('svg[aria-label]')?.getAttribute('aria-label') || '';
        if (labels.includes(label)) return btn;
      }
      return null;
    }

    const containers = document.querySelectorAll("div[data-pressable-container='true']");
    const seen = new Set<string>();
    const results: Array<{
      code: string; username: string; text: string | null;
      created_at: number; isReply: boolean;
      likeCount: number; replyCount: number; repostCount: number; shareCount: number;
      mediaType: string;
    }> = [];

    for (const container of Array.from(containers)) {
      try {
        // Find a post link that belongs to the owner.
        // On the /replies tab a container may include the parent post link before the owner's
        // reply link — scanning all links and matching /@owner/ prevents capturing parent text.
        const allPostLinks = Array.from(container.querySelectorAll('a[href*="/post/"]'));
        const postLink = (owner
          ? allPostLinks.find((l: any) => (l.getAttribute('href') || '').startsWith(`/@${owner}/post/`))
          : allPostLinks[0]) as HTMLAnchorElement | null;

        const href = postLink?.getAttribute('href') || '';
        const codeMatch = href.match(/\/post\/([^/?#]+)/);
        const code = codeMatch ? codeMatch[1] : '';
        if (!code || seen.has(code)) continue;
        seen.add(code);

        // Username is implicit in the verified post href — no separate author link check needed.
        const usernameMatch = href.match(/^\/@([^/]+)\/post\//);
        const username = usernameMatch ? usernameMatch[1].toLowerCase() : '';

        // Timestamp
        const timeEl = container.querySelector('time');
        const datetimeStr = timeEl?.getAttribute('datetime') || '';
        const created_at = datetimeStr ? Math.floor(new Date(datetimeStr).getTime() / 1000) : 0;

        // Reply detection — "Replying to" or "回覆 @" near the top of the container
        const allSpans = Array.from(container.querySelectorAll('span'));
        const isReply = allSpans.some(s => {
          const t = s.textContent?.trim() || '';
          return t.startsWith('Replying to') || t.startsWith('回覆');
        });

        // Post text
        let text: string | null = null;
        for (const el of Array.from(container.querySelectorAll("span[dir='auto'], div[dir='auto']"))) {
          if (el.closest('a') || el.closest('button')) continue;
          if (timeEl && el.parentElement?.contains(timeEl)) continue;
          const t = el.textContent?.trim() || '';
          if (t.length >= 1) { text = t; break; }
        }

        const likeCount   = parseCount(findBtn(container, ['讚', 'Like']));
        const replyCount  = parseCount(findBtn(container, ['回覆', 'Reply']));
        const repostCount = parseCount(findBtn(container, ['轉發', 'Repost', 'Repost or quote']));
        const shareCount  = parseCount(findBtn(container, ['分享', 'Share']));

        const hasVideo  = Boolean(container.querySelector('video'));
        const postImgs  = Array.from(container.querySelectorAll('img')).filter(
          img => !img.closest('a[href^="/@"]') && !img.closest('button')
        );
        const mediaType = hasVideo ? 'VIDEO'
          : postImgs.length > 1 ? 'CAROUSEL'
          : postImgs.length === 1 ? 'IMAGE'
          : 'TEXT';

        results.push({ code, username, text, created_at, isReply, likeCount, replyCount, repostCount, shareCount, mediaType });
      } catch {
        // skip malformed containers
      }
    }
    return results;
  }, cleanOwner);

  return rawPosts.map(r => ({
    post_id:      r.code,
    text:         r.text,
    created_at:   r.created_at,
    permalink:    `https://www.threads.net/@${cleanOwner}/post/${r.code}`,
    media_type:   r.mediaType as ProfilePost['media_type'],
    is_reply_post: r.isReply,
    like_count:   r.likeCount,
    reply_count:  r.replyCount,
    repost_count: r.repostCount,
    share_count:  r.shareCount,
  }));
}

const MAX_SCROLLS = 50;

async function scrollUntilTarget(
  page: Page,
  handle: string,
  target: number,
  label: string,
): Promise<Map<string, ProfilePost>> {
  const all = new Map<string, ProfilePost>();
  const initial = await scrapeProfilePage(page, handle);
  for (const p of initial) all.set(p.post_id, p);
  console.log(`  📄 ${label} initial: ${initial.length}`);

  let dryScrolls  = 0;
  let scrollsDone = 0;
  while (all.size < target && scrollsDone < MAX_SCROLLS) {
    await scrollFeed(page);
    const batch = await scrapeProfilePage(page, handle);
    let added = 0;
    for (const p of batch) {
      if (!all.has(p.post_id)) { all.set(p.post_id, p); added++; }
    }
    scrollsDone++;
    console.log(`  📜 ${label} scroll ${scrollsDone}: +${added} new (${all.size}/${target} target)`);
    if (added === 0) {
      dryScrolls++;
      if (dryScrolls >= 2) {
        console.log(`  ⏹  No new ${label.toLowerCase()} — stopping early`);
        break;
      }
    } else {
      dryScrolls = 0;
    }
  }
  return all;
}

/**
 * Full profile scrape. postsTarget=0 skips the posts tab; repliesTarget=0 skips the replies tab.
 * Each tab stops early after two consecutive dry scrolls or when its target is reached.
 */
export async function scrapeProfileFull(
  page: Page,
  handle: string,
  options: { postsTarget: number; repliesTarget: number } = { postsTarget: 50, repliesTarget: 0 },
): Promise<ProfilePost[]> {
  const { postsTarget, repliesTarget } = options;
  const clean = handle.replace(/^@/, '');
  const all = new Map<string, ProfilePost>();

  if (postsTarget > 0) {
    await navigateToProfile(page, handle);
    const postsMap = await scrollUntilTarget(page, handle, postsTarget, 'Posts');
    for (const [id, p] of postsMap) all.set(id, p);
  }

  if (repliesTarget > 0) {
    console.log(`\n  🔁 Navigating to replies tab…`);
    await page.goto(`https://www.threads.net/@${clean}/replies`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    try {
      await page.waitForSelector("div[data-pressable-container='true']", { timeout: 15000 });
      await page.waitForTimeout(2000);
      const repliesMap = await scrollUntilTarget(page, handle, repliesTarget, 'Replies');
      for (const [id, p] of repliesMap) {
        if (!all.has(id)) all.set(id, p);
      }
    } catch {
      console.log('  ⚠️  Replies tab unavailable or no replies found');
    }
  }

  return Array.from(all.values());
}
