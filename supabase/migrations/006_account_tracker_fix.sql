-- ============================================================
-- 006: Fix get_twitter_hot_window to match by author_username
-- instead of watch_username IS NOT NULL, so posts scraped via
-- home feed or keyword also appear when the author is watched.
-- Also removes the engagement > 0 gate so very fresh posts show
-- immediately before anyone has engaged with them.
-- Run once in the Supabase SQL editor.
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
      -- Match any post whose author is in the watch list, regardless of source
      AND p.author_username IN (SELECT wa.username FROM twitter_watch_accounts wa)
      AND (
        (p.created_at > 0 AND TO_TIMESTAMP(p.created_at) > NOW() - (max_age_minutes || ' minutes')::INTERVAL)
        OR (p.created_at = 0 AND p.first_seen_at > NOW() - (max_age_minutes || ' minutes')::INTERVAL)
      )
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
      ROUND(
        CASE WHEN COALESCE(ss.snapshot_count, 0) >= 2 AND ss.minutes_observed > 0 THEN
          (ss.view_delta * 0.3 + ss.retweet_delta * 3.0 + ss.quote_delta * 2.0
           + ss.reply_delta * 1.5 + ss.like_delta * 1.0) / ss.minutes_observed
        ELSE 0 END
      ::NUMERIC, 2) AS velocity,
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
