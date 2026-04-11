// ─── Upcoming Events — static recurring calendar ──────────────────────────────
// Regions: 'US' | 'UK' | 'CA' | 'AU' | 'global'
// Platforms match PlatformBadge keys: twitter, reddit, instagram, facebook, threads, web

function nthWeekday(year, month, weekday, n) {
  // month: 1-based. weekday: 0=Sun…6=Sat. n: 1=first, 2=second, -1=last
  if (n > 0) {
    const d = new Date(year, month - 1, 1)
    let count = 0
    while (d.getMonth() === month - 1) {
      if (d.getDay() === weekday) { count++; if (count === n) return d.getDate() }
      d.setDate(d.getDate() + 1)
    }
  } else {
    const d = new Date(year, month, 0)
    while (d.getMonth() === month - 1) {
      if (d.getDay() === weekday) return d.getDate()
      d.setDate(d.getDate() - 1)
    }
  }
  return 1
}

function getEventDate(event, year) {
  if (event.variable) {
    const { month, weekday, n, dayOffset = 0 } = event.variable
    return new Date(year, month - 1, nthWeekday(year, month, weekday, n) + dayOffset)
  }
  return new Date(year, event.month - 1, event.day)
}

// ─── Event definitions ────────────────────────────────────────────────────────

const EVENTS = [
  // ── Q1 ───────────────────────────────────────────────────────────────────────
  {
    name: "New Year's Day",
    month: 1, day: 1,
    regions: ['global'],
    platforms: ['instagram', 'threads', 'twitter'],
    leadWeeks: 1,
    angleHint: 'Goals, fresh starts, word of the year',
  },
  {
    name: "Valentine's Day",
    month: 2, day: 14,
    regions: ['global'],
    platforms: ['instagram', 'facebook', 'threads'],
    leadWeeks: 4,
    angleHint: 'Gift ideas, love stories, community appreciation',
  },
  {
    name: "International Women's Day",
    month: 3, day: 8,
    regions: ['global'],
    platforms: ['instagram', 'twitter', 'reddit'],
    leadWeeks: 3,
    angleHint: 'Celebrate women in your industry, founder stories, amplify voices',
  },
  {
    name: "St. Patrick's Day",
    month: 3, day: 17,
    regions: ['US', 'UK', 'CA', 'AU'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Luck themes, green aesthetics, community fun',
  },
  // ── Q2 ───────────────────────────────────────────────────────────────────────
  {
    name: 'Earth Day',
    month: 4, day: 22,
    regions: ['global'],
    platforms: ['instagram', 'twitter', 'reddit'],
    leadWeeks: 3,
    angleHint: 'Sustainability angles, behind-the-scenes practices, impact stories',
  },
  {
    name: 'Mental Health Awareness Month',
    month: 5, day: 1,
    regions: ['global'],
    platforms: ['instagram', 'threads', 'reddit'],
    leadWeeks: 3,
    angleHint: 'Authenticity, burnout, work-life balance, community support',
    span: 'month',
  },
  {
    name: "Mother's Day",
    variable: { month: 5, weekday: 0, n: 2 },
    regions: ['US', 'CA', 'AU'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 4,
    angleHint: 'Appreciation stories, gift guides, founder or team spotlights',
  },
  {
    name: 'Memorial Day (US)',
    variable: { month: 5, weekday: 1, n: -1 },
    regions: ['US'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Gratitude, reflection, summer kick-off content',
  },
  {
    name: 'Pride Month',
    month: 6, day: 1,
    regions: ['global'],
    platforms: ['instagram', 'twitter', 'threads'],
    leadWeeks: 4,
    angleHint: 'Inclusion, community celebration, authentic brand values',
    span: 'month',
  },
  {
    name: "Father's Day",
    variable: { month: 6, weekday: 0, n: 3 },
    regions: ['US', 'CA', 'UK'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 3,
    angleHint: 'Appreciation stories, humor, outdoors, gift content',
  },
  // ── Q3 ───────────────────────────────────────────────────────────────────────
  {
    name: 'Independence Day (US)',
    month: 7, day: 4,
    regions: ['US'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Freedom themes, celebration, summer vibes',
  },
  {
    name: 'Back to School',
    month: 8, day: 15,
    regions: ['US', 'CA'],
    platforms: ['instagram', 'facebook', 'reddit'],
    leadWeeks: 4,
    angleHint: 'Productivity, new routines, fresh starts, organisational tips',
  },
  {
    name: 'Labor Day (US)',
    variable: { month: 9, weekday: 1, n: 1 },
    regions: ['US'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Work appreciation, end of summer, team culture',
  },
  // ── Q4 ───────────────────────────────────────────────────────────────────────
  {
    name: 'World Mental Health Day',
    month: 10, day: 10,
    regions: ['global'],
    platforms: ['instagram', 'twitter', 'reddit'],
    leadWeeks: 2,
    angleHint: 'Wellbeing, openness, destigmatising, community solidarity',
  },
  {
    name: 'Halloween',
    month: 10, day: 31,
    regions: ['US', 'CA', 'UK', 'AU'],
    platforms: ['instagram', 'threads', 'facebook'],
    leadWeeks: 3,
    angleHint: 'Fun, creativity, themed content, behind-the-scenes costume reveals',
  },
  {
    name: 'Thanksgiving (CA)',
    variable: { month: 10, weekday: 1, n: 2 },
    regions: ['CA'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Gratitude, community, harvest, team appreciation',
  },
  {
    name: 'Veterans Day (US)',
    month: 11, day: 11,
    regions: ['US'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Gratitude, service, community recognition',
  },
  {
    name: 'Thanksgiving (US)',
    variable: { month: 11, weekday: 4, n: 4 },
    regions: ['US'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Gratitude, year-in-review, team appreciation, giving back',
  },
  {
    name: 'Black Friday',
    variable: { month: 11, weekday: 4, n: 4, dayOffset: 1 },
    regions: ['US', 'UK', 'CA', 'AU'],
    platforms: ['instagram', 'twitter', 'facebook'],
    leadWeeks: 3,
    angleHint: 'Deals, launches, countdown content, product spotlights',
  },
  {
    name: 'Small Business Saturday',
    variable: { month: 11, weekday: 4, n: 4, dayOffset: 2 },
    regions: ['US'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 2,
    angleHint: 'Community support, local love, behind-the-scenes',
  },
  {
    name: 'Cyber Monday',
    variable: { month: 11, weekday: 4, n: 4, dayOffset: 4 },
    regions: ['US', 'UK', 'CA'],
    platforms: ['instagram', 'twitter', 'facebook'],
    leadWeeks: 3,
    angleHint: 'Digital deals, product demos, limited-time angles',
  },
  {
    name: 'Christmas',
    month: 12, day: 25,
    regions: ['global'],
    platforms: ['instagram', 'facebook'],
    leadWeeks: 4,
    angleHint: 'Year wrap-up, gratitude, gift content, team moments',
  },
  {
    name: "New Year's Eve",
    month: 12, day: 31,
    regions: ['global'],
    platforms: ['instagram', 'twitter', 'threads'],
    leadWeeks: 2,
    angleHint: 'Reflection, highlights reel, goals preview, gratitude',
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns events whose next occurrence falls within `weeksAhead` weeks.
 * Filters by `region` ('US' | 'UK' | 'CA' | 'AU' | 'global').
 * Each returned event includes: date (Date), dateStr (string), daysUntil (number).
 */
export function getUpcomingEvents(region = 'US', weeksAhead = 6) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + weeksAhead * 7)

  const thisYear = today.getFullYear()
  const grace = new Date(today)
  grace.setDate(grace.getDate() - 2) // allow 2-day grace before rolling to next year

  const result = []

  for (const event of EVENTS) {
    if (!event.regions.includes(region) && !event.regions.includes('global')) continue

    let date = getEventDate(event, thisYear)
    if (date < grace) date = getEventDate(event, thisYear + 1)
    if (date > cutoff) continue

    const daysUntil = Math.round((date - today) / 86400000)

    result.push({
      ...event,
      date,
      dateStr: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      daysUntil,
    })
  }

  return result.sort((a, b) => a.daysUntil - b.daysUntil)
}
