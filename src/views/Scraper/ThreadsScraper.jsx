import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { getAllProducts } from '../../services/storage'

const TIME_WINDOWS = [
  { label: 'Live · 6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '48h', value: 48 },
]

const MEDIA_TYPES = [
  { label: 'Img', value: 'IMAGE' },
  { label: 'Vid', value: 'VIDEO' },
  { label: 'Carousel', value: 'CAROUSEL' },
  { label: 'Text', value: 'TEXT' },
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
  const navigate = useNavigate()

  const [localAvailable, setLocalAvailable] = useState(null) // null=probing, true=found, false=not found
  const [serverReachable, setServerReachable] = useState(null)
  const [status, setStatus] = useState({ running: false, pid: null, keyword: null })
  const [innerTab, setInnerTab] = useState('leaderboard')
  const [velocity, setVelocity] = useState([])
  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ author: '', minLikes: 0, timeWindow: 24, sortBy: 'scraped', mediaTypes: [] })
  const [logs, setLogs] = useState([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [filteredOutCount, setFilteredOutCount] = useState(0)
  const [products, setProducts] = useState([])
  const [openPicker, setOpenPicker] = useState(null)

  const [savedKeywords, setSavedKeywords] = useState(() => {
    try { return JSON.parse(localStorage.getItem('threads_saved_keywords') || '[]') }
    catch { return [] }
  })
  const [activeKeyword, setActiveKeyword] = useState(null) // null = home feed
  const [keywordInput, setKeywordInput] = useState('')
  const [runFrequency, setRunFrequency] = useState(() =>
    parseInt(localStorage.getItem('scraper_run_frequency') || '0', 10)
  )
  const [loopSecondsLeft, setLoopSecondsLeft] = useState(null)
  const [loopTarget, setLoopTarget] = useState(null)
  const [lastScrapedAt, setLastScrapedAt] = useState({})

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

  const LIMIT = 20

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
    } catch { /* server not running */ }
  }, [])

  const fetchPosts = useCallback(async (p = page, f = filters, kw = activeKeyword) => {
    try {
      setLoading(true)
      const [data, unfiltered] = await Promise.all([
        getThreadsPosts({ page: p, limit: LIMIT, author: f.author, minLikes: f.minLikes, timeWindow: f.timeWindow, keyword: kw, sortBy: f.sortBy, mediaTypes: f.mediaTypes }),
        f.timeWindow > 0
          ? getThreadsPosts({ page: 1, limit: 1, author: f.author, keyword: kw, mediaTypes: f.mediaTypes })
          : Promise.resolve(null),
      ])
      setPosts(data.posts)
      setTotal(data.total)
      setFilteredOutCount(unfiltered ? Math.max(0, unfiltered.total - data.total) : 0)
    } catch { /* server not running */ }
    finally { setLoading(false) }
  }, [page, filters, activeKeyword])

  // Probe for local server on mount
  useEffect(() => {
    probeLocalServer().then(setLocalAvailable)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load once probe resolves to true
  useEffect(() => {
    if (localAvailable !== true) return
    getAllProducts().then(setProducts).catch(() => {})
    fetchStatus().then(s => {
      if (s) {
        fetchVelocity()
        fetchPosts(1, filters)
      }
    })
  }, [localAvailable]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling while running
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

  // SSE log stream
  useEffect(() => {
    if (!localAvailable || !serverReachable) return
    esRef.current?.close()
    esRef.current = createLogStream(addLog)
    return () => esRef.current?.close()
  }, [serverReachable]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll logs to bottom
  useEffect(() => {
    if (logsOpen) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, logsOpen])

  // Persist saved keywords to localStorage
  useEffect(() => {
    localStorage.setItem('threads_saved_keywords', JSON.stringify(savedKeywords))
  }, [savedKeywords])

  // Keep refs in sync with state
  useEffect(() => { activeKeywordRef.current = activeKeyword }, [activeKeyword])
  useEffect(() => { runFrequencyRef.current = runFrequency }, [runFrequency])

  // Persist run frequency
  useEffect(() => {
    localStorage.setItem('scraper_run_frequency', String(runFrequency))
  }, [runFrequency])

  // When scraper transitions from running → stopped: refresh results and schedule next loop
  useEffect(() => {
    if (prevRunningRef.current && !status.running) {
      setPage(1)
      if (innerTab === 'feed') fetchPosts(1, filters, activeKeywordRef.current)
      else fetchVelocity()
      setLastScrapedAt(prev => ({ ...prev, [loopTargetRef.current ?? '__home__']: new Date().toISOString() }))
      if (!loopCancelledRef.current && runFrequencyRef.current > 0) {
        scheduleLoop(loopTargetRef.current, runFrequencyRef.current * 60 * 1000)
      }
    }
    prevRunningRef.current = status.running
  }, [status.running]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when tab, page, or server availability changes
  useEffect(() => {
    if (!serverReachable) return
    if (innerTab === 'leaderboard') fetchVelocity()
    else fetchPosts(page, filters)
  }, [innerTab, page, serverReachable]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function addKeyword(kw) {
    const trimmed = kw.trim()
    if (!trimmed || savedKeywords.includes(trimmed)) return
    setSavedKeywords(prev => [...prev, trimmed])
  }

  function removeKeyword(kw) {
    setSavedKeywords(prev => prev.filter(k => k !== kw))
    if (activeKeyword === kw) {
      setActiveKeyword(null)
      setPage(1)
      fetchPosts(1, filters, null)
    }
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
      } catch {}
      finally { setActionLoading(false) }
    }, delayMs)
  }

  function handlePostAs(post, productId) {
    navigate(`/studio/${productId}`, { state: { angle: post.text } })
    setOpenPicker(null)
  }

  function handlePostAction(post) {
    if (products.length === 0) return
    if (products.length === 1) return handlePostAs(post, products[0].id)
    setOpenPicker(prev => prev === post.post_id ? null : post.post_id)
  }

  if (localAvailable === null) {
    return <div className="sc-checking">Checking for local server…</div>
  }

  if (localAvailable === false) {
    return (
      <div className="sc-offline">
        <div className="sc-offline-icon">⚙</div>
        <h3>Local server not connected</h3>
        <p>The Scraper runs locally on your machine. Start the API server to use this module.</p>
        <code>npm run scraper:server</code>
      </div>
    )
  }

  if (serverReachable === false) {
    return (
      <div className="sc-offline">
        <div className="sc-offline-icon">⚠</div>
        <h3>Server not running</h3>
        <p>Start the local API server in your terminal:</p>
        <code>npm run scraper:server</code>
        <button className="sc-retry-btn" onClick={fetchStatus}>Retry connection</button>
      </div>
    )
  }

  if (serverReachable === null) {
    return <div className="sc-checking">Connecting to local server…</div>
  }

  return (
    <div className="sc-content">
      {/* Control bar */}
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
            <button className="sc-cancel-btn" onClick={handleCancelLoop}>
              Cancel loop
            </button>
          ) : (
            <button className="sc-start-btn" onClick={handleStart} disabled={actionLoading}>
              {actionLoading ? 'Starting…' : activeKeyword ? `Start scraper: ${activeKeyword}` : 'Start scraper'}
            </button>
          )}
          <button
            className={`sc-log-toggle${logsOpen ? ' sc-log-toggle-open' : ''}`}
            onClick={() => setLogsOpen(v => !v)}
          >
            Logs {logs.length > 0 && <span className="sc-log-count">{logs.length}</span>}
          </button>
        </div>
      </div>

      {/* Log panel */}
      {logsOpen && (
        <div className="sc-log-panel">
          {logs.length === 0
            ? <span className="sc-log-empty">No output yet.</span>
            : logs.map((line, i) => <div key={i} className="sc-log-line">{line}</div>)
          }
          <div ref={logEndRef} />
        </div>
      )}

      {/* Inner tabs */}
      <div className="sc-inner-tabs">
        <button
          className={`sc-inner-tab${innerTab === 'leaderboard' ? ' sc-inner-tab-active' : ''}`}
          onClick={() => setInnerTab('leaderboard')}
        >
          Leaderboard
        </button>
        <button
          className={`sc-inner-tab${innerTab === 'feed' ? ' sc-inner-tab-active' : ''}`}
          onClick={() => setInnerTab('feed')}
        >
          Feed
        </button>
      </div>

      {/* Leaderboard */}
      {innerTab === 'leaderboard' && (
        <div className="sc-leaderboard">
          {velocity.length === 0 ? (
            <div className="sc-empty">
              <p>No velocity data yet.</p>
              <p className="sc-empty-hint">Viral score requires at least 2 scrape cycles. Start the scraper and wait for the second cycle.</p>
            </div>
          ) : (
            <>
              <p className="sc-lb-hint">
                Posts gaining traction fastest in the last 6h — ranked by viral score, a weighted mix of how quickly likes, replies, and reposts are accumulating. Replies and reposts count more because they're the signals Threads amplifies most.
              </p>
              <div className="sc-lb-list">
              {velocity.map((v, i) => (
                <div key={v.post_id} className={`sc-lb-card ${velocityAgeClass(v)}`}>
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
                    </div>
                    <p className="sc-lb-text">{v.text ? v.text.slice(0, 140) + (v.text.length > 140 ? '…' : '') : '[no text]'}</p>
                    <div className="sc-lb-stats">
                      <span className="sc-velocity">{v.composite_score.toFixed(2)} score</span>
                      <span className="sc-stat">{formatCount(v.current_likes)} likes</span>
                      <span className="sc-stat">{formatCount(v.current_replies)} replies</span>
                      <span className="sc-stat">{formatCount(v.current_reposts)} reposts</span>
                      <span className="sc-stat">{v.snapshot_count} snapshots</span>
                    </div>
                  </div>
                  <div className="sc-lb-actions">
                    {v.permalink && (
                      <a
                        className="sc-post-btn"
                        href={v.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Go to →
                      </a>
                    )}
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Feed */}
      {innerTab === 'feed' && (
        <div className="sc-feed">
          {/* Keyword bar */}
          <div className="sc-keyword-bar">
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
            {lastScrapedAt[activeKeyword ?? '__home__'] && (
              <span className="sc-last-scraped">
                last scraped {timeAgo(lastScrapedAt[activeKeyword ?? '__home__'])}
              </span>
            )}
          </div>

          <div className="sc-filters">
            <input
              className="sc-filter-input"
              type="text"
              placeholder="Filter by author…"
              value={filters.author}
              onChange={e => applyFilters({ ...filters, author: e.target.value })}
            />
            <input
              className="sc-filter-input sc-filter-num"
              type="number"
              placeholder="Min likes"
              min={0}
              value={filters.minLikes || ''}
              onChange={e => applyFilters({ ...filters, minLikes: parseInt(e.target.value) || 0 })}
            />
            <span className="sc-filter-sep" />
            <div className="sc-filter-group">
              <span className="sc-filter-label">Sort</span>
              <div className="sc-filter-chips">
                <button
                  className={`sc-chip${filters.sortBy === 'scraped' ? ' sc-chip-active' : ''}`}
                  onClick={() => applyFilters({ ...filters, sortBy: 'scraped' })}
                  title="Order by when the post was scraped"
                >
                  Scraped
                </button>
                <button
                  className={`sc-chip${filters.sortBy === 'posted' ? ' sc-chip-active' : ''}`}
                  onClick={() => applyFilters({ ...filters, sortBy: 'posted' })}
                  title="Order by when the post was published"
                >
                  Posted
                </button>
              </div>
            </div>
            <span className="sc-filter-sep" />
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
            <div className="sc-filter-group">
              <span className="sc-filter-label">Media</span>
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
            </div>
          </div>

          {status.running && (
            <div className="sc-scraping-banner">
              <span className="sc-scraping-pulse" />
              Scraping in progress — results will refresh when complete
            </div>
          )}

          {loading && posts.length === 0 && (
            <div className="sc-loading-grid">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="sc-skeleton" />)}
            </div>
          )}

          {!loading && filteredOutCount > 0 && posts.length > 0 && (
            <div className="sc-filtered-banner">
              {filteredOutCount} older post{filteredOutCount !== 1 ? 's' : ''} hidden by the {filters.timeWindow}h window —{' '}
              <button className="sc-filtered-link" onClick={() => applyFilters({ ...filters, timeWindow: 48 })}>switch to 48h</button>
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="sc-empty">
              <p>No posts found.</p>
              {filteredOutCount > 0 ? (
                <p className="sc-empty-hint">
                  {filteredOutCount} post{filteredOutCount !== 1 ? 's' : ''} saved but outside the {filters.timeWindow}h window —{' '}
                  <button className="sc-filtered-link" onClick={() => applyFilters({ ...filters, timeWindow: 48 })}>switch to 48h</button>
                </p>
              ) : (
                !status.running && <p className="sc-empty-hint">Start the scraper to collect posts.</p>
              )}
            </div>
          )}

          <div className="sc-post-list">
            {posts.map(post => (
              <div key={post.post_id} className={`sc-post-card ${postAgeClass(post)}`}>
                <div className="sc-post-meta">
                  <span className="sc-post-author">@{post.author_username}</span>
                  <span className="sc-post-time">{post.created_at > 0 ? timeAgo(new Date(post.created_at * 1000).toISOString()) : timeAgo(post.first_seen_at)}</span>
                  <span className="sc-post-scraped">scraped {formatScrapedAt(post.first_seen_at)}</span>
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
                  {post.permalink && (
                    <a
                      className="sc-post-btn"
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Go to →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {total > LIMIT && (
            <div className="sc-pagination">
              <button
                className="sc-page-btn"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
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
    </div>
  )
}
