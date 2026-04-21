-- Add 'top' sort option (by like_count DESC) to get_threads_posts.
-- Run in the Supabase SQL editor.

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
    CASE WHEN p_sort_by = 'top'    THEN f.like_count END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'posted' AND f.created_at > 0 THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort_by = 'posted' THEN f.created_at END DESC NULLS LAST,
    f.first_seen_at DESC
  LIMIT p_limit OFFSET (p_page - 1) * p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_threads_posts(INTEGER, INTEGER, TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT[], TEXT[]) TO anon;
