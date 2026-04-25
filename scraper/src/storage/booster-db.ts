import * as dotenv from 'dotenv';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ProfilePost } from '../agent/threads-profile';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env');
  process.exit(1);
}

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!_client) _client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
  return _client;
}

// ── Tracker schema helpers ───────────────────────────────────────────────────

function makeTrackerPost(p: ProfilePost, now: string) {
  return {
    id:            p.post_id,
    text:          p.text,
    created_at:    p.created_at > 0 ? new Date(p.created_at * 1000).toISOString() : null,
    permalink:     p.permalink,
    media_type:    p.media_type,
    is_reply_post: p.is_reply_post,
    content_type:  null,
    topics:        [] as string[],
    hook_type:     null,
    ending_type:   null,
    emotional_arc: null,
    word_count:    p.text ? p.text.split(/\s+/).filter(Boolean).length : null,
    paragraph_count: p.text ? p.text.split(/\n+/).filter(Boolean).length : null,
    posting_time_slot: null,
    algorithm_signals: null,
    psychology_signals: null,
    metrics: {
      views:   0,
      likes:   p.like_count,
      replies: p.reply_count,
      reposts: p.repost_count,
      quotes:  0,
      shares:  p.share_count,
    },
    performance_windows: { '24h': null, '72h': null, '7d': null },
    snapshots: [
      {
        captured_at: now,
        likes:   p.like_count,
        replies: p.reply_count,
        reposts: p.repost_count,
        shares:  p.share_count,
      },
    ],
    prediction_snapshot: null,
    review_state: null,
    comments: [] as any[],
    author_replies: [] as any[],
    my_replies: false,
    source: { import_path: 'playwright-profile', data_completeness: 'metrics' },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getBoosterTracker(handle: string): Promise<any | null> {
  const { data, error } = await getClient()
    .from('booster_trackers')
    .select('tracker')
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw error;
  return data?.tracker ?? null;
}

/**
 * Merge scraped profile posts into the booster_trackers.tracker JSONB column.
 * - New posts are appended.
 * - Existing posts get updated metrics and a new snapshot appended.
 */
export async function upsertBoosterPosts(
  handle: string,
  posts: ProfilePost[],
): Promise<{ inserted: number; updated: number }> {
  const now = new Date().toISOString();
  const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;

  // Fetch existing tracker
  const existing = await getBoosterTracker(cleanHandle);

  const existingPosts: any[] = existing?.posts ?? [];
  const byId = new Map<string, any>(existingPosts.map((p: any) => [p.id, p]));

  let inserted = 0;
  let updated  = 0;

  for (const p of posts) {
    if (byId.has(p.post_id)) {
      const ex = byId.get(p.post_id)!;
      ex.metrics.likes   = p.like_count;
      ex.metrics.replies = p.reply_count;
      ex.metrics.reposts = p.repost_count;
      ex.metrics.shares  = p.share_count;
      ex.snapshots = [...(ex.snapshots ?? []), {
        captured_at: now,
        likes:   p.like_count,
        replies: p.reply_count,
        reposts: p.repost_count,
        shares:  p.share_count,
      }];
      updated++;
    } else {
      byId.set(p.post_id, makeTrackerPost(p, now));
      inserted++;
    }
  }

  // Sort posts by created_at descending
  const merged = Array.from(byId.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  const tracker = {
    account: {
      handle:   cleanHandle,
      source:   'playwright-profile',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    posts:        merged,
    last_updated: now,
  };

  const { error } = await getClient()
    .from('booster_trackers')
    .upsert(
      { handle: cleanHandle, tracker, updated_at: now },
      { onConflict: 'handle' }
    );

  if (error) throw error;

  return { inserted, updated };
}
