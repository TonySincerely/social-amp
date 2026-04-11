import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAllTrendSnapshots,
  saveTrendSnapshot,
  getAllProducts,
  getLocalData,
  setLocalData,
} from '../../services/storage'
import { getPulseSnapshot, isGeminiInitialized } from '../../services/gemini'
import { getUpcomingEvents } from '../../data/upcomingEvents'
import { PlatformBadge, RefreshIcon } from '../../components/Icons'
import { useApp } from '../../context/AppContext'
import './Pulse.css'

const LOCATIONS = [
  { label: 'United States', region: 'US' },
  { label: 'United Kingdom', region: 'UK' },
  { label: 'Canada', region: 'CA' },
  { label: 'Australia', region: 'AU' },
  { label: 'Global / Other', region: 'global' },
]

const PLATFORMS = ['all', 'twitter', 'reddit', 'instagram', 'web']

function timeAgo(isoStr) {
  const mins = Math.floor((Date.now() - new Date(isoStr)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function Pulse() {
  const navigate = useNavigate()
  const { setShowApiKeyModal } = useApp()

  const [locationLabel, setLocationLabel] = useState(
    () => getLocalData('pulse_location', 'United States')
  )
  const selectedLoc = LOCATIONS.find(l => l.label === locationLabel) || LOCATIONS[0]

  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [products, setProducts] = useState([])
  const [platformFilter, setPlatformFilter] = useState('all')
  const [starred, setStarred] = useState(() => new Set(getLocalData('pulse_starred', [])))
  const [openPicker, setOpenPicker] = useState(null) // trendId

  useEffect(() => {
    Promise.all([getAllTrendSnapshots(), getAllProducts()]).then(([snaps, prods]) => {
      setSnapshots(snaps.sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt)))
      setProducts(prods)
    })
  }, [])

  function handleLocationChange(e) {
    const label = e.target.value
    setLocationLabel(label)
    setLocalData('pulse_location', label)
  }

  async function handleRefresh() {
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }
    setLoading(true)
    setError(null)
    try {
      const result = await getPulseSnapshot({ location: selectedLoc.label })
      const snap = await saveTrendSnapshot({
        location: selectedLoc.label,
        region: selectedLoc.region,
        fetchedAt: new Date().toISOString(),
        trends: result.trends,
        upcomingBuzz: result.upcomingBuzz,
      })
      setSnapshots(prev => [snap, ...prev].slice(0, 5))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleStar(trendId) {
    setStarred(prev => {
      const next = new Set(prev)
      next.has(trendId) ? next.delete(trendId) : next.add(trendId)
      setLocalData('pulse_starred', [...next])
      return next
    })
  }

  function handlePostAs(trend, productId) {
    navigate(`/studio/${productId}`, { state: { angle: trend.topic } })
    setOpenPicker(null)
  }

  function handleTrendAction(trend) {
    if (products.length === 0) return
    if (products.length === 1) return handlePostAs(trend, products[0].id)
    setOpenPicker(prev => prev === trend.id ? null : trend.id)
  }

  const upcomingEvents = getUpcomingEvents(selectedLoc.region, 6)
  const latestBuzz = snapshots[0]?.upcomingBuzz || []

  function filteredTrends(trends) {
    if (platformFilter === 'all') return trends
    return trends.filter(t => t.platform === platformFilter)
  }

  const isDerived = p => p === 'twitter' || p === 'instagram'

  return (
    <div className="pu-wrap">
      <div className="pu-header">
        <div>
          <h1 className="pu-title">Pulse</h1>
          <p className="pu-subtitle">Trending now and what's coming up in your market</p>
        </div>
        <select className="pu-location-select" value={locationLabel} onChange={handleLocationChange}>
          {LOCATIONS.map(l => (
            <option key={l.region} value={l.label}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* ── Upcoming ─────────────────────────────────────────────────────────── */}
      <section className="pu-section">
        <div className="pu-section-header">
          <span className="pu-section-label">Upcoming · next 6 weeks</span>
        </div>

        {upcomingEvents.length === 0 && latestBuzz.length === 0 ? (
          <p className="pu-empty">No upcoming events in this window for your region.</p>
        ) : (
          <div className="pu-upcoming-grid">
            {upcomingEvents.map(ev => (
              <div key={ev.name} className="pu-upcoming-card">
                <div className="pu-upcoming-top">
                  <span className="pu-upcoming-days">{ev.daysUntil}d</span>
                  {ev.span && <span className="pu-span-badge">{ev.span}</span>}
                </div>
                <div className="pu-upcoming-name">{ev.name}</div>
                <div className="pu-upcoming-date">{ev.dateStr}</div>
                <div className="pu-upcoming-platforms">
                  {ev.platforms.map(p => <PlatformBadge key={p} platform={p} size={11} />)}
                </div>
                <p className="pu-upcoming-angle">{ev.angleHint}</p>
                <button
                  className="pu-upcoming-cta"
                  onClick={() => navigate('/planner')}
                >
                  Add to planner →
                </button>
              </div>
            ))}

            {latestBuzz.map((buzz, i) => (
              <div key={`buzz-${i}`} className="pu-upcoming-card pu-upcoming-buzz">
                <div className="pu-upcoming-top">
                  <span className="pu-buzz-badge">building</span>
                </div>
                <div className="pu-upcoming-name">{buzz.topic}</div>
                <div className="pu-upcoming-date">{buzz.approxDate}</div>
                <p className="pu-upcoming-angle">{buzz.why}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Live Trends ──────────────────────────────────────────────────────── */}
      <section className="pu-section">
        <div className="pu-section-header">
          <span className="pu-section-label">Live Trends</span>
          <div className="pu-section-controls">
            <div className="pu-platform-chips">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  className={`pu-chip${platformFilter === p ? ' pu-chip-active' : ''}`}
                  onClick={() => setPlatformFilter(p)}
                >
                  {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <button
              className="pu-refresh-btn"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshIcon size={13} />
              {loading ? 'Fetching…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <div className="pu-error">{error}</div>}

        {snapshots.length === 0 && !loading && (
          <div className="pu-empty-state">
            <p>No trend data yet. Hit Refresh to fetch live trends.</p>
            <button className="pu-fetch-btn" onClick={handleRefresh}>
              Fetch trends now
            </button>
          </div>
        )}

        {loading && snapshots.length === 0 && (
          <div className="pu-loading-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="pu-skeleton" />
            ))}
          </div>
        )}

        {snapshots.map(snap => {
          const trends = filteredTrends(snap.trends || [])
          return (
            <div key={snap.id} className="pu-snapshot">
              <div className="pu-snapshot-divider">
                <span className="pu-snapshot-time">
                  {new Date(snap.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <span className="pu-snapshot-loc">· {snap.location}</span>
                </span>
                <span className="pu-snapshot-ago">{timeAgo(snap.fetchedAt)}</span>
              </div>

              {trends.length === 0 ? (
                <p className="pu-empty">No {platformFilter} trends in this snapshot.</p>
              ) : (
                <div className="pu-trend-grid">
                  {trends.map(trend => (
                    <div key={trend.id} className="pu-trend-card">
                      <div className="pu-trend-top">
                        <PlatformBadge platform={trend.platform} size={11} />
                        <span className={`pu-momentum pu-momentum-${trend.momentum}`} title={trend.momentum} />
                        {isDerived(trend.platform) && (
                          <span className="pu-derived">search-derived</span>
                        )}
                      </div>
                      <div className="pu-trend-topic">{trend.topic}</div>
                      <p className="pu-trend-summary">{trend.summary}</p>
                      <div className="pu-trend-actions">
                        <button
                          className={`pu-star${starred.has(trend.id) ? ' pu-star-on' : ''}`}
                          onClick={() => toggleStar(trend.id)}
                          title={starred.has(trend.id) ? 'Unstar' : 'Star'}
                        >★</button>

                        {products.length > 0 && (
                          <div className="pu-picker-wrap">
                            <button
                              className="pu-post-btn"
                              onClick={() => handleTrendAction(trend)}
                            >
                              Post as →
                            </button>
                            {openPicker === trend.id && products.length > 1 && (
                              <div className="pu-picker-dropdown">
                                {products.map(p => (
                                  <button
                                    key={p.id}
                                    className="pu-picker-item"
                                    onClick={() => handlePostAs(trend, p.id)}
                                  >
                                    {p.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
