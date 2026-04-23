import * as dotenv from 'dotenv';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TweetPost, TweetSnapshot } from '../agent/twitter-scraper';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SCRAPER_USER_ID      = (process.env.SCRAPER_USER_ID || 'unknown').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env');
  process.exit(1);
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) _client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
  return _client;
}

export async function saveTweets(
  posts: TweetPost[],
  source: 'home' | 'keyword' | 'account' = 'home',
  keyword?: string,
  watchUsername?: string
): Promise<{ newCount: number }> {
  if (posts.length === 0) return { newCount: 0 };

  const rows = posts
    .filter(p => !p.is_promoted)  // never persist promoted tweets
    .map(p => ({
      post_id:         p.post_id,
      author_username: p.author_username,
      author_verified: p.author_verified,
      text:            p.text ?? null,
      permalink:       p.permalink,
      created_at:      p.created_at,
      media_type:      p.media_type,
      first_seen_at:   p.first_seen_at,
      scraper_user_id: SCRAPER_USER_ID,
      source,
      keyword:         keyword ?? null,
      watch_username:  watchUsername ?? null,
      is_reply:        p.is_reply,
      is_promoted:     false,
      view_count:      p.view_count,
      like_count:      p.like_count,
      reply_count:     p.reply_count,
      retweet_count:   p.retweet_count,
      quote_count:     p.quote_count,
    }));

  if (rows.length === 0) return { newCount: 0 };

  const { error } = await getClient()
    .from('twitter_posts')
    .upsert(rows, { onConflict: 'post_id' });

  if (error) {
    const hint = error.message.includes('row-level security')
      ? ' — check that SUPABASE_SERVICE_KEY in scraper/.env is the service_role key, not the anon key'
      : '';
    throw new Error(`saveTweets: ${error.message}${hint}`);
  }

  // Record sightings (one row per post+scraper pair, idempotent)
  const sightings = rows.map(r => ({
    post_id:         r.post_id,
    scraper_user_id: SCRAPER_USER_ID,
    first_seen_at:   r.first_seen_at,
  }));
  const { error: sErr } = await getClient()
    .from('twitter_post_scrapers')
    .upsert(sightings, { onConflict: 'post_id,scraper_user_id', ignoreDuplicates: true });
  if (sErr) throw new Error(`saveTweetSightings: ${sErr.message}`);

  // Insert engagement snapshots for this cycle
  const snapshots: TweetSnapshot[] = rows.map(r => ({
    post_id:       r.post_id,
    observed_at:   r.first_seen_at,
    view_count:    r.view_count,
    like_count:    r.like_count,
    reply_count:   r.reply_count,
    retweet_count: r.retweet_count,
    quote_count:   r.quote_count,
  }));
  await _insertSnapshots(snapshots);

  return { newCount: rows.length };
}

export async function saveTwitterSnapshots(snapshots: TweetSnapshot[]): Promise<number> {
  return _insertSnapshots(snapshots);
}

async function _insertSnapshots(snapshots: TweetSnapshot[]): Promise<number> {
  if (snapshots.length === 0) return 0;
  const db = getClient();

  // Guard FK: only keep snapshots whose post_id exists
  const postIds = [...new Set(snapshots.map(s => s.post_id))];
  const { data: existing } = await db
    .from('twitter_posts')
    .select('post_id')
    .in('post_id', postIds);

  const validIds = new Set((existing ?? []).map((r: any) => r.post_id));
  const valid    = snapshots.filter(s => validIds.has(s.post_id));
  if (valid.length === 0) return 0;

  const rows = valid.map(s => ({
    post_id:       s.post_id,
    observed_at:   s.observed_at,
    view_count:    s.view_count,
    like_count:    s.like_count,
    reply_count:   s.reply_count,
    retweet_count: s.retweet_count,
    quote_count:   s.quote_count,
  }));

  const { error } = await db.from('twitter_snapshots').insert(rows);
  if (error) throw new Error(`saveTwitterSnapshots: ${error.message}`);

  return valid.length;
}

export async function getWatchAccounts(): Promise<Array<{ username: string; display_name: string }>> {
  const { data, error } = await getClient()
    .from('twitter_watch_accounts')
    .select('username, display_name')
    .order('added_at');
  if (error) throw new Error(`getWatchAccounts: ${error.message}`);
  return data ?? [];
}

export async function getTwitterStats(): Promise<{
  totalPosts: number;
  totalSnapshots: number;
}> {
  const db = getClient();
  const [postsRes, snapshotsRes] = await Promise.all([
    db.from('twitter_posts').select('*', { count: 'exact', head: true }),
    db.from('twitter_snapshots').select('*', { count: 'exact', head: true }),
  ]);
  return {
    totalPosts:     postsRes.count     ?? 0,
    totalSnapshots: snapshotsRes.count ?? 0,
  };
}
