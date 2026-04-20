-- ============================================================
-- Threads scraper tables
-- Run once in the Supabase SQL editor.
-- ============================================================

-- threads_posts: one row per unique Threads post
CREATE TABLE IF NOT EXISTS threads_posts (
  post_id          TEXT        PRIMARY KEY,
  code             TEXT        NOT NULL DEFAULT '',
  author_username  TEXT        NOT NULL,
  author_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  author_pk        TEXT        NOT NULL DEFAULT '',
  author_pic_url   TEXT,
  text             TEXT,
  permalink        TEXT        NOT NULL,
  created_at       BIGINT      NOT NULL DEFAULT 0,  -- Unix timestamp from Threads
  media_type       TEXT        NOT NULL DEFAULT 'TEXT',
  first_seen_at    TIMESTAMPTZ NOT NULL,
  scraper_user_id  TEXT        NOT NULL DEFAULT 'unknown',
  keyword          TEXT,
  -- Denormalized latest engagement counts (fast feed queries, no join needed)
  like_count       INTEGER     NOT NULL DEFAULT 0,
  reply_count      INTEGER     NOT NULL DEFAULT 0,
  repost_count     INTEGER     NOT NULL DEFAULT 0,
  reshare_count    INTEGER
);

-- threads_snapshots: historical engagement observations (used for velocity)
CREATE TABLE IF NOT EXISTS threads_snapshots (
  id            BIGSERIAL   PRIMARY KEY,
  post_id       TEXT        NOT NULL REFERENCES threads_posts(post_id),
  observed_at   TIMESTAMPTZ NOT NULL,
  like_count    INTEGER     NOT NULL DEFAULT 0,
  reply_count   INTEGER     NOT NULL DEFAULT 0,
  repost_count  INTEGER     NOT NULL DEFAULT 0,
  quote_count   INTEGER     NOT NULL DEFAULT 0,
  reshare_count INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_threads_posts_keyword       ON threads_posts(keyword);
CREATE INDEX IF NOT EXISTS idx_threads_posts_created_at    ON threads_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_threads_posts_first_seen_at ON threads_posts(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_threads_posts_author        ON threads_posts(author_username);
CREATE INDEX IF NOT EXISTS idx_threads_posts_scraper_user  ON threads_posts(scraper_user_id);
CREATE INDEX IF NOT EXISTS idx_threads_snapshots_post_id   ON threads_snapshots(post_id);
CREATE INDEX IF NOT EXISTS idx_threads_snapshots_observed  ON threads_snapshots(observed_at);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE threads_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads_snapshots  ENABLE ROW LEVEL SECURITY;

-- Web app (anon key) can read both tables
CREATE POLICY "anon_select_threads_posts"
  ON threads_posts FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_threads_snapshots"
  ON threads_snapshots FOR SELECT TO anon USING (true);

-- Service role bypasses RLS by default — scraper writes use the service key.

-- threads_post_scrapers: which scrapers have seen each post (junction table)
CREATE TABLE IF NOT EXISTS threads_post_scrapers (
  post_id         TEXT NOT NULL REFERENCES threads_posts(post_id),
  scraper_user_id TEXT NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, scraper_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tps_scraper ON threads_post_scrapers(scraper_user_id);

ALTER TABLE threads_post_scrapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_threads_post_scrapers"
  ON threads_post_scrapers FOR SELECT TO anon USING (true);

-- ============================================================
-- Immutability trigger
-- Prevents upserts from overwriting first_seen_at and scraper_user_id.
-- The scraper sends these on every upsert; the trigger silently restores
-- the original values so the first observation is preserved.
-- ============================================================

CREATE OR REPLACE FUNCTION threads_posts_preserve_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.first_seen_at   := OLD.first_seen_at;
  NEW.scraper_user_id := OLD.scraper_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_threads_posts_preserve ON threads_posts;
CREATE TRIGGER trg_threads_posts_preserve
  BEFORE UPDATE ON threads_posts
  FOR EACH ROW EXECUTE FUNCTION threads_posts_preserve_immutable();

-- ============================================================
-- Velocity leaderboard RPC
-- Composite viral score: (Δlikes×1 + Δreplies×2 + Δreposts×3) / minutes
-- Requires ≥2 snapshots within max_age_minutes window.
-- ============================================================

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
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
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
    WHERE p.first_seen_at > NOW() - (max_age_minutes || ' minutes')::INTERVAL
    GROUP BY p.post_id, p.author_username, p.text, p.permalink,
             p.created_at, p.media_type, p.scraper_user_id
    HAVING COUNT(s.id) >= 2
       AND EXTRACT(EPOCH FROM (MAX(s.observed_at) - MIN(s.observed_at))) > 0
  ),
  sightings AS (
    SELECT post_id,
           ARRAY_AGG(scraper_user_id ORDER BY scraper_user_id) AS scrapers,
           COUNT(*) AS scraper_count
    FROM threads_post_scrapers
    GROUP BY post_id
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
    -- Score boosted by scraper overlap: each extra scraper adds 50% weight
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
END;
$$;

GRANT EXECUTE ON FUNCTION get_velocity_leaderboard(INTEGER, INTEGER) TO anon;

-- ============================================================
-- Posts query RPC
-- Handles all filtering and pagination server-side.
-- Returns total_count in every row (window function) so the
-- client gets count + rows in a single round-trip.
-- ============================================================

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
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_offset INTEGER := (p_page - 1) * p_limit;
BEGIN
  RETURN QUERY
  WITH sightings AS (
    SELECT post_id,
           ARRAY_AGG(scraper_user_id ORDER BY scraper_user_id) AS scrapers
    FROM threads_post_scrapers
    GROUP BY post_id
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
      ((NOT p_has_keyword AND p.keyword IS NULL) OR (p_has_keyword AND p.keyword = p_keyword))
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
  LIMIT p_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_threads_posts(INTEGER, INTEGER, TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT[], TEXT[]) TO anon;
