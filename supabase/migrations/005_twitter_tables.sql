-- ============================================================
-- 005: Twitter/X scraper tables
-- Run once in the Supabase SQL editor.
-- ============================================================

-- twitter_posts: one row per unique tweet
CREATE TABLE IF NOT EXISTS twitter_posts (
  post_id          TEXT        PRIMARY KEY,             -- numeric tweet ID as text
  author_username  TEXT        NOT NULL,
  author_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  text             TEXT,
  permalink        TEXT        NOT NULL,
  created_at       BIGINT      NOT NULL DEFAULT 0,      -- Unix timestamp
  media_type       TEXT        NOT NULL DEFAULT 'TEXT', -- TEXT|IMAGE|VIDEO|CAROUSEL
  first_seen_at    TIMESTAMPTZ NOT NULL,
  scraper_user_id  TEXT        NOT NULL DEFAULT 'unknown',
  source           TEXT        NOT NULL DEFAULT 'home', -- home|keyword|account
  keyword          TEXT,                                -- set when source=keyword
  watch_username   TEXT,                                -- set when source=account
  is_reply         BOOLEAN     NOT NULL DEFAULT FALSE,
  is_promoted      BOOLEAN     NOT NULL DEFAULT FALSE,
  hidden           BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Denormalized latest engagement (updated on each scrape)
  view_count       BIGINT      NOT NULL DEFAULT 0,
  like_count       INTEGER     NOT NULL DEFAULT 0,
  reply_count      INTEGER     NOT NULL DEFAULT 0,
  retweet_count    INTEGER     NOT NULL DEFAULT 0,
  quote_count      INTEGER     NOT NULL DEFAULT 0
);

