import * as dotenv from 'dotenv';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ThreadPost, EngagementSnapshot } from '../agent/parser';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SCRAPER_USER_ID     = (process.env.SCRAPER_USER_ID || 'unknown').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env');
  process.exit(1);
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) _client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
  return _client;
}

/**
 * Batch upsert posts and insert initial engagement snapshots.
 * The DB trigger preserves first_seen_at and scraper_user_id on conflict.
 */
export async function savePosts(
  posts: ThreadPost[],
  keyword?: string
): Promise<{ newCount: number; updatedCount: number }> {
  if (posts.length === 0) return { newCount: 0, updatedCount: 0 };

  const rows = posts.map(p => ({
    post_id:         p.post_id,
    code:            p.code,
    author_username: p.author_username,
    author_verified: p.author_verified,
    author_pk:       p.author_pk,
    author_pic_url:  p.author_pic_url ?? null,
    text:            p.text ?? null,
    permalink:       p.permalink,
    created_at:      p.created_at,
    media_type:      p.media_type,
    first_seen_at:   p.first_seen_at,
    scraper_user_id: SCRAPER_USER_ID,
    keyword:         keyword ?? null,
    like_count:      p.like_count,
    reply_count:     p.reply_count,
    repost_count:    p.repost_count,
    reshare_count:   p.reshare_count ?? null,
  }));

  const { error } = await getClient()
    .from('threads_posts')
    .upsert(rows, { onConflict: 'post_id' });

  if (error) throw new Error(`savePosts: ${error.message}`);

  // Record sighting — one row per (post, scraper); safe to upsert every cycle
  const sightings = rows.map(r => ({
    post_id:         r.post_id,
    scraper_user_id: SCRAPER_USER_ID,
    first_seen_at:   r.first_seen_at,
  }));
  const { error: sErr } = await getClient()
    .from('threads_post_scrapers')
    .upsert(sightings, { onConflict: 'post_id,scraper_user_id', ignoreDuplicates: true });
  if (sErr) throw new Error(`saveSightings: ${sErr.message}`);

  // Insert initial snapshots for this cycle
  const snapshots: EngagementSnapshot[] = posts.map(p => ({
    post_id:       p.post_id,
    observed_at:   p.first_seen_at,
    like_count:    p.like_count,
    reply_count:   p.reply_count,
    repost_count:  p.repost_count,
    quote_count:   p.quote_count,
    reshare_count: p.reshare_count ?? null,
  }));
  await _insertSnapshots(snapshots);

  return { newCount: rows.length, updatedCount: 0 };
}

/**
 * Save counter-refresh snapshots in batch.
 * Only inserts for posts already in threads_posts (FK guard).
 */
export async function saveSnapshots(snapshots: EngagementSnapshot[]): Promise<number> {
  if (snapshots.length === 0) return 0;
  return _insertSnapshots(snapshots);
}

async function _insertSnapshots(snapshots: EngagementSnapshot[]): Promise<number> {
  if (snapshots.length === 0) return 0;
  const db = getClient();

  // Guard FK: only keep snapshots whose post_id exists
  const postIds = [...new Set(snapshots.map(s => s.post_id))];
  const { data: existing } = await db
    .from('threads_posts')
    .select('post_id')
    .in('post_id', postIds);

  const validIds = new Set((existing ?? []).map((r: any) => r.post_id));
  const valid = snapshots.filter(s => validIds.has(s.post_id));
  if (valid.length === 0) return 0;

  const rows = valid.map(s => ({
    post_id:       s.post_id,
    observed_at:   s.observed_at,
    like_count:    s.like_count,
    reply_count:   s.reply_count,
    repost_count:  s.repost_count,
    quote_count:   s.quote_count,
    reshare_count: s.reshare_count ?? null,
  }));

  const { error } = await db.from('threads_snapshots').insert(rows);
  if (error) throw new Error(`saveSnapshots: ${error.message}`);

  return valid.length;
}

export async function getStats(): Promise<{
  totalPosts: number;
  totalSnapshots: number;
}> {
  const db = getClient();
  const [postsRes, snapshotsRes] = await Promise.all([
    db.from('threads_posts').select('*', { count: 'exact', head: true }),
    db.from('threads_snapshots').select('*', { count: 'exact', head: true }),
  ]);
  return {
    totalPosts:     postsRes.count     ?? 0,
    totalSnapshots: snapshotsRes.count ?? 0,
  };
}

// No-op: Supabase client requires no explicit closure
export function closeDb(): void {}
