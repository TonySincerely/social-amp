import { supabase } from '../lib/supabase'

// ─── Products ─────────────────────────────────────────────────────────────────

export async function saveProduct(product) {
  const data = {
    ...product,
    id: product.id || crypto.randomUUID(),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('products').upsert({ id: data.id, created_at: data.createdAt, data })
  if (error) throw error
  return data
}

export async function getAllProducts() {
  const { data, error } = await supabase.from('products').select('data').order('created_at')
  if (error) throw error
  return data.map(r => r.data)
}

export async function getProduct(id) {
  const { data, error } = await supabase.from('products').select('data').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

export async function updateProduct(id, updates) {
  const { data: row, error: fetchError } = await supabase.from('products').select('data').eq('id', id).single()
  if (fetchError) throw fetchError
  const updated = { ...row.data, ...updates, updatedAt: new Date().toISOString() }
  const { error } = await supabase.from('products').update({ data: updated }).eq('id', id)
  if (error) throw error
  return updated
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function saveAccount(account) {
  const data = {
    ...account,
    id: account.id || crypto.randomUUID(),
    createdAt: account.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('accounts').upsert({ id: data.id, created_at: data.createdAt, data })
  if (error) throw error
  return data
}

export async function getAllAccounts() {
  const { data, error } = await supabase.from('accounts').select('data').order('created_at')
  if (error) throw error
  return data.map(r => r.data)
}

export async function getAccount(id) {
  const { data, error } = await supabase.from('accounts').select('data').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

export async function updateAccount(id, updates) {
  const { data: row, error: fetchError } = await supabase.from('accounts').select('data').eq('id', id).single()
  if (fetchError) throw fetchError
  const updated = { ...row.data, ...updates, updatedAt: new Date().toISOString() }
  const { error } = await supabase.from('accounts').update({ data: updated }).eq('id', id)
  if (error) throw error
  return updated
}

export async function deleteAccount(id) {
  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) throw error
}

// ─── Calendar Posts ───────────────────────────────────────────────────────────

export async function saveCalendarPost(post) {
  const data = {
    ...post,
    id: post.id || crypto.randomUUID(),
    createdAt: post.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('calendar_posts').upsert({
    id: data.id,
    month_key: data.monthKey,
    created_at: data.createdAt,
    data,
  })
  if (error) throw error
  return data
}

export async function getCalendarPostsByMonth(monthKey) {
  const { data, error } = await supabase.from('calendar_posts').select('data').eq('month_key', monthKey)
  if (error) throw error
  return data.map(r => r.data)
}

export async function getAllCalendarPosts() {
  const { data, error } = await supabase.from('calendar_posts').select('data')
  if (error) throw error
  return data.map(r => r.data)
}

export async function updateCalendarPost(id, updates) {
  const { data: row, error: fetchError } = await supabase.from('calendar_posts').select('data').eq('id', id).single()
  if (fetchError) throw fetchError
  const updated = { ...row.data, ...updates, updatedAt: new Date().toISOString() }
  const { error } = await supabase.from('calendar_posts').update({ data: updated }).eq('id', id)
  if (error) throw error
  return updated
}

export async function deleteCalendarPost(id) {
  const { error } = await supabase.from('calendar_posts').delete().eq('id', id)
  if (error) throw error
}

// ─── Trend Snapshots ──────────────────────────────────────────────────────────

export async function saveTrendSnapshot(snapshot) {
  const data = {
    ...snapshot,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('trend_snapshots').insert({ id: data.id, created_at: data.createdAt, data })
  if (error) throw error
  // Prune: keep only 5 most recent
  const { data: all } = await supabase.from('trend_snapshots').select('id').order('created_at', { ascending: false })
  if (all && all.length > 5) {
    const ids = all.slice(5).map(r => r.id)
    await supabase.from('trend_snapshots').delete().in('id', ids)
  }
  return data
}

export async function getAllTrendSnapshots() {
  const { data, error } = await supabase.from('trend_snapshots').select('data').order('created_at', { ascending: false })
  if (error) throw error
  return data.map(r => r.data)
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

export function setLocalData(key, value) {
  localStorage.setItem(`socialamp_${key}`, JSON.stringify(value))
}

export function getLocalData(key, defaultValue = null) {
  const stored = localStorage.getItem(`socialamp_${key}`)
  if (stored) {
    try { return JSON.parse(stored) } catch { return defaultValue }
  }
  return defaultValue
}

// ─── Platform Configs ─────────────────────────────────────────────────────────

export const PLATFORM_DEFAULTS = {
  instagram: { charLimit: 2200, wordLimit: null, hashtagLimit: 30,   linkInPost: false, videoMaxSec: 60 },
  x:         { charLimit: 280,  wordLimit: null, hashtagLimit: 2,    linkInPost: true,  videoMaxSec: 140 },
  threads:   { charLimit: 500,  wordLimit: null, hashtagLimit: null, linkInPost: true,  videoMaxSec: 300 },
  reddit:    { charLimit: null, wordLimit: null, hashtagLimit: null, linkInPost: true,  videoMaxSec: null },
  facebook:  { charLimit: null, wordLimit: null, hashtagLimit: null, linkInPost: true,  videoMaxSec: null },
  pinterest: { charLimit: 500,  wordLimit: null, hashtagLimit: 20,   linkInPost: true,  videoMaxSec: null },
}

export async function getAllPlatformConfigs() {
  const { data, error } = await supabase.from('platform_configs').select('data')
  if (error) throw error
  return data.map(r => r.data)
}

export async function getPlatformConfig(platform) {
  const { data, error } = await supabase.from('platform_configs').select('data').eq('platform', platform).maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

export async function savePlatformConfig(config) {
  const data = { ...config, updatedAt: new Date().toISOString() }
  const { error } = await supabase.from('platform_configs').upsert({ platform: data.platform, data })
  if (error) throw error
  return data
}

export async function seedPlatformDefaults() {
  for (const [platform, limits] of Object.entries(PLATFORM_DEFAULTS)) {
    const existing = await getPlatformConfig(platform)
    if (!existing) {
      const data = { platform, limits: { ...limits }, strategies: [], selectedStrategyId: null, updatedAt: new Date().toISOString() }
      await supabase.from('platform_configs').insert({ platform, data })
    }
  }
}
