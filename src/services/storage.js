import { openDB } from 'idb'

const DB_NAME = 'socialamp'
const DB_VERSION = 3

let dbPromise = null

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Products
        if (!db.objectStoreNames.contains('products')) {
          const s = db.createObjectStore('products', { keyPath: 'id' })
          s.createIndex('createdAt', 'createdAt')
        }
        // Accounts
        if (!db.objectStoreNames.contains('accounts')) {
          const s = db.createObjectStore('accounts', { keyPath: 'id' })
          s.createIndex('platform', 'platform')
          s.createIndex('createdAt', 'createdAt')
        }
        // Calendar posts
        if (!db.objectStoreNames.contains('calendarPosts')) {
          const s = db.createObjectStore('calendarPosts', { keyPath: 'id' })
          s.createIndex('monthKey', 'monthKey')
          s.createIndex('productId', 'productId')
          s.createIndex('date', 'date')
        }
        // Trend snapshots (v2)
        if (!db.objectStoreNames.contains('trendSnapshots')) {
          const s = db.createObjectStore('trendSnapshots', { keyPath: 'id' })
          s.createIndex('fetchedAt', 'fetchedAt')
        }
        // Platform configs (v3)
        if (!db.objectStoreNames.contains('platformConfigs')) {
          db.createObjectStore('platformConfigs', { keyPath: 'platform' })
        }
      },
    })
  }
  return dbPromise
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function saveProduct(product) {
  const db = await getDB()
  const data = {
    ...product,
    id: product.id || crypto.randomUUID(),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.put('products', data)
  return data
}

export async function getAllProducts() {
  const db = await getDB()
  return db.getAll('products')
}

export async function getProduct(id) {
  const db = await getDB()
  return db.get('products', id)
}

export async function updateProduct(id, updates) {
  const db = await getDB()
  const existing = await db.get('products', id)
  if (!existing) throw new Error(`Product ${id} not found`)
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
  await db.put('products', updated)
  return updated
}

export async function deleteProduct(id) {
  const db = await getDB()
  await db.delete('products', id)
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function saveAccount(account) {
  const db = await getDB()
  const data = {
    ...account,
    id: account.id || crypto.randomUUID(),
    createdAt: account.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.put('accounts', data)
  return data
}

export async function getAllAccounts() {
  const db = await getDB()
  return db.getAll('accounts')
}

export async function getAccount(id) {
  const db = await getDB()
  return db.get('accounts', id)
}

export async function updateAccount(id, updates) {
  const db = await getDB()
  const existing = await db.get('accounts', id)
  if (!existing) throw new Error(`Account ${id} not found`)
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
  await db.put('accounts', updated)
  return updated
}

export async function deleteAccount(id) {
  const db = await getDB()
  await db.delete('accounts', id)
}

// ─── Calendar Posts ───────────────────────────────────────────────────────────

export async function saveCalendarPost(post) {
  const db = await getDB()
  const data = {
    ...post,
    id: post.id || crypto.randomUUID(),
    createdAt: post.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.put('calendarPosts', data)
  return data
}

export async function getCalendarPostsByMonth(monthKey) {
  const db = await getDB()
  return db.getAllFromIndex('calendarPosts', 'monthKey', monthKey)
}

export async function getAllCalendarPosts() {
  const db = await getDB()
  return db.getAll('calendarPosts')
}

export async function updateCalendarPost(id, updates) {
  const db = await getDB()
  const existing = await db.get('calendarPosts', id)
  if (!existing) throw new Error(`Post ${id} not found`)
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
  await db.put('calendarPosts', updated)
  return updated
}

export async function deleteCalendarPost(id) {
  const db = await getDB()
  await db.delete('calendarPosts', id)
}

// ─── Trend Snapshots ──────────────────────────────────────────────────────────

export async function saveTrendSnapshot(snapshot) {
  const db = await getDB()
  const data = {
    ...snapshot,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  await db.put('trendSnapshots', data)
  // Prune: keep only 5 most recent
  const all = await db.getAll('trendSnapshots')
  if (all.length > 5) {
    const sorted = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    for (const old of sorted.slice(5)) {
      await db.delete('trendSnapshots', old.id)
    }
  }
  return data
}

export async function getAllTrendSnapshots() {
  const db = await getDB()
  return db.getAll('trendSnapshots')
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
  instagram: { charLimit: 2200, wordLimit: null, hashtagLimit: 30, linkInPost: false, videoMaxSec: 60 },
  x:         { charLimit: 280,  wordLimit: null, hashtagLimit: 2,  linkInPost: true,  videoMaxSec: 140 },
  threads:   { charLimit: 500,  wordLimit: null, hashtagLimit: null, linkInPost: true, videoMaxSec: 300 },
  reddit:    { charLimit: null, wordLimit: null, hashtagLimit: null, linkInPost: true,  videoMaxSec: null },
  facebook:  { charLimit: null, wordLimit: null, hashtagLimit: null, linkInPost: true,  videoMaxSec: null },
  pinterest: { charLimit: 500,  wordLimit: null, hashtagLimit: 20, linkInPost: true,  videoMaxSec: null },
}

export async function getAllPlatformConfigs() {
  const db = await getDB()
  return db.getAll('platformConfigs')
}

export async function getPlatformConfig(platform) {
  const db = await getDB()
  return db.get('platformConfigs', platform)
}

export async function savePlatformConfig(config) {
  const db = await getDB()
  const data = { ...config, updatedAt: new Date().toISOString() }
  await db.put('platformConfigs', data)
  return data
}

export async function seedPlatformDefaults() {
  const db = await getDB()
  for (const [platform, limits] of Object.entries(PLATFORM_DEFAULTS)) {
    const existing = await db.get('platformConfigs', platform)
    if (!existing) {
      await db.put('platformConfigs', {
        platform,
        limits: { ...limits },
        strategies: [],
        selectedStrategyId: null,
        updatedAt: new Date().toISOString(),
      })
    }
  }
}
