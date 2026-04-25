/**
 * threads-api-fetch — Fetch posts from the Meta Threads API and save to booster_trackers.
 *
 * Env vars:
 *   HANDLE        Threads handle (with or without @)
 *   TOKEN         Threads API user access token
 *   LIMIT         Max posts to fetch (default: 200)
 */

import { upsertBoosterPosts } from '../storage/booster-db';
import { ProfilePost } from '../agent/threads-profile';

const HANDLE = (process.env.HANDLE || '').replace(/^@/, '');
const TOKEN  = process.env.TOKEN || '';
const LIMIT  = parseInt(process.env.LIMIT || '200', 10);

const FIELDS = 'id,timestamp,text,permalink,media_type,like_count,replies_count,repost_count,quote_count,views,is_quote_post';
const API_BASE = 'https://graph.threads.net/v1.0';

function mapMediaType(t: string): ProfilePost['media_type'] {
  if (t === 'VIDEO')          return 'VIDEO';
  if (t === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  if (t === 'IMAGE')          return 'IMAGE';
  return 'TEXT';
}

async function fetchPage(url: string): Promise<{ posts: any[]; nextUrl: string | null }> {
  const res  = await fetch(url);
  const body = await res.json() as any;
  if (body.error) throw new Error(`Threads API: ${body.error.message}`);

  const posts   = body.data || [];
  const nextUrl = body.paging?.next || null;
  return { posts, nextUrl };
}

async function main() {
  if (!HANDLE || !TOKEN) {
    console.error('❌  HANDLE and TOKEN env vars are required');
    process.exit(1);
  }

  console.log(`\n📡 Threads API Fetch`);
  console.log(`   Handle: @${HANDLE}   Limit: ${LIMIT}\n`);

  // Verify token by fetching the user profile
  const profileRes  = await fetch(`${API_BASE}/me?fields=id,username&access_token=${TOKEN}`);
  const profileData = await profileRes.json() as any;
  if (profileData.error) {
    console.error(`❌  Token error: ${profileData.error.message}`);
    process.exit(1);
  }
  console.log(`  ✅ Token valid for @${profileData.username}`);

  const allPosts: ProfilePost[] = [];
  let url: string | null = `${API_BASE}/me/threads?fields=${FIELDS}&limit=25&access_token=${TOKEN}`;
  let page = 0;

  while (url && allPosts.length < LIMIT) {
    page++;
    const { posts, nextUrl } = await fetchPage(url);

    for (const p of posts) {
      // Skip reposts of other people's content
      if (p.media_type === 'REPOST_FACADE') continue;

      const createdAt = p.timestamp ? Math.floor(new Date(p.timestamp).getTime() / 1000) : 0;
      allPosts.push({
        post_id:      p.id,
        text:         p.text || null,
        created_at:   createdAt,
        permalink:    p.permalink || `https://www.threads.net/@${HANDLE}`,
        media_type:   mapMediaType(p.media_type || 'TEXT_POST'),
        is_reply_post: false,
        like_count:   p.like_count   ?? 0,
        reply_count:  p.replies_count ?? 0,
        repost_count: p.repost_count ?? 0,
        share_count:  0,
      });
    }

    console.log(`  📄 Page ${page}: +${posts.length} posts (${allPosts.length} total)`);
    url = allPosts.length < LIMIT ? nextUrl : null;
  }

  if (allPosts.length === 0) {
    console.log('  ⚠️  No posts found');
    process.exit(0);
  }

  console.log(`\n  💾 Saving ${allPosts.length} posts to Supabase...`);
  const { inserted, updated } = await upsertBoosterPosts(`@${HANDLE}`, allPosts);
  console.log(`  ✅ Done: ${inserted} new, ${updated} updated`);
  process.exit(0);
}

main().catch(err => {
  console.error(`❌  Fatal: ${err.message}`);
  process.exit(1);
});
