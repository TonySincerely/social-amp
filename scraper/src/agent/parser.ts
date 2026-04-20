/**
 * Parser module
 *
 * Two extraction strategies:
 *
 * Strategy A (Hidden Script Data):
 *   Threads embeds full post data in <script type="application/json" data-sjs> tags.
 *   This gives us everything: text, author, timestamp, media, engagement.
 *   Based on the Scrapfly approach with nested_lookup + jmespath-style extraction.
 *
 * Strategy B (Counter Refresh Interception):
 *   Threads periodically fires small GraphQL responses to refresh engagement counters.
 *   These contain: pk, like_count, text_post_app_info.{direct_reply_count, repost_count, ...}
 *   We capture these for engagement_snapshots tracking.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThreadPost {
  post_id: string;           // pk
  code: string;              // short code for URL
  author_username: string;
  author_verified: boolean;
  author_pk: string;
  author_pic_url: string | null;
  text: string | null;
  permalink: string;
  created_at: number;        // Unix timestamp (seconds)
  media_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  like_count: number;
  reply_count: number;
  repost_count: number;
  quote_count: number;
  reshare_count: number | null;
  first_seen_at: string;     // ISO string, set at insertion time
}

export interface EngagementSnapshot {
  post_id: string;
  observed_at: string;       // ISO string
  like_count: number;
  reply_count: number;
  repost_count: number;
  quote_count: number;
  reshare_count: number | null;
}

// ─── Strategy A: Hidden Script Data ──────────────────────────────────────────

/**
 * Recursively search an object for all values under a given key.
 * This replaces the Python `nested_lookup` library.
 */
function nestedLookup(obj: any, targetKey: string): any[] {
  const results: any[] = [];

  function search(current: any) {
    if (current === null || current === undefined) return;
    if (typeof current !== 'object') return;

    if (Array.isArray(current)) {
      for (const item of current) {
        search(item);
      }
      return;
    }

    for (const [key, value] of Object.entries(current)) {
      if (key === targetKey) {
        results.push(value);
      }
      search(value);
    }
  }

  search(obj);
  return results;
}

/**
 * Parse a single thread_item object into our ThreadPost format.
 * The structure follows Instagram's GraphQL lineage:
 *   thread_item.post.caption.text
 *   thread_item.post.user.username
 *   thread_item.post.taken_at
 *   etc.
 */
function parseThreadItem(item: any): ThreadPost | null {
  try {
    const post = item?.post;
    if (!post) return null;

    const pk = String(post.pk || post.id || '');
    if (!pk) return null;

    const username = post.user?.username || 'unknown';
    const code = post.code || '';

    // Determine media type
    let mediaType: ThreadPost['media_type'] = 'TEXT';
    if (post.carousel_media && post.carousel_media.length > 0) {
      mediaType = 'CAROUSEL';
    } else if (post.video_versions && post.video_versions.length > 0) {
      mediaType = 'VIDEO';
    } else if (post.image_versions2) {
      mediaType = 'IMAGE';
    }

    // Extract reply count - can be in text_post_app_info or view_replies_cta_string
    let replyCount = 0;
    if (post.text_post_app_info?.direct_reply_count != null) {
      replyCount = post.text_post_app_info.direct_reply_count;
    } else if (item.view_replies_cta_string) {
      const match = String(item.view_replies_cta_string).match(/^(\d+)/);
      if (match) replyCount = parseInt(match[1], 10);
    }

    return {
      post_id: pk,
      code,
      author_username: username,
      author_verified: post.user?.is_verified || false,
      author_pk: String(post.user?.pk || ''),
      author_pic_url: post.user?.profile_pic_url || null,
      text: post.caption?.text || null,
      permalink: code
        ? `https://www.threads.net/@${username}/post/${code}`
        : `https://www.threads.net/@${username}`,
      created_at: post.taken_at || 0,
      media_type: mediaType,
      like_count: post.like_count || 0,
      reply_count: replyCount,
      repost_count: post.text_post_app_info?.repost_count || 0,
      quote_count: post.text_post_app_info?.quote_count || 0,
      reshare_count: post.text_post_app_info?.reshare_count ?? null,
      first_seen_at: new Date().toISOString(),
    };
  } catch (err) {
    // Skip malformed items silently
    return null;
  }
}

