import { useState, useEffect, useRef, useCallback } from 'react'
import {
  probeLocalServer,
  getScraperStatus,
  startScraper,
  stopScraper,
  startKeywordSearch,
  createLogStream,
  getThreadsPosts,
  getThreadsVelocity,
} from '../../services/threads'
import {
  getKeywords,
  addKeyword as addKeywordToDb,
  deleteKeyword as deleteKeywordFromDb,
  hidePost as hidePostInDb,
} from '../../services/storage'

const TIME_WINDOWS = [
  { label: 'Live · 6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '48h', value: 48 },
  { label: 'All', value: 0 },
]

const MEDIA_TYPES = [
  { label: 'Img', value: 'IMAGE' },
  { label: 'Vid', value: 'VIDEO' },
  { label: 'Carousel', value: 'CAROUSEL' },
  { label: 'Text', value: 'TEXT' },
]

const SORT_OPTIONS = [
  { label: 'Recent', value: 'scraped', title: 'Sort by scrape time' },
  { label: 'Posted', value: 'posted', title: 'Sort by publish time' },
  { label: 'Top', value: 'top', title: 'Sort by most likes' },
]

const FREQUENCIES = [
  { label: 'Once', value: 0 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
]

function timeAgo(isoStr) {
  const mins = Math.floor((Date.now() - new Date(isoStr)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatScrapedAt(isoStr) {
  const d = new Date(isoStr)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} ${time}`
}

function ageClass(hours) {
  if (hours < 6) return 'sc-age-live'
  if (hours < 24) return 'sc-age-day'
  return 'sc-age-old'
}

function postAgeClass(post) {
  const ms = post.created_at > 0
    ? post.created_at * 1000
    : new Date(post.first_seen_at).getTime()
  return ageClass((Date.now() - ms) / 3600000)
}

function velocityAgeClass(v) {
  const hours = v.created_at > 0
    ? (Date.now() - v.created_at * 1000) / 3600000
    : v.minutes_old / 60
  return ageClass(hours)
}

function formatAge(minutes) {
  if (minutes < 60) return `${Math.round(minutes)}m old`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m old` : `${h}h old`
}

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatCountdown(seconds) {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${seconds}s`
}

export function ThreadsScraper() {
  const [localAvailable, setLocalAvailable] = useState(null)
  const [serverReachable, setServerReachable] = useState(null)
  const [status, setStatus] = useState({ running: false, pid: null, keyword: null })
  const [innerTab, setInnerTab] = useState('feed')
  const [velocity, setVelocity] = useState([])
  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    author: '', minLikes: 0, timeWindow: 24, sortBy: 'scraped', mediaTypes: [], scraperIds: [],
  })
  const [availableScrapers, setAvailableScrapers] = useState([])
  const [logs, setLogs] = useState([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [filteredOutCount, setFilteredOutCount] = useState(0)
  const [showScrapersDropdown, setShowScrapersDropdown] = useState(false)
  const [showFiltersPopover, setShowFiltersPopover] = useState(false)

  const [savedKeywords, setSavedKeywords] = useState([])
  const [activeKeyword, setActiveKeyword] = useState(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [runFrequency, setRunFrequency] = useState(() =>
    parseInt(localStorage.getItem('scraper_run_frequency') || '0', 10)
  )
  const [loopSecondsLeft, setLoopSecondsLeft] = useState(null)
  const [loopTarget, setLoopTarget] = useState(null)
  const [lastScrapedAt, setLastScrapedAt] = useState(() => {
    try { return JSON.parse(localStorage.getItem('threads_last_scraped_times') || '{}') }
    catch { return {} }
  })

  const logEndRef = useRef(null)
  const pollRef = useRef(null)
  const esRef = useRef(null)
  const prevRunningRef = useRef(false)
  const activeKeywordRef = useRef(null)
  const loopTargetRef = useRef(null)
  const loopTimerRef = useRef(null)
  const countdownIntervalRef = useRef(null)
  const loopCancelledRef = useRef(false)
  const runFrequencyRef = useRef(0)
  const scrapersDropdownRef = useRef(null)
  const filtersPopoverRef = useRef(null)

  const LIMIT = 20

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e) {
      if (showScrapersDropdown && scrapersDropdownRef.current && !scrapersDropdownRef.current.contains(e.target))
        setShowScrapersDropdown(false)
      if (showFiltersPopover && filtersPopoverRef.current && !filtersPopoverRef.current.contains(e.target))
        setShowFiltersPopover(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showScrapersDropdown, showFiltersPopover])

  const addLog = useCallback((line) => {
    setLogs(prev => [...prev.slice(-499), line])
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getScraperStatus()
      setServerReachable(true)
      setStatus(s)
      return s
    } catch {
      setServerReachable(false)
      return null
    }
  }, [])

  const fetchVelocity = useCallback(async () => {
    try {
      const { results } = await getThreadsVelocity()
      setVelocity(results)
    } catch { }
  }, [])

  const fetchPosts = useCallback(async (p = page, f = filters, kw = activeKeyword) => {
    try {
      setLoading(true)
      const [data, unfiltered] = await Promise.all([
        getThreadsPosts({
          page: p, limit: LIMIT, author: f.author, minLikes: f.minLikes,
          timeWindow: f.timeWindow, keyword: kw, sortBy: f.sortBy,
          mediaTypes: f.mediaTypes, scraperIds: f.scraperIds,
        }),
        f.timeWindow > 0
          ? getThreadsPosts({ page: 1, limit: 1, author: f.author, keyword: kw, mediaTypes: f.mediaTypes, scraperIds: f.scraperIds })
          : Promise.resolve(null),
      ])
      setPosts(data.posts)
      setTotal(data.total)
      setFilteredOutCount(unfiltered ? Math.max(0, unfiltered.total - data.total) : 0)
      const seen = [...new Set(data.posts.flatMap(p => p.scrapers ?? []).filter(Boolean))].sort()
      setAvailableScrapers(prev => [...new Set([...prev, ...seen])].sort())
    } catch (err) { console.error('fetchPosts error:', err) }
    finally { setLoading(false) }
  }, [page, filters, activeKeyword])

  useEffect(() => {
    probeLocalServer().then(setLocalAvailable)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchVelocity()
    fetchPosts(1, filters)
    getKeywords().then(setSavedKeywords).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (localAvailable !== true) return
    fetchStatus()
  }, [localAvailable]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!localAvailable || !serverReachable) return
    clearInterval(pollRef.current)
    if (status.running) {
      pollRef.current = setInterval(async () => {
        await fetchStatus()
        fetchVelocity()
        if (innerTab === 'feed') fetchPosts(page, filters)
      }, 30000)
    }
    return () => clearInterval(pollRef.current)
  }, [status.running, serverReachable, innerTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!localAvailable || !serverReachable) return
    esRef.current?.close()
    esRef.current = createLogStream(addLog)
    return () => esRef.current?.close()
  }, [serverReachable]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logsOpen) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, logsOpen])

  useEffect(() => {
    localStorage.setItem('threads_last_scraped_times', JSON.stringify(lastScrapedAt))
  }, [lastScrapedAt])

  useEffect(() => { activeKeywordRef.current = activeKeyword }, [activeKeyword])
  useEffect(() => { runFrequencyRef.current = runFrequency }, [runFrequency])

  useEffect(() => {
    localStorage.setItem('scraper_run_frequency', String(runFrequency))
  }, [runFrequency])

  useEffect(() => {
    if (prevRunningRef.current && !status.running) {
      setPage(1)
      if (innerTab === 'feed') fetchPosts(1, filters, activeKeywordRef.current)
      else fetchVelocity()
      setLastScrapedAt(prev => ({
        ...prev,
        [loopTargetRef.current ?? '__home__']: new Date().toISOString(),
      }))
      if (!loopCancelledRef.current && runFrequencyRef.current > 0) {
        scheduleLoop(loopTargetRef.current, runFrequencyRef.current * 60 * 1000)
      }
    }
    prevRunningRef.current = status.running
  }, [status.running]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (innerTab === 'leaderboard') fetchVelocity()
    else fetchPosts(page, filters)
  }, [innerTab, page]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters(newFilters) {
    setFilters(newFilters)
    setPage(1)
    fetchPosts(1, newFilters, activeKeyword)
  }

  function toggleMediaType(type) {
    const next = filters.mediaTypes.includes(type)
      ? filters.mediaTypes.filter(t => t !== type)
      : [...filters.mediaTypes, type]
    applyFilters({ ...filters, mediaTypes: next })
  }

  function toggleScraperId(id) {
    const next = filters.scraperIds.includes(id)
      ? filters.scraperIds.filter(s => s !== id)
      : [...filters.scraperIds, id]
    applyFilters({ ...filters, scraperIds: next })
  }

  function addKeyword(kw) {
    const trimmed = kw.trim()
    if (!trimmed || savedKeywords.includes(trimmed)) return
    setSavedKeywords(prev => [...prev, trimmed])
    addKeywordToDb(trimmed).catch(() => {
      setSavedKeywords(prev => prev.filter(k => k !== trimmed))
    })
  }

  function removeKeyword(kw) {
    setSavedKeywords(prev => prev.filter(k => k !== kw))
    deleteKeywordFromDb(kw).catch(() => {})
    if (activeKeyword === kw) {
      setActiveKeyword(null)
      setPage(1)
      fetchPosts(1, filters, null)
    }
  }

  async function handleHidePost(postId) {
    if (!window.confirm('Hide this post for everyone on the team?')) return
    setPosts(prev => prev.filter(p => p.post_id !== postId))
    setVelocity(prev => prev.filter(v => v.post_id !== postId))
    await hidePostInDb(postId)
  }

  function selectKeyword(kw) {
    setActiveKeyword(kw)
    setPage(1)
    fetchPosts(1, filters, kw)
  }

  async function handleStart() {
    loopCancelledRef.current = false
    loopTargetRef.current = activeKeyword
    setLoopTarget(activeKeyword)
    setActionLoading(true)
    try {
      if (activeKeyword) await startKeywordSearch(activeKeyword)
      else await startScraper()
      await fetchStatus()
    } finally { setActionLoading(false) }
  }

  function handleCancelLoop() {
    loopCancelledRef.current = true
    clearTimeout(loopTimerRef.current)
    clearInterval(countdownIntervalRef.current)
    loopTimerRef.current = null
    countdownIntervalRef.current = null
    setLoopSecondsLeft(null)
    setLoopTarget(null)
  }

  async function handleStop() {
    handleCancelLoop()
    setActionLoading(true)
    try {
      await stopScraper()
      await fetchStatus()
    } finally { setActionLoading(false) }
  }

  function scheduleLoop(target, delayMs) {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    const totalSeconds = Math.floor(delayMs / 1000)
    setLoopSecondsLeft(totalSeconds)
    setLoopTarget(target)
    countdownIntervalRef.current = setInterval(() => {
      setLoopSecondsLeft(prev => (prev !== null && prev > 1) ? prev - 1 : null)
    }, 1000)
    loopTimerRef.current = setTimeout(async () => {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
      loopTimerRef.current = null
      setLoopSecondsLeft(null)
      if (loopCancelledRef.current) return
      setActionLoading(true)
      try {
        if (target) await startKeywordSearch(target)
        else await startScraper()
        await fetchStatus()
      } catch { }
      finally { setActionLoading(false) }
    }, delayMs)
  }

  const controlAvailable = localAvailable === true && serverReachable === true
  const activeKey = activeKeyword ?? '__home__'
  const lastScrapeIso = lastScrapedAt[activeKey]
  const scrapeIsStale = lastScrapeIso && (Date.now() - new Date(lastScrapeIso)) / 60000 > 120
  const activeFiltersCount = (filters.author ? 1 : 0) + (filters.minLikes > 0 ? 1 : 0)
  const canStartScraper = controlAvailable && !status.running && loopSecondsLeft === null

  return (
    <div className="sc-content">

      {/* Control bar — local server only */}
      {controlAvailable && (
        <div className="sc-control-bar">
          <div className="sc-status">
            <span className={`sc-dot ${status.running ? 'sc-dot-running' : loopSecondsLeft !== null ? 'sc-dot-loop' : 'sc-dot-idle'}`} />
            <span className="sc-status-label">
              {status.running
                ? (loopTarget !== null ? `Scraping: "${loopTarget}"` : 'Running')
                : loopSecondsLeft !== null
                  ? `Next run in ${formatCountdown(loopSecondsLeft)}${loopTarget ? ` · "${loopTarget}"` : ''}`
                  : 'Idle'}
            </span>
          </div>
          <div className="sc-control-actions">
            <div className="sc-freq-group">
              {FREQUENCIES.map(f => (
                <button
                  key={f.value}
                  className={`sc-freq-btn${runFrequency === f.value ? ' sc-freq-btn-active' : ''}`}
                  onClick={() => setRunFrequency(f.value)}
                  disabled={status.running || loopSecondsLeft !== null}
                  title={f.value === 0 ? 'Run once' : `Repeat every ${f.label}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {status.running ? (
              <button className="sc-stop-btn" onClick={handleStop} disabled={actionLoading}>
                {actionLoading ? 'Stopping…' : 'Stop'}
              </button>
            ) : loopSecondsLeft !== null ? (
              <button className="sc-cancel-btn" onClick={handleCancelLoop}>Cancel loop</button>
            ) : (
              <button className="sc-start-btn" onClick={handleStart} disabled={actionLoading}>
                {actionLoading ? 'Starting…' : activeKeyword ? `Start scraper: ${activeKeyword}` : 'Start scraper'}
              </button>
            )}
            <button
              className={`sc-log-toggle${logsOpen ? ' sc-log-toggle-open' : ''}`}
              onClick={() => setLogsOpen(v => !v)}
              title="View scraper logs"
            >
              Logs {logs.length > 0 && <span className="sc-log-count">{logs.length}</span>}
            </button>
          </div>
        </div>
      )}

      {/* No-server notice */}
      {localAvailable === false && (
        <div className="sc-no-server-notice">
          No local scraper detected — Start/Stop unavailable. Showing shared data from Supabase.
          {' '}If your scraper is running, use <strong>Chrome</strong> and{' '}
          <button className="sc-retry-link" onClick={() => probeLocalServer().then(setLocalAvailable)}>
            retry detection
          </button>.
        </div>
      )}

      {/* Log panel */}
      {controlAvailable && logsOpen && (
        <div className="sc-log-panel">
          {logs.length === 0
            ? <span className="sc-log-empty">No output yet.</span>
            : logs.map((line, i) => <div key={i} className="sc-log-line">{line}</div>)
          }
          <div ref={logEndRef} />
        </div>
      )}

      {/* Tabs */}
      <div className="sc-inner-tabs">
        <button
          className={`sc-inner-tab${innerTab === 'feed' ? ' sc-inner-tab-active' : ''}`}
          onClick={() => setInnerTab('feed')}
        >
          Feed
        </button>
        <button
          className={`sc-inner-tab${innerTab === 'leaderboard' ? ' sc-inner-tab-active' : ''}`}
          onClick={() => setInnerTab('leaderboard')}
        >
          Leaderboard
        </button>
      </div>

      {/* ── Feed ─────────────────────────────────────────────────────── */}
      {innerTab === 'feed' && (
        <div className="sc-feed">

          {/* Keyword bar */}
          <div className="sc-keyword-bar">
            <div className="sc-keyword-chips">
              <button
                className={`sc-chip${activeKeyword === null ? ' sc-chip-active' : ''}`}
                onClick={() => selectKeyword(null)}
              >
                Home feed
              </button>
              {savedKeywords.map(kw => (
                <span key={kw} className="sc-keyword-chip-wrap">
                  <button
                    className={`sc-chip${activeKeyword === kw ? ' sc-chip-active' : ''}`}
                    onClick={() => selectKeyword(kw)}
                    title={kw}
                  >
                    {kw}
                  </button>
                  <button
                    className="sc-keyword-remove"
                    onClick={() => removeKeyword(kw)}
                    title={`Remove "${kw}"`}
                  >×</button>
                </span>
              ))}
              <form
                className="sc-keyword-add-form"
                onSubmit={e => { e.preventDefault(); addKeyword(keywordInput); setKeywordInput('') }}
              >
                <input
                  className="sc-filter-input sc-keyword-input"
                  type="text"
                  placeholder="+ Add keyword…"
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                />
              </form>
            </div>
            <div className="sc-keyword-right">
              {lastScrapeIso && (
                <span className={`sc-freshness-badge${scrapeIsStale ? ' sc-freshness-stale' : ''}`}>
                  Last scraped {timeAgo(lastScrapeIso)}
                </span>
              )}
              {canStartScraper && (
                <button
                  className="sc-scrape-now-btn"
                  onClick={handleStart}
                  disabled={actionLoading}
                  title={activeKeyword ? `Scrape "${activeKeyword}" now` : 'Scrape home feed now'}
                >
                  ↻ Scrape now
                </button>
              )}
            </div>
          </div>

          {/* Filter bar */}
          <div className="sc-filter-tray">
          <div className="sc-filters">
            {/* Time window */}
            <div className="sc-filter-chips">
              {TIME_WINDOWS.map(tw => (
                <button
                  key={tw.value}
                  className={`sc-chip${filters.timeWindow === tw.value ? ' sc-chip-active' : ''}`}
                  onClick={() => applyFilters({ ...filters, timeWindow: tw.value })}
                >
                  {tw.label}
                </button>
              ))}
            </div>
            <span className="sc-filter-sep" />
            {/* Sort */}
            <div className="sc-sort-group">
              {SORT_OPTIONS.map(s => (
                <button
                  key={s.value}
                  className={`sc-sort-btn${filters.sortBy === s.value ? ' sc-sort-btn-active' : ''}`}
                  onClick={() => applyFilters({ ...filters, sortBy: s.value })}
                  title={s.title}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="sc-filter-sep" />
            {/* Media */}
            <div className="sc-filter-chips">
              <button
                className={`sc-chip${filters.mediaTypes.length === 0 ? ' sc-chip-active' : ''}`}
                onClick={() => applyFilters({ ...filters, mediaTypes: [] })}
              >
                All
              </button>
              {MEDIA_TYPES.map(mt => (
                <button
                  key={mt.value}
                  className={`sc-chip${filters.mediaTypes.includes(mt.value) ? ' sc-chip-active' : ''}`}
                  onClick={() => toggleMediaType(mt.value)}
                >
                  {mt.label}
                </button>
              ))}
            </div>
            <span className="sc-filter-sep" />
            {/* Scrapers dropdown */}
            {availableScrapers.length > 0 && (
              <div className="sc-dropdown-wrap" ref={scrapersDropdownRef}>
                <button
                  className={`sc-dropdown-btn${filters.scraperIds.length > 0 ? ' sc-dropdown-btn-active' : ''}`}
                  onClick={() => setShowScrapersDropdown(v => !v)}
                >
                  Scrapers{filters.scraperIds.length > 0 ? ` (${filters.scraperIds.length})` : ''} ▾
                </button>
                {showScrapersDropdown && (
                  <div className="sc-dropdown-panel">
                    <button
                      className={`sc-dropdown-item${filters.scraperIds.length === 0 ? ' sc-dropdown-item-active' : ''}`}
                      onClick={() => { applyFilters({ ...filters, scraperIds: [] }); setShowScrapersDropdown(false) }}
                    >
                      All scrapers
                    </button>
                    <div className="sc-dropdown-divider" />
                    {availableScrapers.map(id => (
                      <label key={id} className="sc-dropdown-item sc-dropdown-check">
                        <input
                          type="checkbox"
                          checked={filters.scraperIds.includes(id)}
                          onChange={() => toggleScraperId(id)}
                        />
                        {id}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Extra filters popover */}
            <div className="sc-dropdown-wrap" ref={filtersPopoverRef}>
              <button
                className={`sc-dropdown-btn${activeFiltersCount > 0 ? ' sc-dropdown-btn-active' : ''}`}
                onClick={() => setShowFiltersPopover(v => !v)}
              >
                Filters{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''} ▾
              </button>
              {showFiltersPopover && (
                <div className="sc-dropdown-panel sc-filters-panel">
                  <div className="sc-popover-field">
                    <label className="sc-popover-label">Author</label>
                    <input
                      className="sc-filter-input"
                      type="text"
                      placeholder="Filter by handle…"
                      value={filters.author}
                      onChange={e => applyFilters({ ...filters, author: e.target.value })}
                    />
                  </div>
                  <div className="sc-popover-field">
                    <label className="sc-popover-label">Min likes</label>
                    <input
                      className="sc-filter-input sc-filter-num"
                      type="number"
                      placeholder="0"
                      min={0}
                      value={filters.minLikes || ''}
                      onChange={e => applyFilters({ ...filters, minLikes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  {activeFiltersCount > 0 && (
                    <button
                      className="sc-popover-clear"
                      onClick={() => applyFilters({ ...filters, author: '', minLikes: 0 })}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>

          {/* Scraping banner */}
          {status.running && (
            <div className="sc-scraping-banner">
              <span className="sc-scraping-pulse" />
              Scraping in progress — results will refresh when complete
            </div>
          )}

          {/* Loading skeletons */}
          {loading && posts.length === 0 && (
            <div className="sc-loading-grid">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="sc-skeleton" />)}
            </div>
          )}

          {/* Older posts hidden banner */}
          {!loading && filteredOutCount > 0 && posts.length > 0 && (
            <div className="sc-filtered-banner">
              {filteredOutCount} older post{filteredOutCount !== 1 ? 's' : ''} hidden by the {filters.timeWindow}h window —{' '}
              <button className="sc-filtered-link" onClick={() => applyFilters({ ...filters, timeWindow: 0 })}>show all</button>
            </div>
          )}

          {/* Empty state */}
          {!loading && posts.length === 0 && (
            <div className="sc-empty">
              <p>No posts found.</p>
              {filteredOutCount > 0 ? (
                <p className="sc-empty-hint">
                  {filteredOutCount} post{filteredOutCount !== 1 ? 's' : ''} saved but outside the {filters.timeWindow}h window —{' '}
                  <button className="sc-filtered-link" onClick={() => applyFilters({ ...filters, timeWindow: 0 })}>show all</button>
                </p>
              ) : (
                !status.running && <p className="sc-empty-hint">Start the scraper to collect posts.</p>
              )}
            </div>
          )}

          {/* Post list */}
          <div className="sc-post-list">
            {posts.map(post => {
              const postedLabel = post.created_at > 0
                ? timeAgo(new Date(post.created_at * 1000).toISOString())
                : timeAgo(post.first_seen_at)
              const tooltipText = [
                post.created_at > 0
                  ? `Posted: ${new Date(post.created_at * 1000).toLocaleString()}`
                  : null,
                `Scraped: ${formatScrapedAt(post.first_seen_at)}`,
                post.scraper_user_id ? `By: ${post.scraper_user_id}` : null,
              ].filter(Boolean).join(' · ')

              return (
                <div
                  key={post.post_id}
                  className={`sc-post-card ${postAgeClass(post)}`}
                  title={postAgeClass(post) === 'sc-age-live' ? 'Live (< 6h)' : postAgeClass(post) === 'sc-age-day' ? 'Today (< 24h)' : 'Older (24h+)'}
                >
                  <div className="sc-post-meta">
                    <span
                      className="sc-post-author"
                      title={post.scraper_user_id ? `Scraped by ${post.scraper_user_id}` : undefined}
                    >
                      @{post.author_username}
                    </span>
                    <span className="sc-post-time" title={tooltipText}>
                      {postedLabel}
                    </span>
                  </div>
                  <p className="sc-post-text">{post.text || '[no text]'}</p>
                  <div className="sc-post-footer">
                    <div className="sc-post-stats">
                      <span>{formatCount(post.like_count)} likes</span>
                      <span>{formatCount(post.reply_count)} replies</span>
                      <span>{formatCount(post.repost_count)} reposts</span>
                      {post.media_type && post.media_type !== 'TEXT' && (
                        <span className={`sc-media-badge sc-media-badge-${post.media_type.toLowerCase()}`}>
                          {post.media_type === 'IMAGE' ? 'img' : post.media_type === 'VIDEO' ? 'vid' : 'carousel'}
                        </span>
                      )}
                    </div>
                    <div className="sc-post-actions">
                      <button
                        className="sc-hide-btn"
                        onClick={() => handleHidePost(post.post_id)}
                        title="Hide for the whole team"
                      >
                        Hide
                      </button>
                      {post.permalink && (
                        <a className="sc-post-btn" href={post.permalink} target="_blank" rel="noopener noreferrer">
                          Go to →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="sc-pagination">
              <button className="sc-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                ← Prev
              </button>
              <span className="sc-page-info">Page {page} of {Math.ceil(total / LIMIT)}</span>
              <button
                className="sc-page-btn"
                disabled={page >= Math.ceil(total / LIMIT)}
                onClick={() => setPage(p => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Leaderboard ──────────────────────────────────────────────── */}
      {innerTab === 'leaderboard' && (
        <div className="sc-leaderboard">
          {velocity.length === 0 ? (
            <div className="sc-empty">
              <p>No velocity data yet.</p>
              <p className="sc-empty-hint">Viral score requires at least 2 scrape cycles. Start the scraper and wait for the second cycle.</p>
            </div>
          ) : (
            <div className="sc-lb-list">
              {velocity.map((v, i) => (
                <div key={v.post_id} className={`sc-lb-card ${velocityAgeClass(v)}${v.scraper_count > 1 ? ' sc-lb-card-crossbubble' : ''}`}>
                  <span className="sc-lb-rank">#{i + 1}</span>
                  <div className="sc-lb-body">
                    <div className="sc-lb-meta">
                      <span className="sc-lb-author">@{v.author_username}</span>
                      <span className="sc-lb-age">{formatAge(v.minutes_old)}</span>
                      {v.media_type && v.media_type !== 'TEXT' && (
                        <span className={`sc-media-badge sc-media-badge-${v.media_type.toLowerCase()}`}>
                          {v.media_type === 'IMAGE' ? 'img' : v.media_type === 'VIDEO' ? 'vid' : 'carousel'}
                        </span>
                      )}
                      {v.scraper_count > 1 && (
                        <span className="sc-crossbubble-badge">seen by {v.scraper_count} scrapers</span>
                      )}
                    </div>
                    <p className="sc-lb-text">
                      {v.text ? v.text.slice(0, 140) + (v.text.length > 140 ? '…' : '') : '[no text]'}
                    </p>
                    <div className="sc-lb-stats">
                      <span className="sc-velocity">{v.composite_score.toFixed(2)} score</span>
                      <span className="sc-stat">{formatCount(v.current_likes)} likes</span>
                      <span className="sc-stat">{formatCount(v.current_replies)} replies</span>
                      <span className="sc-stat">{formatCount(v.current_reposts)} reposts</span>
                      <span className="sc-stat">{v.snapshot_count} snapshots</span>
                      {(v.scrapers ?? []).map(s => (
                        <span key={s} className="sc-scraper-chip">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="sc-lb-actions">
                    <button
                      className="sc-hide-btn"
                      onClick={() => handleHidePost(v.post_id)}
                      title="Hide for the whole team"
                    >
                      Hide
                    </button>
                    {v.permalink && (
                      <a className="sc-post-btn" href={v.permalink} target="_blank" rel="noopener noreferrer">
                        Go to →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
