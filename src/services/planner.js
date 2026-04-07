/**
 * Planner service — pure scheduling logic, no side effects.
 * All functions are synchronous and take plain data as input.
 */

// ─── Best-practice data ────────────────────────────────────────────────────────

// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
export const PLATFORM_BEST_DAYS = {
  instagram: [2, 3, 5],       // Tue, Wed, Fri
  threads:   [2, 3, 5],       // Tue, Wed, Fri
  x:         [1, 2, 3, 4, 5], // Mon–Fri, Wed/Thu best → ordered by preference
  facebook:  [2, 3, 4],       // Tue, Wed, Thu
  reddit:    [1, 2],           // Mon, Tue
  pinterest: [6, 0, 5],       // Sat, Sun, Fri (longer post life)
}

// Primary times for each platform (HH:MM, 24h, in user's local timezone)
export const PLATFORM_BEST_TIMES = {
  instagram: ['11:00', '14:00', '17:00'],
  threads:   ['11:00', '15:00', '18:00'],
  x:         ['09:00', '12:00', '15:00', '18:00'],
  facebook:  ['13:00', '15:00'],
  reddit:    ['10:00', '13:00'],
  pinterest: ['20:00', '21:00', '19:00'],
}

export const PLATFORM_FREQ_RANGE = {
  instagram: { min: 3, max: 5, rec: '3–5' },
  threads:   { min: 3, max: 5, rec: '3–5' },
  x:         { min: 3, max: 7, rec: '3–7' },
  facebook:  { min: 1, max: 3, rec: '1–3' },
  reddit:    { min: 2, max: 4, rec: '2–4' },
  pinterest: { min: 3, max: 7, rec: '3–7' },
}

// Day distribution per postsPerWeek (indices into PLATFORM_BEST_DAYS)
const WEEK_DISTRIBUTION = {
  1: [0],           // best day only
  2: [0, 2],        // 1st and 3rd best
  3: [0, 1, 2],     // 1st, 2nd, 3rd best
  4: [0, 1, 2, 3],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
}

// Deterministic project colors (cycles if > 5 products)
export const PRODUCT_COLORS = [
  { bg: '#6b3fd4', light: '#f0ebfd' },
  { bg: '#1d6b63', light: '#eaf4f3' },
  { bg: '#b8863a', light: '#fdf5e6' },
  { bg: '#2257d4', light: '#ebf0fd' },
  { bg: '#d94535', light: '#fdf0ee' },
]

export function getProductColor(index) {
  return PRODUCT_COLORS[index % PRODUCT_COLORS.length]
}

// ─── Core scheduling function ──────────────────────────────────────────────────

/**
 * Generate a proposed schedule for a month.
 *
 * @param {object} params
 * @param {Array}  params.products       - full product objects (with trendBrief)
 * @param {number} params.year
 * @param {number} params.month          - 0-indexed
 * @param {object} params.frequency      - { [productId]: { [platform]: { postsPerWeek, accountId, accountHandle } } }
 * @param {Array}  params.existingPosts  - existing calendarPosts for this month
 *
 * @returns {{ slots: Array, blockedCount: number }}
 */
export function generateSchedule({ products, year, month, frequency, existingPosts }) {
  const slots = []
  let blockedCount = 0

  // Track claimed slots: Set of "accountId|YYYY-MM-DD" for collision detection
  // Pre-populate from existing posts
  const claimed = new Set(
    existingPosts.map(p => `${p.accountId}|${p.date}`)
  )

  const daysInMonth = new Date(year, month + 1, 0).getDate()

  for (const product of products) {
    const productFreq = frequency[product.id]
    if (!productFreq) continue

    // Build angle pool from trend brief (round-robin)
    const angles = product.trendBrief?.angles || []
    let angleIndex = 0

    for (const [platform, config] of Object.entries(productFreq)) {
      const { postsPerWeek, accountId, accountHandle } = config
      if (!postsPerWeek || !accountId) continue

      const bestDays = PLATFORM_BEST_DAYS[platform] || [1, 3, 5]
      const bestTimes = PLATFORM_BEST_TIMES[platform] || ['12:00']
      const distribution = WEEK_DISTRIBUTION[Math.min(postsPerWeek, 7)] || WEEK_DISTRIBUTION[3]

      // Pick the target days-of-week for this frequency
      const targetDaysOfWeek = distribution.map(i => bestDays[i % bestDays.length])
      // Deduplicate (in case best days list shorter than distribution)
      const uniqueTargetDays = [...new Set(targetDaysOfWeek)]

      // Collect all matching dates in the month, then pick one per week
      // to keep distribution even across partial months
      const weekSlots = {} // weekNumber → [candidateDays]

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d)
        const dayOfWeek = date.getDay()
        if (uniqueTargetDays.includes(dayOfWeek)) {
          const weekNum = getWeekOfMonth(year, month, d)
          if (!weekSlots[weekNum]) weekSlots[weekNum] = []
          weekSlots[weekNum].push(d)
        }
      }

      // For each week, take up to postsPerWeek slots
      const targetDates = []
      for (const week of Object.values(weekSlots)) {
        targetDates.push(...week.slice(0, postsPerWeek))
      }

      // Place slots, respecting collision rules
      for (let i = 0; i < targetDates.length; i++) {
        const day = targetDates[i]
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const claimKey = `${accountId}|${dateStr}`

        if (claimed.has(claimKey)) {
          blockedCount++
          continue
        }

        // Pick a time (cycle through best times)
        const time = bestTimes[i % bestTimes.length]
        const angle = angles.length > 0 ? angles[angleIndex % angles.length] : ''
        angleIndex++

        claimed.add(claimKey)
        slots.push({
          id: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          accountId,
          accountHandle,
          platform,
          date: dateStr,
          time,
          monthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
          angle,
          status: 'draft',
          copy: null,
        })
      }
    }
  }

  // Sort by date then time
  slots.sort((a, b) => {
    const da = a.date + 'T' + a.time
    const db = b.date + 'T' + b.time
    return da < db ? -1 : da > db ? 1 : 0
  })

  return { slots, blockedCount }
}

// ─── Collision detection ───────────────────────────────────────────────────────

/**
 * Returns slots that share the same accountId + date within the proposed set.
 * Returns a Set of "accountId|date" keys.
 */
export function findInternalCollisions(slots) {
  const seen = new Set()
  const collisions = new Set()
  for (const slot of slots) {
    const key = `${slot.accountId}|${slot.date}`
    if (seen.has(key)) collisions.add(key)
    else seen.add(key)
  }
  return collisions
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekOfMonth(year, month, day) {
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  return Math.floor((day + firstDayOfMonth - 1) / 7)
}

export function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export function formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}