/**
 * Extract ThreadPost objects from an array of script tag text contents.
 * Preferred over extractPostsFromHTML — call this with contents obtained
 * via page.evaluate() for reliable DOM access.
 */
export function extractPostsFromScripts(scriptContents: string[]): ThreadPost[] {
  const posts: ThreadPost[] = [];
  const seen = new Set<string>();

  for (const jsonStr of scriptContents) {
    // Must contain thread_items somewhere; ScheduledServerJS check removed
    // as Threads occasionally changes wrapper key names
    if (!jsonStr.includes('thread_items')) continue;

    try {
      const data = JSON.parse(jsonStr);
      const threadItemsArrays = nestedLookup(data, 'thread_items');

      for (const threadItems of threadItemsArrays) {
        if (!Array.isArray(threadItems)) continue;
        for (const item of threadItems) {
          const parsed = parseThreadItem(item);
          if (parsed && !seen.has(parsed.post_id)) {
            seen.add(parsed.post_id);
            posts.push(parsed);
          }
        }
      }
    } catch {
      // JSON parse failed, skip this script block
    }
  }

  return posts;
}

/**
 * Extract ThreadPost objects from the page's HTML content.
 * Falls back to regex parsing — prefer extractPostsFromScripts when possible.
 */
export function extractPostsFromHTML(html: string): ThreadPost[] {
  const scriptContents: string[] = [];
  const scriptRegex = /<script[^>]*type="application\/json"[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    scriptContents.push(match[1]);
  }

  return extractPostsFromScripts(scriptContents);
}

// ─── Strategy B: Counter Refresh Interception ────────────────────────────────

/**
 * Parse a counter-refresh GraphQL response into EngagementSnapshot objects.
 * These responses have the shape:
 * { data: { data: { posts: [{ pk, like_count, text_post_app_info: {...} }] } } }
 */
export function parseCounterRefresh(body: any): EngagementSnapshot[] {
  const snapshots: EngagementSnapshot[] = [];
  const now = new Date().toISOString();

  try {
    const posts = body?.data?.data?.posts;
    if (!Array.isArray(posts)) return snapshots;

    for (const post of posts) {
      const pk = String(post.pk || '');
      if (!pk) continue;

      snapshots.push({
        post_id: pk,
        observed_at: now,
        like_count: post.like_count || 0,
        reply_count: post.text_post_app_info?.direct_reply_count || 0,
        repost_count: post.text_post_app_info?.repost_count || 0,
        quote_count: post.text_post_app_info?.quote_count || 0,
        reshare_count: post.text_post_app_info?.reshare_count ?? null,
      });
    }
  } catch {
    // Malformed response
  }

  return snapshots;
}

/**
 * Check if a GraphQL response body looks like a counter-refresh response.
 */
export function isCounterRefreshResponse(body: any): boolean {
  try {
    const posts = body?.data?.data?.posts;
    if (!Array.isArray(posts) || posts.length === 0) return false;
    // Counter refresh posts have pk and like_count but NO caption/user
    const first = posts[0];
    return (
      first.pk !== undefined &&
      first.like_count !== undefined &&
      first.caption === undefined &&
      first.user === undefined
    );
  } catch {
    return false;
  }
}

// ─── Raw Data Extraction (for debugging) ─────────────────────────────────────

/**
 * Extract all hidden JSON datasets from an array of script tag contents.
 * Used by dump-raw.ts for debugging field mappings.
 */
export function extractRawDatasets(scriptContents: string[]): any[] {
  const datasets: any[] = [];

  for (const jsonStr of scriptContents) {
    try {
      const data = JSON.parse(jsonStr);
      const threadItems = nestedLookup(data, 'thread_items');
      if (threadItems.length > 0) {
        datasets.push({ thread_items: threadItems });
      }
    } catch {
      // skip
    }
  }

  return datasets;
}
