/**
 * One-time migration: SQLite → Supabase.
 *
 * Reads ~/.threads-tracker/tracker.db and upserts all posts + snapshots
 * into the Supabase threads_posts / threads_snapshots tables.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/001_threads_tables.sql in the Supabase dashboard first.
 *   2. Ensure scraper/.env has SUPABASE_URL, SUPABASE_SERVICE_KEY, SCRAPER_USER_ID.
 *   3. better-sqlite3 must be installed (it's a devDependency — already present if
 *      you installed with npm install). On Windows this requires VS Build Tools 2022.
 *
 * Usage:
 *   npm run migrate          (from scraper/)
 *   npm run scraper:migrate  (from repo root)
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import '../config'; // loads dotenv

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SCRAPER_USER_ID     = (process.env.SCRAPER_USER_ID || 'unknown').trim();
const DB_PATH             = path.join(os.homedir(), '.threads-tracker', 'tracker.db');
const BATCH               = 200;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env');
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.log(`No SQLite database found at ${DB_PATH}. Nothing to migrate.`);
    process.exit(0);
  }

  let Database: typeof import('better-sqlite3');
  try {
    Database = require('better-sqlite3');
  } catch {
    console.error('❌ better-sqlite3 not available.');
    console.error('   Run: npm install (from the repo root) to install devDependencies.');
    process.exit(1);
  }

  console.log(`📦 Source : ${DB_PATH}`);
  console.log(`☁️  Target : ${SUPABASE_URL}`);
  console.log(`👤 User   : ${SCRAPER_USER_ID}\n`);

  const sqlite   = new Database(DB_PATH, { readonly: true });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── 1. Load latest engagement counts per post ────────────────────────────
  const latestCounts = sqlite.prepare(`
    SELECT post_id, like_count, reply_count, repost_count, reshare_count
    FROM   engagement_snapshots
    WHERE  id IN (SELECT MAX(id) FROM engagement_snapshots GROUP BY post_id)
  `).all() as any[];

  const latestMap = new Map(latestCounts.map(r => [r.post_id, r]));

  // ── 2. Migrate posts ─────────────────────────────────────────────────────
  const posts = sqlite.prepare('SELECT * FROM posts').all() as any[];
  console.log(`Posts to migrate: ${posts.length}`);

  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const rows  = batch.map((p: any) => {
      const latest = latestMap.get(p.post_id);
      return {
        post_id:         p.post_id,
        code:            p.code || '',
        author_username: p.author_username,
        author_verified: Boolean(p.author_verified),
        author_pk:       p.author_pk || '',
        author_pic_url:  p.author_pic_url ?? null,
        text:            p.text ?? null,
        permalink:       p.permalink,
        created_at:      p.created_at,
        media_type:      p.media_type || 'TEXT',
        first_seen_at:   p.first_seen_at,
        scraper_user_id: SCRAPER_USER_ID,
        keyword:         p.keyword ?? null,
        like_count:      latest?.like_count    ?? 0,
        reply_count:     latest?.reply_count   ?? 0,
        repost_count:    latest?.repost_count  ?? 0,
        reshare_count:   latest?.reshare_count ?? null,
      };
    });

    const { error } = await supabase
      .from('threads_posts')
      .upsert(rows, { onConflict: 'post_id' });

    if (error) console.error(`  ✗ Posts batch ${Math.ceil((i + 1) / BATCH)}:`, error.message);
    else        console.log(`  ✓ Posts ${Math.min(i + BATCH, posts.length)} / ${posts.length}`);
  }

  // ── 3. Migrate snapshots ─────────────────────────────────────────────────
  const snapshots = sqlite.prepare('SELECT * FROM engagement_snapshots').all() as any[];
  console.log(`\nSnapshots to migrate: ${snapshots.length}`);

  for (let i = 0; i < snapshots.length; i += BATCH) {
    const batch = snapshots.slice(i, i + BATCH);
    const rows  = batch.map((s: any) => ({
      post_id:       s.post_id,
      observed_at:   s.observed_at,
      like_count:    s.like_count,
      reply_count:   s.reply_count,
      repost_count:  s.repost_count,
      quote_count:   s.quote_count   || 0,
      reshare_count: s.reshare_count ?? null,
    }));

    // Skip rows whose post_id doesn't exist (should be none, but guard anyway)
    const { error } = await supabase.from('threads_snapshots').insert(rows);
    if (error) console.error(`  ✗ Snapshots batch ${Math.ceil((i + 1) / BATCH)}:`, error.message);
    else        console.log(`  ✓ Snapshots ${Math.min(i + BATCH, snapshots.length)} / ${snapshots.length}`);
  }

  sqlite.close();
  console.log('\n✅ Migration complete.');
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
