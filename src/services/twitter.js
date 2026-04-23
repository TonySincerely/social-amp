import { supabase } from '../lib/supabase'

const LOCAL = import.meta.env.VITE_LOCAL_API_URL ?? 'http://localhost:3001'

export async function probeTwitterServer() {
  try {
    const res = await fetch(`${LOCAL}/api/twitter/status`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

// ─── Scraper process control (local API only) ──────────────────────────────

export async function getTwitterStatus() {
  const res = await fetch(`${LOCAL}/api/twitter/status`)
  if (!res.ok) throw new Error('Server unreachable')
  return res.json() // { running, pid, mode }
}

export async function startTwitterScraper() {
  const res = await fetch(`${LOCAL}/api/twitter/start`, { method: 'POST' })
  return res.json()
}

export async function stopTwitterScraper() {
  const res = await fetch(`${LOCAL}/api/twitter/stop`, { method: 'POST' })
  return res.json()
}

export async function startTwitterAccountScrape() {
  const res = await fetch(`${LOCAL}/api/twitter/accounts`, { method: 'POST' })
  return res.json()
}

export async function startTwitterKeywordSearch(keyword) {
  const res = await fetch(`${LOCAL}/api/twitter/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  })
  return res.json()
}

export function createTwitterLogStream(onLine) {
  const es = new EventSource(`${LOCAL}/api/twitter/stream`)
  es.onmessage = (e) => {
    try { onLine(JSON.parse(e.data)) } catch { onLine(e.data) }
  }
  return es
}

// ─── Data queries (Supabase — works deployed and locally) ─────────────────

export async function getTwitterPosts({
  page = 1,
  limit = 20,
  author = '',
  minLikes = 0,
  timeWindow = 0,
  source = '',
  keyword = null,
  sortBy = 'scraped',
  mediaTypes = [],
  scraperIds = [],
} = {}) {
  const { data, error } = await supabase.rpc('get_twitter_posts', {
    p_page:               page,
    p_limit:              Math.min(limit, 50),
    p_author:             author || '',
    p_min_likes:          minLikes || 0,
    p_time_window_hours:  timeWindow || 0,
    p_source:             source || '',
    p_keyword:            keyword ?? null,
    p_sort_by:            sortBy || 'scraped',
    p_media_types:        mediaTypes?.length > 0 ? mediaTypes : null,
    p_scraper_ids:        scraperIds?.length > 0 ? scraperIds : null,
  })
  if (error) throw new Error(error.message)
  const total = Number(data?.[0]?.total_count ?? 0)
  return { posts: data ?? [], total, page, limit }
}

export async function getTwitterVelocity({ limit = 20, maxAge = 240 } = {}) {
  const { data, error } = await supabase.rpc('get_twitter_velocity_leaderboard', {
    max_age_minutes: maxAge,
    result_limit:    limit,
  })
  if (error) throw new Error(error.message)
  return { results: data ?? [] }
}

export async function getTwitterHotWindow({ maxAge = 10, limit = 30 } = {}) {
  const { data, error } = await supabase.rpc('get_twitter_hot_window', {
    max_age_minutes: maxAge,
    result_limit:    limit,
  })
  if (error) throw new Error(error.message)
  return { results: data ?? [] }
}
