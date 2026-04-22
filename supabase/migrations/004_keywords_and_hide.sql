-- ============================================================
-- 004: Shared keywords + post hiding
-- Run once in the Supabase SQL editor.
-- ============================================================

-- ── Shared keywords ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS threads_keywords (
  keyword    TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE threads_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_keywords"
  ON threads_keywords FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ── Hidden flag on posts ──────────────────────────────────────────────────────

ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_threads_posts_hidden ON threads_posts(hidden);

-- Controlled hide via SECURITY DEFINER — no broad UPDATE grant to anon
CREATE OR REPLACE FUNCTION hide_post(p_post_id TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE threads_posts SET hidden = true WHERE post_id = p_post_id;
$$;
GRANT EXECUTE ON FUNCTION hide_post(TEXT) TO anon;

-- ── Update get_threads_posts — filter hidden posts ────────────────────────────

CREATE OR REPLACE FUNCTION get_threads_posts(
  p_page              INTEGER DEFAULT 1,
  p_limit             INTEGER DEFAULT 20,
  p_author            TEXT    DEFAULT '',
  p_min_likes         INTEGER DEFAULT 0,
  p_time_window_hours INTEGER DEFAULT 0,
  p_has_keyword       BOOLEAN DEFAULT FALSE,
  p_keyword           TEXT    DEFAULT NULL,
  p_sort_by           TEXT    DEFAULT 'scraped',
  p_media_types       TEXT[]  DEFAULT NULL,
  p_scraper_ids       TEXT[]  DEFAULT NULL
)
RETURNS TABLE (
  post_id         TEXT,
  author_username TEXT,
  text            TEXT,
  permalink       TEXT,
  created_at      BIGINT,
  first_seen_at   TIMESTAMPTZ,
  media_type      TEXT,
  scraper_user_id TEXT,
  scrapers        TEXT[],
  like_count      INTEGER,
  reply_count     INTEGER,
  repost_count    INTEGER,
  reshare_count   INTEGER,
  total_count     BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH sightings AS (
    SELECT tps.post_id,
           ARRAY_AGG(tps.scraper_user_id ORDER BY tps.scraper_user_id) AS scrapers
    FROM threads_post_scrapers tps
    GROUP BY tps.post_id
  ),
  filtered AS (
    SELECT
      p.post_id, p.author_username, p.text, p.permalink,
      p.created_at, p.first_seen_at, p.media_type, p.scraper_user_id,
      COALESCE(si.scrapers, ARRAY[p.scraper_user_id]) AS scrapers,
      p.like_count, p.reply_count, p.repost_count, p.reshare_count
    FROM threads_posts p
    LEFT JOIN sightings si ON si.post_id = p.post_id
    WHERE
      p.hidden = false
      AND ((NOT p_has_keyword AND p.keyword IS NULL) OR (p_has_keyword AND p.keyword = p_keyword))
      AND (p_author = '' OR p.author_username ILIKE '%' || p_author || '%')
      AND (p_min_likes = 0 OR p.like_count >= p_min_likes)
      AND (
        p_time_window_hours = 0
        OR (p.created_at > 0 AND TO_TIMESTAMP(p.created_at) > NOW() - (p_time_window_hours || ' hours')::INTERVAL)
        OR (p.created_at = 0 AND p.first_seen_at            > NOW() - (p_time_window_hours || ' hours')::INTERVAL)
      )
      AND (
        p_media_types IS NULL
        OR p.media_type = ANY(p_media_types)
        OR ('TEXT' = ANY(p_media_types) AND p.media_type IS NULL)
      )
      AND (
        p_scraper_ids IS NULL
        OR EXISTS (
          SELECT 1 FROM threads_post_scrapers tps
          WHERE tps.post_id = p.post_id AND tps.scraper_user_id = ANY(p_scraper_ids)
        )
      )
  )
  SELECT
    f.post_id, f.author_username, f.text, f.permalink,
    f.created_at, f.first_seen_at, f.media_type, f.scraper_user_id,
    f.scrapers,
    f.like_count, f.reply_count, f.repost_count, f.reshare_count,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort_by = 'posted' AND f.created_at > 0 THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort_by = 'posted' THEN f.created_at END DESC NULLS LAST,
    f.first_seen_at DESC
  LIMIT p_limit OFFSET (p_page - 1) * p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_threads_posts(INTEGER, INTEGER, TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT[], TEXT[]) TO anon;

-- ── Update get_velocity_leaderboard — filter hidden posts ─────────────────────

CREATE OR REPLACE FUNCTION get_velocity_leaderboard(
  max_age_minutes INTEGER DEFAULT 360,
  result_limit    INTEGER DEFAULT 20
)
RETURNS TABLE (
  post_id            TEXT,
  author_username    TEXT,
  text               TEXT,
  permalink          TEXT,
  created_at         BIGINT,
  media_type         TEXT,
  scraper_user_id    TEXT,
  scrapers           TEXT[],
  scraper_count      BIGINT,
  current_likes      INTEGER,
  current_replies    INTEGER,
  current_reposts    INTEGER,
  likes_per_minute   NUMERIC,
  replies_per_minute NUMERIC,
  reposts_per_minute NUMERIC,
  composite_score    NUMERIC,
  minutes_old        NUMERIC,
  snapshot_count     BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH post_velocity AS (
    SELECT
      p.post_id,
      p.author_username,
      p.text,
      p.permalink,
      p.created_at,
      p.media_type,
      p.scraper_user_id,
      MAX(s.like_count)                          AS current_likes,
      MAX(s.reply_count)                         AS current_replies,
      MAX(s.repost_count)                        AS current_reposts,
      MAX(s.like_count)   - MIN(s.like_count)   AS like_delta,
      MAX(s.reply_count)  - MIN(s.reply_count)  AS reply_delta,
      MAX(s.repost_count) - MIN(s.repost_count) AS repost_delta,
      EXTRACT(EPOCH FROM (MAX(s.observed_at) - MIN(s.observed_at))) / 60.0 AS minutes_observed,
      COUNT(s.id)                                AS snapshot_count,
      CASE
        WHEN p.created_at > 0
          THEN ROUND(EXTRACT(EPOCH FROM (NOW() - TO_TIMESTAMP(p.created_at))) / 60.0, 1)
        ELSE
          ROUND(EXTRACT(EPOCH FROM (NOW() - p.first_seen_at)) / 60.0, 1)
      END AS minutes_old
    FROM threads_posts p
    JOIN threads_snapshots s ON p.post_id = s.post_id
    WHERE p.hidden = false
      AND p.first_seen_at > NOW() - (max_age_minutes || ' minutes')::INTERVAL
    GROUP BY p.post_id, p.author_username, p.text, p.permalink,
             p.created_at, p.media_type, p.scraper_user_id
    HAVING COUNT(s.id) >= 2
       AND EXTRACT(EPOCH FROM (MAX(s.observed_at) - MIN(s.observed_at))) > 0
  ),
  sightings AS (
    SELECT tps.post_id,
           ARRAY_AGG(tps.scraper_user_id ORDER BY tps.scraper_user_id) AS scrapers,
           COUNT(*) AS scraper_count
    FROM threads_post_scrapers tps
    GROUP BY tps.post_id
  )
  SELECT
    pv.post_id,
    pv.author_username,
    pv.text,
    pv.permalink,
    pv.created_at,
    pv.media_type,
    pv.scraper_user_id,
    COALESCE(si.scrapers, ARRAY[pv.scraper_user_id]),
    COALESCE(si.scraper_count, 1),
    pv.current_likes::INTEGER,
    pv.current_replies::INTEGER,
    pv.current_reposts::INTEGER,
    ROUND(pv.like_delta   / NULLIF(pv.minutes_observed, 0), 2),
    ROUND(pv.reply_delta  / NULLIF(pv.minutes_observed, 0), 2),
    ROUND(pv.repost_delta / NULLIF(pv.minutes_observed, 0), 2),
    ROUND(
      (pv.like_delta * 1.0 + pv.reply_delta * 2.0 + pv.repost_delta * 3.0)
      / NULLIF(pv.minutes_observed, 0)
      * (1 + (COALESCE(si.scraper_count, 1) - 1) * 0.5)
    , 2),
    pv.minutes_old,
    pv.snapshot_count
  FROM post_velocity pv
  LEFT JOIN sightings si ON si.post_id = pv.post_id
  ORDER BY
    ROUND(
      (pv.like_delta * 1.0 + pv.reply_delta * 2.0 + pv.repost_delta * 3.0)
      / NULLIF(pv.minutes_observed, 0)
      * (1 + (COALESCE(si.scraper_count, 1) - 1) * 0.5)
    , 2) DESC NULLS LAST
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION get_velocity_leaderboard(INTEGER, INTEGER) TO anon;
