import { supabase } from '../lib/supabase'

const LOCAL = import.meta.env.VITE_LOCAL_API_URL ?? 'http://localhost:3001'

// ─── Local scraper server — profile routes ─────────────────────────────────

export async function probeBoosterServer() {
  try {
    const res = await fetch(`${LOCAL}/api/booster/profile/status`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export async function getProfileScrapeStatus() {
  const res = await fetch(`${LOCAL}/api/booster/profile/status`)
  if (!res.ok) throw new Error('Server unreachable')
  return res.json()
}

export async function startProfileScrape(handle, postsTarget = 50, repliesTarget = 0) {
  const res = await fetch(`${LOCAL}/api/booster/profile/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, postsTarget, repliesTarget }),
  })
  return res.json()
}

export async function stopProfileScrape() {
  const res = await fetch(`${LOCAL}/api/booster/profile/stop`, { method: 'POST' })
  return res.json()
}

export function createProfileLogStream(onLine) {
  const es = new EventSource(`${LOCAL}/api/booster/profile/stream`)
  es.onmessage = (e) => {
    try { onLine(JSON.parse(e.data)) } catch { onLine(e.data) }
  }
  return es
}

export async function getApiFetchStatus() {
  const res = await fetch(`${LOCAL}/api/booster/api-fetch/status`)
  if (!res.ok) throw new Error('Server unreachable')
  return res.json()
}

export async function startApiFetch(handle, token, limit = 200) {
  const res = await fetch(`${LOCAL}/api/booster/api-fetch/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, token, limit }),
  })
  return res.json()
}

export async function stopApiFetch() {
  const res = await fetch(`${LOCAL}/api/booster/api-fetch/stop`, { method: 'POST' })
  return res.json()
}

export function createApiFetchStream(onLine) {
  const es = new EventSource(`${LOCAL}/api/booster/api-fetch/stream`)
  es.onmessage = (e) => {
    try { onLine(JSON.parse(e.data)) } catch { onLine(e.data) }
  }
  return es
}

// ─── Supabase direct save (for client-side paths B, C, E) ─────────────────

export async function saveTrackerPosts(handle, posts, source) {
  const now = new Date().toISOString()

  const { data: row } = await supabase
    .from('booster_trackers')
    .select('tracker')
    .eq('handle', handle)
    .maybeSingle()

  const existing = row?.tracker?.posts ?? []
  const byId = new Map(existing.map(p => [p.id, p]))

  let inserted = 0
  let updated  = 0

  for (const p of posts) {
    const id = p.id || p.post_id
    if (!id) continue
    if (byId.has(id)) {
      const ex = byId.get(id)
      if (p.metrics) ex.metrics = { ...ex.metrics, ...p.metrics }
      if (p.text && !ex.text) ex.text = p.text
      ex.snapshots = [...(ex.snapshots ?? []), { captured_at: now, ...p.metrics }]
      updated++
    } else {
      byId.set(id, {
        id,
        text:           p.text ?? null,
        created_at:     p.created_at ?? null,
        permalink:      p.permalink ?? null,
        media_type:     p.media_type ?? 'TEXT',
        is_reply_post:  p.is_reply_post ?? false,
        content_type:   null,
        topics:         [],
        hook_type:      null,
        ending_type:    null,
        emotional_arc:  null,
        word_count:     p.text ? p.text.split(/\s+/).filter(Boolean).length : null,
        paragraph_count: p.text ? p.text.split(/\n+/).filter(Boolean).length : null,
        posting_time_slot: null,
        algorithm_signals: null,
        psychology_signals: null,
        metrics:        p.metrics ?? { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 },
        performance_windows: { '24h': null, '72h': null, '7d': null },
        snapshots:      p.metrics ? [{ captured_at: now, ...p.metrics }] : [],
        prediction_snapshot: null,
        review_state:   null,
        comments:       p.comments ?? [],
        author_replies: [],
        my_replies:     false,
        source:         { import_path: source, data_completeness: p.metrics ? 'metrics' : 'text-only' },
      })
      inserted++
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })

  const tracker = {
    account:      { handle, source, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    posts:        merged,
    last_updated: now,
  }

  const { error } = await supabase
    .from('booster_trackers')
    .upsert({ handle, tracker, updated_at: now }, { onConflict: 'handle' })
  if (error) throw error

  return { inserted, updated, total: merged.length }
}

export async function saveStyleGuide(handle, markdown) {
  const { error } = await supabase
    .from('booster_trackers')
    .update({ style_guide: markdown, updated_at: new Date().toISOString() })
    .eq('handle', handle)
  if (error) throw error
}

export async function saveBrandVoice(handle, markdown) {
  const { error } = await supabase
    .from('booster_trackers')
    .update({ brand_voice: markdown, updated_at: new Date().toISOString() })
    .eq('handle', handle)
  if (error) throw error
}

export async function saveConceptLibrary(handle, markdown) {
  const { error } = await supabase
    .from('booster_trackers')
    .update({ concept_library: markdown, updated_at: new Date().toISOString() })
    .eq('handle', handle)
  if (error) throw error
}

export async function getAllTrackers() {
  const { data, error } = await supabase
    .from('booster_trackers')
    .select('id, handle, tracker, style_guide, concept_library, brand_voice, config, created_at, updated_at')
    .order('created_at')
  if (error) throw error
  return data
}

export async function getTracker(handle) {
  const { data, error } = await supabase
    .from('booster_trackers')
    .select('*')
    .eq('handle', handle)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createTracker(handle) {
  const { data, error } = await supabase
    .from('booster_trackers')
    .insert({ handle })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function saveTracker(handle, updates) {
  const { data, error } = await supabase
    .from('booster_trackers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('handle', handle)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function savePostReviewState(handle, postId, reviewState) {
  const { data: row, error: readErr } = await supabase
    .from('booster_trackers')
    .select('tracker')
    .eq('handle', handle)
    .maybeSingle()
  if (readErr) throw readErr

  const tracker = row?.tracker
  if (!tracker || !Array.isArray(tracker.posts)) throw new Error('Tracker not found')

  const idx = tracker.posts.findIndex(p => p.id === postId)
  if (idx === -1) throw new Error('Post not found in tracker')

  tracker.posts[idx].review_state = {
    ...(tracker.posts[idx].review_state ?? {}),
    ...reviewState,
    last_reviewed_at: new Date().toISOString(),
  }
  tracker.last_updated = new Date().toISOString()

  const { error } = await supabase
    .from('booster_trackers')
    .update({ tracker, updated_at: new Date().toISOString() })
    .eq('handle', handle)
  if (error) throw error
}

export async function deleteTracker(handle) {
  const { error } = await supabase
    .from('booster_trackers')
    .delete()
    .eq('handle', handle)
  if (error) throw error
}
