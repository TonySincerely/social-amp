import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProducts, getAllAccounts, getAllCalendarPosts, saveCalendarPost } from '../../services/storage'
import { getLocalData, setLocalData } from '../../services/storage'
import {
  generateSchedule,
  findInternalCollisions,
  getDefaultTimezone,
  getProductColor,
  PLATFORM_FREQ_RANGE,
  formatTime12,
} from '../../services/planner'
import { PlatformBadge, TrashIcon } from '../../components/Icons'
import './Planner.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export function Planner() {
  const navigate = useNavigate()
  const now = new Date()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Data
  const [products, setProducts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [existingPosts, setExistingPosts] = useState([])

  // Step 1 state
  const defaultNextMonth = now.getMonth() === 11
    ? { month: 0, year: now.getFullYear() + 1 }
    : { month: now.getMonth() + 1, year: now.getFullYear() }
  const [month, setMonth] = useState(defaultNextMonth.month)
  const [year, setYear] = useState(defaultNextMonth.year)
  const [timezone, setTimezone] = useState(() => getLocalData('timezone') || getDefaultTimezone())
  const [selectedProductIds, setSelectedProductIds] = useState([])

  // Step 2 state: { [productId]: { [platform]: { postsPerWeek, accountId, accountHandle } } }
  const [frequency, setFrequency] = useState({})

  // Step 3 state
  const [proposedSlots, setProposedSlots] = useState([])
  const [blockedCount, setBlockedCount] = useState(0)
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    Promise.all([getAllProducts(), getAllAccounts(), getAllCalendarPosts()])
      .then(([prods, accs, posts]) => {
        setProducts(prods.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
        setAccounts(accs)
        setExistingPosts(posts)
        setLoading(false)
      })
  }, [])

  // ─── Step 1 helpers ───────────────────────────────────────────────────────────

  function toggleProduct(id) {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function handleStep1Next() {
    if (selectedProductIds.length === 0) return
    setLocalData('timezone', timezone)

    // Build default frequency config for selected products
    const defaultFreq = {}
    for (const pid of selectedProductIds) {
      const product = products.find(p => p.id === pid)
      if (!product) continue
      defaultFreq[pid] = {}
      for (const platform of (product.platforms || [])) {
        const linkedAccount = accounts.find(
          a => a.platform === platform && (product.accountIds || []).includes(a.id)
        )
        const rec = PLATFORM_FREQ_RANGE[platform]
        defaultFreq[pid][platform] = {
          postsPerWeek: rec ? rec.min : 3,
          accountId: linkedAccount?.id || null,
          accountHandle: linkedAccount?.handle || null,
        }
      }
    }
    setFrequency(defaultFreq)
    setStep(2)
  }

  // ─── Step 2 helpers ───────────────────────────────────────────────────────────

  function setPostsPerWeek(productId, platform, value) {
    setFrequency(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [platform]: { ...prev[productId][platform], postsPerWeek: value },
      },
    }))
  }

  function setAccountForPlatform(productId, platform, accountId) {
    const account = accounts.find(a => a.id === accountId)
    setFrequency(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [platform]: {
          ...prev[productId][platform],
          accountId,
          accountHandle: account?.handle || null,
        },
      },
    }))
  }

  function handleStep2Next() {
    // Generate proposed schedule
    const selectedProducts = products.filter(p => selectedProductIds.includes(p.id))
    const monthPosts = existingPosts.filter(p => p.monthKey === `${year}-${String(month + 1).padStart(2, '0')}`)
    const { slots, blockedCount: blocked } = generateSchedule({
      products: selectedProducts,
      year,
      month,
      frequency,
      existingPosts: monthPosts,
    })
    setProposedSlots(slots)
    setBlockedCount(blocked)
    setStep(3)
  }

  // ─── Step 3 helpers ───────────────────────────────────────────────────────────

  function deleteSlot(id) {
    setProposedSlots(prev => prev.filter(s => s.id !== id))
  }

  const collisions = useMemo(() => findInternalCollisions(proposedSlots), [proposedSlots])

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthExisting = existingPosts.filter(p => p.monthKey === monthKey)

  // Build calendar grid for review
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function slotsForDay(day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return proposedSlots.filter(s => s.date === dateStr)
  }

  function existingForDay(day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return monthExisting.filter(p => p.date === dateStr)
  }

  function productColorIndex(productId) {
    return selectedProductIds.indexOf(productId)
  }

  // ─── Step 4 — save ────────────────────────────────────────────────────────────

  async function handleConfirm() {
    setSaving(true)
    try {
      await Promise.all(proposedSlots.map(slot => saveCalendarPost(slot)))
      navigate('/calendar')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="planner-wrap">
        <div className="planner-loading"><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="planner-wrap">
      {/* Header */}
      <div className="planner-header">
        <button className="ps-back" onClick={() => step > 1 ? setStep(s => s - 1) : navigate('/calendar')}>
          ← {step > 1 ? 'Back' : 'Calendar'}
        </button>
        <div className="planner-steps">
          {['Setup', 'Frequency', 'Review', 'Confirm'].map((label, i) => (
            <div key={label} className={`planner-step-dot${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}`}>
              <span>{i + 1}</span>
              <span className="planner-step-label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 1: Setup ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="planner-body fade-in">
          <h2 className="planner-step-title">Setup</h2>
          <p className="planner-step-desc">Choose a month, your timezone, and which products to schedule.</p>

          {/* Month picker */}
          <div className="planner-section">
            <div className="planner-label">Month</div>
            <div className="planner-month-nav">
              <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
              <span className="planner-month-display">{MONTHS[month]} {year}</span>
              <button className="cal-nav-btn" onClick={nextMonth}>›</button>
            </div>
          </div>

          {/* Timezone */}
          <div className="planner-section">
            <div className="planner-label">Timezone</div>
            <input
              type="text"
              className="planner-input"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York"
            />
            <div className="planner-hint">Best-practice posting times will be shown in this timezone.</div>
          </div>

          {/* Product selection */}
          <div className="planner-section">
            <div className="planner-label">Products</div>
            {products.length === 0 ? (
              <div className="planner-empty-msg">
                No products yet.{' '}
                <button className="ps-link" onClick={() => navigate('/products/new')}>Create one →</button>
              </div>
            ) : (
              <div className="planner-product-list">
                {products.map((p, i) => {
                  const selected = selectedProductIds.includes(p.id)
                  const color = getProductColor(i)
                  return (
                    <div
                      key={p.id}
                      className={`planner-product-card${selected ? ' selected' : ''}`}
                      style={selected ? { borderColor: color.bg, background: color.light } : {}}
                      onClick={() => toggleProduct(p.id)}
                    >
                      <div
                        className="planner-product-color-bar"
                        style={{ background: color.bg }}
                      />
                      <div className="planner-product-info">
                        <div className="planner-product-name">{p.name}</div>
                        <div className="planner-product-platforms">
                          {(p.platforms || []).map(pl => (
                            <PlatformBadge key={pl} platform={pl} size={10} />
                          ))}
                        </div>
                      </div>
                      <div className={`planner-product-check${selected ? ' checked' : ''}`}>
                        {selected && '✓'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="planner-footer">
            <button
              className="btn btn-purple"
              onClick={handleStep1Next}
              disabled={selectedProductIds.length === 0}
            >
              Set frequency →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Frequency ─────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="planner-body fade-in">
          <h2 className="planner-step-title">Posting frequency</h2>
          <p className="planner-step-desc">Set how many times per week to post per platform. Recommended ranges shown inline.</p>

          {selectedProductIds.map((pid, pidIdx) => {
            const product = products.find(p => p.id === pid)
            if (!product) return null
            const color = getProductColor(pidIdx)
            const productFreq = frequency[pid] || {}

            return (
              <div key={pid} className="planner-freq-product">
                <div
                  className="planner-freq-product-header"
                  style={{ borderLeftColor: color.bg }}
                >
                  {product.name}
                </div>

                {(product.platforms || []).map(platform => {
                  const config = productFreq[platform] || {}
                  const rec = PLATFORM_FREQ_RANGE[platform]
                  const linkedAccounts = accounts.filter(
                    a => a.platform === platform && (product.accountIds || []).includes(a.id)
                  )
                  const postsPerWeek = config.postsPerWeek ?? rec?.min ?? 3

                  return (
                    <div key={platform} className="planner-freq-row">
                      <div className="planner-freq-platform">
                        <PlatformBadge platform={platform} size={12} />
                        <span>{platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                      </div>

                      {/* Account selector */}
                      {linkedAccounts.length === 0 ? (
                        <div className="planner-freq-no-account">No account linked</div>
                      ) : linkedAccounts.length === 1 ? (
                        <span className="planner-freq-account-label">@{linkedAccounts[0].handle}</span>
                      ) : (
                        <select
                          className="planner-freq-account-select"
                          value={config.accountId || ''}
                          onChange={e => setAccountForPlatform(pid, platform, e.target.value)}
                        >
                          {linkedAccounts.map(a => (
                            <option key={a.id} value={a.id}>@{a.handle}</option>
                          ))}
                        </select>
                      )}

                      {/* Stepper */}
                      <div className="planner-freq-stepper">
                        <button
                          className="planner-stepper-btn"
                          onClick={() => setPostsPerWeek(pid, platform, Math.max(1, postsPerWeek - 1))}
                        >−</button>
                        <span className="planner-stepper-val">{postsPerWeek}</span>
                        <button
                          className="planner-stepper-btn"
                          onClick={() => setPostsPerWeek(pid, platform, Math.min(7, postsPerWeek + 1))}
                        >+</button>
                      </div>

                      {/* Recommended range */}
                      {rec && (
                        <span className={`planner-freq-rec${postsPerWeek >= rec.min && postsPerWeek <= rec.max ? ' in-range' : ' out-range'}`}>
                          rec: {rec.rec}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          <div className="planner-footer">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-purple" onClick={handleStep2Next}>
              Preview schedule →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="planner-review fade-in">
          {/* Left: mini calendar */}
          <div className="planner-review-cal">
            <div className="planner-review-cal-header">
              <span className="planner-review-month">{MONTHS[month]} {year}</span>
              <span className="planner-status-bar">
                <span className="planner-status-placed">{proposedSlots.length} slots placed</span>
                {blockedCount > 0 && (
                  <span className="planner-status-blocked"> · {blockedCount} skipped (account busy)</span>
                )}
              </span>
            </div>

            {/* Legend */}
            <div className="planner-legend">
              {selectedProductIds.map((pid, i) => {
                const product = products.find(p => p.id === pid)
                const color = getProductColor(i)
                return (
                  <div key={pid} className="planner-legend-item">
                    <span className="planner-legend-dot" style={{ background: color.bg }} />
                    <span>{product?.name}</span>
                  </div>
                )
              })}
              {monthExisting.length > 0 && (
                <div className="planner-legend-item">
                  <span className="planner-legend-dot planner-legend-existing" />
                  <span>Existing</span>
                </div>
              )}
            </div>

            {/* Grid */}
            <div className="planner-mini-cal">
              <div className="planner-mini-days">
                {DAYS_SHORT.map(d => <div key={d} className="planner-mini-day-header">{d}</div>)}
              </div>
              <div className="planner-mini-grid">
                {cells.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} className="planner-mini-cell planner-mini-empty" />
                  const daySlots = slotsForDay(day)
                  const dayExisting = existingForDay(day)
                  const isSelected = selectedDay === day
                  return (
                    <div
                      key={day}
                      className={`planner-mini-cell${isSelected ? ' selected' : ''}${daySlots.length > 0 || dayExisting.length > 0 ? ' has-posts' : ''}`}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                    >
                      <span className="planner-mini-date">{day}</span>
                      <div className="planner-mini-chips">
                        {daySlots.slice(0, 3).map(s => {
                          const colorIdx = productColorIndex(s.productId)
                          const color = getProductColor(colorIdx)
                          const isCollision = collisions.has(`${s.accountId}|${s.date}`)
                          return (
                            <span
                              key={s.id}
                              className={`planner-mini-chip${isCollision ? ' collision' : ''}`}
                              style={{ background: color.bg }}
                              title={`@${s.accountHandle} · ${s.time}`}
                            />
                          )
                        })}
                        {dayExisting.slice(0, 2).map(p => (
                          <span key={p.id} className="planner-mini-chip existing" />
                        ))}
                        {(daySlots.length + dayExisting.length) > 4 && (
                          <span className="planner-mini-more">+{daySlots.length + dayExisting.length - 4}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right: day detail panel */}
          <div className="planner-review-panel">
            {selectedDay === null ? (
              <div className="planner-panel-empty">
                <div>Click a date to review its slots</div>
              </div>
            ) : (
              <>
                <div className="planner-panel-header">
                  {MONTHS[month]} {selectedDay}
                  <span className="planner-panel-count">
                    {slotsForDay(selectedDay).length} new · {existingForDay(selectedDay).length} existing
                  </span>
                </div>

                {existingForDay(selectedDay).length > 0 && (
                  <div className="planner-panel-section-label">Existing posts</div>
                )}
                {existingForDay(selectedDay).map(p => (
                  <div key={p.id} className="planner-panel-slot existing">
                    <PlatformBadge platform={p.platform} size={11} />
                    <div className="planner-slot-info">
                      <span className="planner-slot-handle">@{p.accountHandle}</span>
                      {p.time && <span className="planner-slot-time">{formatTime12(p.time)}</span>}
                    </div>
                    <span className="planner-slot-existing-label">existing</span>
                  </div>
                ))}

                {slotsForDay(selectedDay).length > 0 && (
                  <div className="planner-panel-section-label">Proposed slots</div>
                )}
                {slotsForDay(selectedDay).map(slot => {
                  const colorIdx = productColorIndex(slot.productId)
                  const color = getProductColor(colorIdx)
                  const isCollision = collisions.has(`${slot.accountId}|${slot.date}`)
                  return (
                    <div key={slot.id} className={`planner-panel-slot${isCollision ? ' collision' : ''}`}>
                      <div className="planner-slot-color-bar" style={{ background: color.bg }} />
                      <PlatformBadge platform={slot.platform} size={11} />
                      <div className="planner-slot-info">
                        <span className="planner-slot-handle">@{slot.accountHandle}</span>
                        <span className="planner-slot-time">{formatTime12(slot.time)}</span>
                        {slot.angle && (
                          <span className="planner-slot-angle" title={slot.angle}>
                            {slot.angle.length > 50 ? slot.angle.slice(0, 50) + '…' : slot.angle}
                          </span>
                        )}
                        {isCollision && (
                          <span className="planner-collision-warn">⚠ Same account posted twice today</span>
                        )}
                      </div>
                      <button
                        className="planner-slot-delete"
                        onClick={() => deleteSlot(slot.id)}
                        title="Remove slot"
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  )
                })}

                {slotsForDay(selectedDay).length === 0 && existingForDay(selectedDay).length === 0 && (
                  <div className="planner-panel-empty-day">No posts on this day.</div>
                )}
              </>
            )}
          </div>

          <div className="planner-review-footer">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button
              className="btn btn-purple"
              onClick={() => setStep(4)}
              disabled={proposedSlots.length === 0}
            >
              Review summary →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Confirm ───────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="planner-body fade-in">
          <h2 className="planner-step-title">Confirm schedule</h2>
          <p className="planner-step-desc">
            {proposedSlots.length} posts across{' '}
            {selectedProductIds.length} product{selectedProductIds.length > 1 ? 's' : ''},{' '}
            {[...new Set(proposedSlots.map(s => s.platform))].length} platform{[...new Set(proposedSlots.map(s => s.platform))].length > 1 ? 's' : ''}.
            {proposedSlots.length > 0 && ` First post: ${formatTime12(proposedSlots[0].time)} on ${proposedSlots[0].date}.`}
          </p>

          <div className="planner-confirm-list">
            {selectedProductIds.map((pid, pidIdx) => {
              const product = products.find(p => p.id === pid)
              const productSlots = proposedSlots.filter(s => s.productId === pid)
              const color = getProductColor(pidIdx)
              if (productSlots.length === 0) return null
              return (
                <div key={pid} className="planner-confirm-product">
                  <div
                    className="planner-confirm-product-name"
                    style={{ borderLeftColor: color.bg }}
                  >
                    {product?.name}
                    <span className="planner-confirm-count">{productSlots.length} posts</span>
                  </div>
                  <div className="planner-confirm-breakdown">
                    {Object.entries(
                      productSlots.reduce((acc, s) => {
                        acc[s.platform] = (acc[s.platform] || 0) + 1
                        return acc
                      }, {})
                    ).map(([platform, count]) => (
                      <div key={platform} className="planner-confirm-platform-row">
                        <PlatformBadge platform={platform} size={11} />
                        <span>{count} post{count > 1 ? 's' : ''}</span>
                        <span className="planner-confirm-tz">· {timezone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="planner-confirm-note">
            All slots will be saved as <strong>drafts</strong>. Open any draft from the Calendar to write copy in the Content Studio.
          </div>

          {blockedCount > 0 && (
            <div className="planner-confirm-blocked">
              {blockedCount} slot{blockedCount > 1 ? 's were' : ' was'} skipped — {blockedCount > 1 ? 'those accounts were' : 'that account was'} already scheduled on those days.
            </div>
          )}

          <div className="planner-footer">
            <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
            <button
              className="btn btn-teal"
              onClick={handleConfirm}
              disabled={saving || proposedSlots.length === 0}
            >
              {saving
                ? <><div className="spinner" style={{ width: 12, height: 12, borderTopColor: 'white' }} /> Saving…</>
                : `Save ${proposedSlots.length} draft${proposedSlots.length !== 1 ? 's' : ''} to calendar`
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