-- twitter_snapshots: one row per engagement observation per post
CREATE TABLE IF NOT EXISTS twitter_snapshots (
  id            BIGSERIAL   PRIMARY KEY,
  post_id       TEXT        NOT NULL REFERENCES twitter_posts(post_id),
  observed_at   TIMESTAMPTZ NOT NULL,
  view_count    BIGINT      NOT NULL DEFAULT 0,
  like_count    INTEGER     NOT NULL DEFAULT 0,
  reply_count   INTEGER     NOT NULL DEFAULT 0,
  retweet_count INTEGER     NOT NULL DEFAULT 0,
  quote_count   INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_twitter_posts_source         ON twitter_posts(source);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_keyword        ON twitter_posts(keyword);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_watch_username ON twitter_posts(watch_username);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_created_at     ON twitter_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_first_seen_at  ON twitter_posts(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_author         ON twitter_posts(author_username);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_scraper_user   ON twitter_posts(scraper_user_id);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_hidden         ON twitter_posts(hidden);
CREATE INDEX IF NOT EXISTS idx_twitter_snapshots_post_id    ON twitter_snapshots(post_id);
CREATE INDEX IF NOT EXISTS idx_twitter_snapshots_observed   ON twitter_snapshots(observed_at);

ALTER TABLE twitter_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitter_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_twitter_posts"
  ON twitter_posts FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_twitter_snapshots"
  ON twitter_snapshots FOR SELECT TO anon USING (true);

-- twitter_post_scrapers: which scrapers have seen each post
CREATE TABLE IF NOT EXISTS twitter_post_scrapers (
  post_id         TEXT        NOT NULL REFERENCES twitter_posts(post_id),
  scraper_user_id TEXT        NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, scraper_user_id)
);

CREATE INDEX IF NOT EXISTS idx_twps_scraper ON twitter_post_scrapers(scraper_user_id);

ALTER TABLE twitter_post_scrapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_twitter_post_scrapers"
  ON twitter_post_scrapers FOR SELECT TO anon USING (true);

-- twitter_keywords: shared keyword list across all team members
CREATE TABLE IF NOT EXISTS twitter_keywords (
  keyword    TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE twitter_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_twitter_keywords"
  ON twitter_keywords FOR ALL TO anon USING (true) WITH CHECK (true);

-- twitter_watch_accounts: target accounts for Hot Window monitoring
CREATE TABLE IF NOT EXISTS twitter_watch_accounts (
  username     TEXT        PRIMARY KEY,  -- handle without @
  display_name TEXT        NOT NULL DEFAULT '',
  added_by     TEXT        NOT NULL DEFAULT 'unknown',
  added_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE twitter_watch_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_twitter_watch_accounts"
  ON twitter_watch_accounts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Immutability trigger — preserves first_seen_at + scraper_user_id on upsert
-- ============================================================

CREATE OR REPLACE FUNCTION twitter_posts_preserve_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.first_seen_at   := OLD.first_seen_at;
  NEW.scraper_user_id := OLD.scraper_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_twitter_posts_preserve ON twitter_posts;
CREATE TRIGGER trg_twitter_posts_preserve
  BEFORE UPDATE ON twitter_posts
  FOR EACH ROW EXECUTE FUNCTION twitter_posts_preserve_immutable();

-- ============================================================
-- Hide post RPC (SECURITY DEFINER — no broad UPDATE grant needed)
-- ============================================================

CREATE OR REPLACE FUNCTION hide_twitter_post(p_post_id TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE twitter_posts SET hidden = true WHERE post_id = p_post_id;
$$;
GRANT EXECUTE ON FUNCTION hide_twitter_post(TEXT) TO anon;

-- ============================================================
-- Feed query RPC
-- ============================================================

CREATE OR REPLACE FUNCTION get_twitter_posts(
  p_page              INTEGER DEFAULT 1,
  p_limit             INTEGER DEFAULT 20,
  p_author            TEXT    DEFAULT '',
  p_min_likes         INTEGER DEFAULT 0,
  p_time_window_hours INTEGER DEFAULT 0,
  p_source            TEXT    DEFAULT '',
  p_keyword           TEXT    DEFAULT NULL,
  p_sort_by           TEXT    DEFAULT 'scraped',
  p_media_types       TEXT[]  DEFAULT NULL,
  p_scraper_ids       TEXT[]  DEFAULT NULL
)
RETURNS TABLE (
  post_id          TEXT,
  author_username  TEXT,
  author_verified  BOOLEAN,
  text             TEXT,
  permalink        TEXT,
  created_at       BIGINT,
  first_seen_at    TIMESTAMPTZ,
  media_type       TEXT,
  scraper_user_id  TEXT,
  scrapers         TEXT[],
  view_count       BIGINT,
  like_count       INTEGER,
  reply_count      INTEGER,
  retweet_count    INTEGER,
  quote_count      INTEGER,
  total_count      BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH sightings AS (
    SELECT tps.post_id,
           ARRAY_AGG(tps.scraper_user_id ORDER BY tps.scraper_user_id) AS scrapers
    FROM twitter_post_scrapers tps
    GROUP BY tps.post_id
  ),
  filtered AS (
    SELECT
      p.post_id, p.author_username, p.author_verified, p.text, p.permalink,
      p.created_at, p.first_seen_at, p.media_type, p.scraper_user_id,
      COALESCE(si.scrapers, ARRAY[p.scraper_user_id]) AS scrapers,
      p.view_count, p.like_count, p.reply_count, p.retweet_count, p.quote_count
    FROM twitter_posts p
    LEFT JOIN sightings si ON si.post_id = p.post_id
    WHERE
      p.hidden = false
      AND p.is_promoted = false
      AND (p_source = '' OR p.source = p_source)
      AND (p_keyword IS NULL OR p.keyword = p_keyword)
      AND (p_author = '' OR p.author_username ILIKE '%' || p_author || '%')
      AND (p_min_likes = 0 OR p.like_count >= p_min_likes)
      AND (
        p_time_window_hours = 0
        OR (p.created_at > 0 AND TO_TIMESTAMP(p.created_at) > NOW() - (p_time_window_hours || ' hours')::INTERVAL)
        OR (p.created_at = 0 AND p.first_seen_at            > NOW() - (p_time_window_hours || ' hours')::INTERVAL)
      )
      AND (p_media_types IS NULL OR p.media_type = ANY(p_media_types))
      AND (
        p_scraper_ids IS NULL
        OR EXISTS (
          SELECT 1 FROM twitter_post_scrapers tps
          WHERE tps.post_id = p.post_id AND tps.scraper_user_id = ANY(p_scraper_ids)
        )
      )
  )
  SELECT
    f.post_id, f.author_username, f.author_verified, f.text, f.permalink,
    f.created_at, f.first_seen_at, f.media_type, f.scraper_user_id, f.scrapers,
    f.view_count, f.like_count, f.reply_count, f.retweet_count, f.quote_count,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort_by = 'posted' AND f.created_at > 0 THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort_by = 'posted'  THEN f.created_at  END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'top'     THEN f.like_count  END DESC NULLS LAST,
    f.first_seen_at DESC
  LIMIT p_limit OFFSET (p_page - 1) * p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_twitter_posts(INTEGER, INTEGER, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT[], TEXT[]) TO anon;

-- ============================================================
-- Viral leaderboard RPC
-- Score: (Δviews×0.3 + Δretweets×3 + Δquotes×2 + Δreplies×1.5 + Δlikes×1) / minutes
-- Cross-scraper boost: × (1 + (scraper_count − 1) × 0.5)
-- ============================================================

CREATE OR REPLACE FUNCTION get_twitter_velocity_leaderboard(
  max_age_minutes INTEGER DEFAULT 240,
  result_limit    INTEGER DEFAULT 20
)
RETURNS TABLE (
  post_id              TEXT,
  author_username      TEXT,
  author_verified      BOOLEAN,
  text                 TEXT,
  permalink            TEXT,
  created_at           BIGINT,
  media_type           TEXT,
  scraper_user_id      TEXT,
  scrapers             TEXT[],
  scraper_count        BIGINT,
  current_views        BIGINT,
  current_likes        INTEGER,
  current_replies      INTEGER,
  current_retweets     INTEGER,
  current_quotes       INTEGER,
  views_per_minute     NUMERIC,
  likes_per_minute     NUMERIC,
  replies_per_minute   NUMERIC,
  retweets_per_minute  NUMERIC,
  composite_score      NUMERIC,
  minutes_old          NUMERIC,
  snapshot_count       BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH post_velocity AS (
    SELECT
      p.post_id, p.author_username, p.author_verified, p.text, p.permalink,
      p.created_at, p.media_type, p.scraper_user_id,
      MAX(s.view_count)                              AS current_views,
      MAX(s.like_count)                              AS current_likes,
      MAX(s.reply_count)                             AS current_replies,
      MAX(s.retweet_count)                           AS current_retweets,
      MAX(s.quote_count)                             AS current_quotes,
      MAX(s.view_count)    - MIN(s.view_count)      AS view_delta,
      MAX(s.like_count)    - MIN(s.like_count)      AS like_delta,
      MAX(s.reply_count)   - MIN(s.reply_count)     AS reply_delta,
      MAX(s.retweet_count) - MIN(s.retweet_count)   AS retweet_delta,
      MAX(s.quote_count)   - MIN(s.quote_count)     AS quote_delta,
      EXTRACT(EPOCH FROM (MAX(s.observed_at) - MIN(s.observed_at))) / 60.0 AS minutes_observed,
      COUNT(s.id) AS snapshot_count,
      CASE
        WHEN p.created_at > 0
          THEN ROUND(EXTRACT(EPOCH FROM (NOW() - TO_TIMESTAMP(p.created_at))) / 60.0, 1)
        ELSE
          ROUND(EXTRACT(EPOCH FROM (NOW() - p.first_seen_at)) / 60.0, 1)
      END AS minutes_old
    FROM twitter_posts p
    JOIN twitter_snapshots s ON p.post_id = s.post_id
    WHERE p.hidden = false
      AND p.is_promoted = false
      AND p.first_seen_at > NOW() - (max_age_minutes || ' minutes')::INTERVAL
    GROUP BY p.post_id, p.author_username, p.author_verified, p.text, p.permalink,
             p.created_at, p.media_type, p.scraper_user_id
    HAVING COUNT(s.id) >= 2
       AND EXTRACT(EPOCH FROM (MAX(s.observed_at) - MIN(s.observed_at))) > 0
  ),
  sightings AS (
    SELECT tps.post_id,
           ARRAY_AGG(tps.scraper_user_id ORDER BY tps.scraper_user_id) AS scrapers,
           COUNT(*) AS scraper_count
    FROM twitter_post_scrapers tps
    GROUP BY tps.post_id
  ),
  scored AS (
    SELECT
      pv.post_id, pv.author_username, pv.author_verified, pv.text, pv.permalink,
      pv.created_at, pv.media_type, pv.scraper_user_id,
      COALESCE(si.scrapers, ARRAY[pv.scraper_user_id])  AS scrapers,
      COALESCE(si.scraper_count, 1)                     AS scraper_count,
      pv.current_views::BIGINT,
      pv.current_likes::INTEGER,
      pv.current_replies::INTEGER,
      pv.current_retweets::INTEGER,
      pv.current_quotes::INTEGER,
      ROUND(pv.view_delta    / NULLIF(pv.minutes_observed, 0), 2) AS views_per_minute,
      ROUND(pv.like_delta    / NULLIF(pv.minutes_observed, 0), 2) AS likes_per_minute,
      ROUND(pv.reply_delta   / NULLIF(pv.minutes_observed, 0), 2) AS replies_per_minute,
      ROUND(pv.retweet_delta / NULLIF(pv.minutes_observed, 0), 2) AS retweets_per_minute,
      ROUND(
        (pv.view_delta * 0.3 + pv.retweet_delta * 3.0 + pv.quote_delta * 2.0
         + pv.reply_delta * 1.5 + pv.like_delta * 1.0)
        / NULLIF(pv.minutes_observed, 0)
        * (1 + (COALESCE(si.scraper_count, 1) - 1) * 0.5)
      , 2) AS composite_score,
      pv.minutes_old,
      pv.snapshot_count
    FROM post_velocity pv
    LEFT JOIN sightings si ON si.post_id = pv.post_id
  )
  SELECT * FROM scored ORDER BY composite_score DESC NULLS LAST LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION get_twitter_velocity_leaderboard(INTEGER, INTEGER) TO anon;

-- ============================================================
-- Hot Window RPC
-- Posts from watched accounts posted within max_age_minutes
-- with any engagement, ordered by reply_score (velocity × recency decay).
-- Falls back to engagement-over-age when only 1 snapshot available.
-- ============================================================

CREATE OR REPLACE FUNCTION get_twitter_hot_window(
  max_age_minutes INTEGER DEFAULT 10,
  result_limit    INTEGER DEFAULT 30
)
RETURNS TABLE (
  post_id          TEXT,
  author_username  TEXT,
  author_verified  BOOLEAN,
  text             TEXT,
  permalink        TEXT,
  created_at       BIGINT,
  media_type       TEXT,
  watch_username   TEXT,
  current_views    BIGINT,
  current_likes    INTEGER,
  current_replies  INTEGER,
  current_retweets INTEGER,
  current_quotes   INTEGER,
  minutes_old      NUMERIC,
  velocity         NUMERIC,
  hot_score        NUMERIC,
  snapshot_count   BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH post_data AS (
    SELECT
      p.post_id, p.author_username, p.author_verified, p.text, p.permalink,
      p.created_at, p.media_type, p.watch_username,
      p.view_count, p.like_count, p.reply_count, p.retweet_count, p.quote_count,
      CASE
        WHEN p.created_at > 0
          THEN EXTRACT(EPOCH FROM (NOW() - TO_TIMESTAMP(p.created_at))) / 60.0
        ELSE
          EXTRACT(EPOCH FROM (NOW() - p.first_seen_at)) / 60.0
      END AS age_minutes
    FROM twitter_posts p
    WHERE p.hidden = false
      AND p.is_promoted = false
      AND p.watch_username IS NOT NULL
      AND (
        (p.created_at > 0 AND TO_TIMESTAMP(p.created_at) > NOW() - (max_age_minutes || ' minutes')::INTERVAL)
        OR (p.created_at = 0 AND p.first_seen_at > NOW() - (max_age_minutes || ' minutes')::INTERVAL)
      )
      AND (p.like_count + p.reply_count + p.retweet_count) > 0
  ),
  snap_stats AS (
    SELECT
      s.post_id,
      COUNT(s.id)                                    AS snapshot_count,
      MAX(s.view_count)                              AS max_views,
      MAX(s.like_count)                              AS max_likes,
      MAX(s.reply_count)                             AS max_replies,
      MAX(s.retweet_count)                           AS max_retweets,
      MAX(s.quote_count)                             AS max_quotes,
      MAX(s.view_count)    - MIN(s.view_count)      AS view_delta,
      MAX(s.like_count)    - MIN(s.like_count)      AS like_delta,
      MAX(s.reply_count)   - MIN(s.reply_count)     AS reply_delta,
      MAX(s.retweet_count) - MIN(s.retweet_count)   AS retweet_delta,
      MAX(s.quote_count)   - MIN(s.quote_count)     AS quote_delta,
      EXTRACT(EPOCH FROM (MAX(s.observed_at) - MIN(s.observed_at))) / 60.0 AS minutes_observed
    FROM twitter_snapshots s
    JOIN post_data pd ON s.post_id = pd.post_id
    GROUP BY s.post_id
  ),
  scored AS (
    SELECT
      pd.post_id, pd.author_username, pd.author_verified, pd.text, pd.permalink,
      pd.created_at, pd.media_type, pd.watch_username,
      COALESCE(ss.max_views,    pd.view_count)::BIGINT    AS current_views,
      COALESCE(ss.max_likes,    pd.like_count)::INTEGER   AS current_likes,
      COALESCE(ss.max_replies,  pd.reply_count)::INTEGER  AS current_replies,
      COALESCE(ss.max_retweets, pd.retweet_count)::INTEGER AS current_retweets,
      COALESCE(ss.max_quotes,   pd.quote_count)::INTEGER  AS current_quotes,
      ROUND(pd.age_minutes::NUMERIC, 1) AS minutes_old,
      -- velocity: 0 if only 1 snapshot
      ROUND(
        CASE WHEN COALESCE(ss.snapshot_count, 0) >= 2 AND ss.minutes_observed > 0 THEN
          (ss.view_delta * 0.3 + ss.retweet_delta * 3.0 + ss.quote_delta * 2.0
           + ss.reply_delta * 1.5 + ss.like_delta * 1.0) / ss.minutes_observed
        ELSE 0 END
      ::NUMERIC, 2) AS velocity,
      -- hot_score: velocity × recency decay (half-value at 3 min)
      -- fallback when 1 snapshot: raw engagement / age, also decayed
      ROUND(
        CASE WHEN COALESCE(ss.snapshot_count, 0) >= 2 AND ss.minutes_observed > 0 THEN
          (ss.view_delta * 0.3 + ss.retweet_delta * 3.0 + ss.quote_delta * 2.0
           + ss.reply_delta * 1.5 + ss.like_delta * 1.0)
          / ss.minutes_observed
          / (1.0 + pd.age_minutes / 3.0)
        ELSE
          (pd.like_count * 1.0 + pd.reply_count * 1.5 + pd.retweet_count * 3.0)
          / GREATEST(pd.age_minutes, 1.0)
          / (1.0 + pd.age_minutes / 3.0)
        END
      ::NUMERIC, 3) AS hot_score,
      COALESCE(ss.snapshot_count, 1)::BIGINT AS snapshot_count
    FROM post_data pd
    LEFT JOIN snap_stats ss ON ss.post_id = pd.post_id
  )
  SELECT * FROM scored ORDER BY hot_score DESC LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION get_twitter_hot_window(INTEGER, INTEGER) TO anon;
