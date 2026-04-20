import { supabase } from '../lib/supabase'

const LOCAL = import.meta.env.VITE_LOCAL_API_URL ?? ''

export const isLocalAvailable = () => Boolean(import.meta.env.VITE_LOCAL_API_URL)

// ─── Scraper process control (local API only) ──────────────────────────────

export async function getScraperStatus() {
  const res = await fetch(`${LOCAL}/api/threads/status`)
  if (!res.ok) throw new Error('Server unreachable')
  return res.json()
}

export async function startScraper() {
  const res = await fetch(`${LOCAL}/api/threads/start`, { method: 'POST' })
  return res.json()
}

export async function stopScraper() {
  const res = await fetch(`${LOCAL}/api/threads/stop`, { method: 'POST' })
  return res.json()
}

export async function startKeywordSearch(keyword) {
  const res = await fetch(`${LOCAL}/api/threads/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  })
  return res.json()
}

export function createLogStream(onLine) {
  const es = new EventSource(`${LOCAL}/api/threads/stream`)
  es.onmessage = (e) => {
    try { onLine(JSON.parse(e.data)) } catch { onLine(e.data) }
  }
  return es
}

// ─── Data queries (Supabase — works deployed and locally) ─────────────────

export async function getThreadsPosts({
  page = 1,
  limit = 20,
  author = '',
  minLikes = 0,
  timeWindow = 0,
  keyword = null,
  sortBy = 'scraped',
  mediaTypes = [],
} = {}) {
  const hasKeyword = keyword !== null && keyword !== undefined

  const { data, error } = await supabase.rpc('get_threads_posts', {
    p_page:               page,
    p_limit:              Math.min(limit, 50),
    p_author:             author || '',
    p_min_likes:          minLikes || 0,
    p_time_window_hours:  timeWindow || 0,
    p_has_keyword:        hasKeyword,
    p_keyword:            hasKeyword ? keyword : null,
    p_sort_by:            sortBy || 'scraped',
    p_media_types:        mediaTypes?.length > 0 ? mediaTypes : null,
  })

  if (error) throw new Error(error.message)
  const total = Number(data?.[0]?.total_count ?? 0)
  return { posts: data ?? [], total, page, limit }
}

export async function getThreadsVelocity({ limit = 20, maxAge = 120 } = {}) {
  const { data, error } = await supabase.rpc('get_velocity_leaderboard', {
    max_age_minutes: maxAge,
    result_limit:    limit,
  })
  if (error) throw new Error(error.message)
  return { results: data ?? [] }
}
