import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getProduct, getAllAccounts, updateProduct, saveCalendarPost, updateCalendarPost } from '../../services/storage'
import { generateMultiAccountDrafts, regenerateDraft, getTrendBrief, isGeminiInitialized } from '../../services/gemini'
import { useApp } from '../../context/AppContext'
import { PlatformBadge, RefreshIcon, CheckIcon, CloseIcon } from '../../components/Icons'
import './ContentStudio.css'

const TONE_PRESETS = [
  { value: 'educator', label: 'Educator', desc: 'Informative, semi-formal' },
  { value: 'puncher', label: 'Puncher', desc: 'Short, opinionated' },
  { value: 'helper', label: 'Helper', desc: 'Friendly, community-oriented' },
  { value: 'jester', label: 'Jester', desc: 'Funny, casual' },
  { value: 'closer', label: 'Closer', desc: 'Persuasive, action-driven' },
  { value: 'storyteller', label: 'Storyteller', desc: 'Narrative, personal' },
  { value: 'neutral', label: 'Neutral', desc: 'No style constraint' },
]

export function ContentStudio() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { setShowApiKeyModal } = useApp()

  // Slot handoff from calendar draft (location.state set by Calendar "Write in Studio →")
  const slotHandoff = location.state?.slotId ? location.state : null

  const [product, setProduct] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  // Step state
  const [angle, setAngle] = useState('')
  const [angleInput, setAngleInput] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [accountTones, setAccountTones] = useState({}) // { accountId: tonePreset }
  const [drafts, setDrafts] = useState({}) // { accountId: { text, status: 'pending'|'approved'|'needs_work', generating } }
  const [activeTab, setActiveTab] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [briefRefreshing, setBriefRefreshing] = useState(false)

  // Save to calendar modal
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveDate, setSaveDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [p, accs] = await Promise.all([getProduct(productId), getAllAccounts()])
      setProduct(p)
      // Only accounts linked to this product
      const linked = accs.filter(a => (p?.accountIds || []).includes(a.id))
      setAccounts(linked)
      // Pre-populate tones from account defaults
      const tones = {}
      linked.forEach(a => { tones[a.id] = a.tonePreset || 'neutral' })
      setAccountTones(tones)

      // If arriving from a calendar draft slot, pre-fill angle + pre-select account
      if (slotHandoff) {
        if (slotHandoff.angle) {
          setAngle(slotHandoff.angle)
          setAngleInput(slotHandoff.angle)
        }
        if (slotHandoff.accountId) {
          setSelectedAccountIds([slotHandoff.accountId])
        }
        if (slotHandoff.date) {
          setSaveDate(slotHandoff.date)
        }
      }

      setLoading(false)
    }
    load()
  }, [productId])

  const brief = product?.trendBrief
  const briefStale = brief && (Date.now() - new Date(brief.fetchedAt)) > 24 * 3_600_000

  async function refreshBrief() {
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }
    setBriefRefreshing(true)
    try {
      const newBrief = await getTrendBrief({
        name: product.name,
        problemStatement: product.problemStatement,
        targetPersona: product.targetPersona,
      })
      const updated = await updateProduct(productId, { trendBrief: newBrief })
      setProduct(updated)
    } catch (e) {
      console.error(e)
    } finally {
      setBriefRefreshing(false)
    }
  }

  function selectAngle(a) {
    setAngle(a)
    setAngleInput(a)
  }

  function toggleAccount(id) {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function setTone(accountId, tone) {
    setAccountTones(prev => ({ ...prev, [accountId]: tone }))
  }

  async function handleGenerate() {
    if (!angle.trim()) return
    if (selectedAccountIds.length === 0) return
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }

    setGenerating(true)
    // Init draft states
    const initDrafts = {}
    selectedAccountIds.forEach(id => {
      initDrafts[id] = { text: '', status: 'pending', generating: true }
    })
    setDrafts(initDrafts)
    setActiveTab(selectedAccountIds[0])

    const selectedAccounts = accounts
      .filter(a => selectedAccountIds.includes(a.id))
      .map(a => ({ ...a, tonePreset: accountTones[a.id] || a.tonePreset || 'neutral' }))

    const results = await generateMultiAccountDrafts({
      angle: angle.trim(),
      accounts: selectedAccounts,
      product,
    })

    const newDrafts = {}
    results.forEach(r => {
      newDrafts[r.accountId] = {
        text: r.draft || '',
        status: r.error ? 'needs_work' : 'pending',
        generating: false,
        error: r.error,
      }
    })
    setDrafts(newDrafts)
    setGenerating(false)
  }

  async function handleRegenerate(accountId) {
    const account = accounts.find(a => a.id === accountId)
    if (!account) return
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }

    // Warn if edited
    if (drafts[accountId]?.text && !confirm('Your edits will be lost. Regenerate?')) return

    setDrafts(prev => ({ ...prev, [accountId]: { ...prev[accountId], generating: true, error: null } }))
    try {
      const text = await regenerateDraft({
        angle: angle.trim(),
        account: { ...account, tonePreset: accountTones[accountId] || account.tonePreset || 'neutral' },
        product,
      })
      setDrafts(prev => ({ ...prev, [accountId]: { text, status: 'pending', generating: false } }))
    } catch (e) {
      setDrafts(prev => ({ ...prev, [accountId]: { ...prev[accountId], generating: false, error: e.message } }))
    }
  }

  function setDraftText(accountId, text) {
    setDrafts(prev => ({ ...prev, [accountId]: { ...prev[accountId], text } }))
  }

  function setDraftStatus(accountId, status) {
    setDrafts(prev => ({ ...prev, [accountId]: { ...prev[accountId], status } }))
  }

  const allApproved =
    selectedAccountIds.length > 0 &&
    selectedAccountIds.every(id => drafts[id]?.status === 'approved')

  async function handleSaveToCalendar() {
    if (!saveDate) return
    setSaving(true)
    try {
      const monthKey = saveDate.slice(0, 7)
      const approvedIds = selectedAccountIds.filter(id => drafts[id]?.status === 'approved')

      await Promise.all(
        approvedIds.map((id, i) => {
          const account = accounts.find(a => a.id === id)
          const copy = drafts[id].text

          // If arriving from a draft slot for this account, update it rather than create new
          if (slotHandoff?.slotId && slotHandoff.accountId === id) {
            return updateCalendarPost(slotHandoff.slotId, {
              copy,
              angle: angle.trim(),
              tonePreset: accountTones[id] || 'neutral',
              date: saveDate,
              monthKey,
              status: 'ready',
            })
          }

          return saveCalendarPost({
            productId,
            accountId: id,
            platform: account?.platform,
            accountHandle: account?.handle,
            copy,
            angle: angle.trim(),
            tonePreset: accountTones[id] || 'neutral',
            date: saveDate,
            monthKey,
            scheduledOffset: i,
            status: 'ready',
          })
        })
      )
      setShowSaveModal(false)
      navigate('/calendar')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="cs-wrap"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><div className="spinner" /></div></div>
  }

  if (!product) {
    return <div className="cs-wrap"><div className="cs-notfound">Product not found. <button className="ps-link" onClick={() => navigate('/products')}>Back to products</button></div></div>
  }

  const hasDrafts = selectedAccountIds.some(id => drafts[id]?.text)
  const activeAccount = accounts.find(a => a.id === activeTab)
  const activeDraft = drafts[activeTab]

  return (
    <div className="cs-wrap">
      {/* Left panel — brief + angle + accounts */}
      <div className="cs-left">
        <div className="cs-product-header">
          <div className="cs-product-header-top">
            <button className="ps-back" onClick={() => navigate('/products')}>← Products</button>
            <button className="cs-edit-link" onClick={() => navigate(`/products/${productId}`)}>Edit settings</button>
          </div>
          <div className="cs-product-name">{product.name}</div>
          <div className="cs-product-meta">{product.targetPersona}</div>
        </div>

        {/* Trend brief */}
        <div className="cs-section">
          <div className="cs-section-title">
            Trend brief
            {briefStale && (
              <button
                className="cs-refresh-btn"
                onClick={refreshBrief}
                disabled={briefRefreshing}
                title="Refresh trend brief"
              >
                <RefreshIcon size={12} />
                {briefRefreshing ? 'Refreshing…' : 'Stale — refresh'}
              </button>
            )}
          </div>

          {!brief && !briefRefreshing && (
            <div className="cs-brief-empty">
              Brief loading…{' '}
              <button className="ps-link" onClick={refreshBrief}>Fetch now</button>
            </div>
          )}
          {briefRefreshing && <div className="cs-brief-loading"><div className="spinner" /></div>}

          {brief && !briefRefreshing && (
            <>
              {brief.topics?.length > 0 && (
                <div className="cs-brief-topics">
                  {brief.topics.map((t, i) => (
                    <div key={i} className="cs-topic">
                      <div className="cs-topic-title">{t.title}</div>
                      <div className="cs-topic-why">{t.why}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Angle picker */}
        <div className="cs-section">
          <div className="cs-section-title">Post angle <span className="cs-required">required</span></div>
          {brief?.angles?.length > 0 && (
            <div className="cs-angles">
              {brief.angles.map((a, i) => (
                <button
                  key={i}
                  className={`cs-angle-btn${angle === a ? ' selected' : ''}`}
                  onClick={() => selectAngle(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            className="cs-angle-input"
            placeholder="Or type your own angle…"
            value={angleInput}
            onChange={e => { setAngleInput(e.target.value); setAngle(e.target.value) }}
          />
        </div>

        {/* Account selection (only shown once angle is set) */}
        {angle.trim() && (
          <div className="cs-section">
            <div className="cs-section-title">Accounts</div>
            {accounts.length === 0 ? (
              <div className="cs-no-accounts">
                No accounts linked to this product.{' '}
                <button className="ps-link" onClick={() => navigate(`/products/${productId}`)}>Edit product →</button>
              </div>
            ) : (
              <div className="cs-account-list">
                {accounts.map(a => {
                  const selected = selectedAccountIds.includes(a.id)
                  return (
                    <div key={a.id} className={`cs-account-item${selected ? ' selected' : ''}`}>
                      <div className="cs-account-top" onClick={() => toggleAccount(a.id)}>
                        <div className="cs-account-check">{selected && <CheckIcon size={10} />}</div>
                        <PlatformBadge platform={a.platform} size={11} />
                        <span className="cs-account-handle">@{a.handle}</span>
                        {a.persona
                          ? <span className="cs-persona-indicator" title={a.persona}>persona</span>
                          : null
                        }
                      </div>
                      {selected && !a.persona && (
                        <div className="cs-tone-row">
                          <span className="cs-tone-label">Voice:</span>
                          <select
                            value={accountTones[a.id] || 'neutral'}
                            onChange={e => setTone(a.id, e.target.value)}
                            className="cs-tone-select"
                          >
                            {TONE_PRESETS.map(t => (
                              <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Generate button */}
        {angle.trim() && selectedAccountIds.length > 0 && (
          <div className="cs-generate-area">
            <button
              className="btn btn-purple cs-generate-btn"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating
                ? <><div className="spinner" style={{ width: 13, height: 13, borderTopColor: 'white' }} /> Generating…</>
                : `Generate ${selectedAccountIds.length} draft${selectedAccountIds.length > 1 ? 's' : ''}`
              }
            </button>
          </div>
        )}
      </div>

      {/* Right panel — draft review */}
      <div className="cs-right">
        {!hasDrafts ? (
          <div className="cs-drafts-empty">
            <div className="cs-drafts-empty-icon">✍️</div>
            <div className="cs-drafts-empty-title">No drafts yet</div>
            <div className="cs-drafts-empty-desc">
              Pick an angle, select accounts, and hit Generate to create drafts for each account.
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="cs-tabs">
              {selectedAccountIds.map(id => {
                const acc = accounts.find(a => a.id === id)
                const d = drafts[id]
                return (
                  <button
                    key={id}
                    className={`cs-tab${activeTab === id ? ' active' : ''} ${d?.status || ''}`}
                    onClick={() => setActiveTab(id)}
                  >
                    {acc && <PlatformBadge platform={acc.platform} size={10} />}
                    <span>@{acc?.handle || id.slice(0, 8)}</span>
                    {d?.status === 'approved' && <span className="cs-tab-dot approved" />}
                    {d?.status === 'needs_work' && <span className="cs-tab-dot needs_work" />}
                    {d?.generating && <div className="spinner" style={{ width: 10, height: 10 }} />}
                  </button>
                )
              })}
            </div>

            {/* Active draft */}
            {activeTab && (
              <div className="cs-draft-panel fade-in">
                {activeDraft?.generating ? (
                  <div className="cs-draft-loading">
                    <div className="spinner" />
                    <span>Generating for @{activeAccount?.handle}…</span>
                  </div>
                ) : activeDraft?.error ? (
                  <div className="cs-draft-error">
                    <div>Generation failed: {activeDraft.error}</div>
                    <button className="btn btn-ghost" onClick={() => handleRegenerate(activeTab)}>Retry</button>
                  </div>
                ) : (
                  <>
                    <div className="cs-draft-meta">
                      <PlatformBadge platform={activeAccount?.platform} size={12} />
                      <span className="cs-draft-account">@{activeAccount?.handle}</span>
                      {activeAccount?.persona
                        ? <span className="cs-voice-label">Persona</span>
                        : <span className="cs-voice-label">{accountTones[activeTab] || 'neutral'}</span>
                      }
                    </div>

                    <textarea
                      className="cs-draft-text"
                      value={activeDraft?.text || ''}
                      onChange={e => setDraftText(activeTab, e.target.value)}
                      placeholder="Draft will appear here…"
                    />

                    <div className="cs-draft-actions">
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleRegenerate(activeTab)}
                        disabled={activeDraft?.generating}
                      >
                        <RefreshIcon size={12} /> Regenerate
                      </button>
                      <div className="cs-draft-status-btns">
                        <button
                          className={`cs-status-btn needs-work${activeDraft?.status === 'needs_work' ? ' active' : ''}`}
                          onClick={() => setDraftStatus(activeTab, 'needs_work')}
                        >
                          <CloseIcon size={11} /> Needs work
                        </button>
                        <button
                          className={`cs-status-btn approve${activeDraft?.status === 'approved' ? ' active' : ''}`}
                          onClick={() => setDraftStatus(activeTab, 'approved')}
                        >
                          <CheckIcon size={11} /> Approve
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Save to calendar */}
            {allApproved && (
              <div className="cs-save-bar fade-in">
                <div className="cs-save-bar-text">
                  All {selectedAccountIds.length} draft{selectedAccountIds.length > 1 ? 's' : ''} approved
                </div>
                <button className="btn btn-teal" onClick={() => setShowSaveModal(true)}>
                  Save to Calendar →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Save to Calendar modal */}
      {showSaveModal && (
        <div className="cs-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="cs-modal" onClick={e => e.stopPropagation()}>
            <div className="cs-modal-header">
              <h2>Save to Calendar</h2>
              <button className="ah-close" onClick={() => setShowSaveModal(false)}>
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="cs-modal-body">
              <p className="cs-modal-desc">
                {selectedAccountIds.filter(id => drafts[id]?.status === 'approved').length} approved post{selectedAccountIds.filter(id => drafts[id]?.status === 'approved').length > 1 ? 's' : ''} will be saved to the calendar.
              </p>
              <div className="ps-field">
                <label className="ps-label">Publish date</label>
                <input
                  type="date"
                  value={saveDate}
                  onChange={e => setSaveDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="cs-modal-accounts">
                {selectedAccountIds
                  .filter(id => drafts[id]?.status === 'approved')
                  .map((id, i) => {
                    const acc = accounts.find(a => a.id === id)
                    return (
                      <div key={id} className="cs-modal-account-row">
                        <PlatformBadge platform={acc?.platform} size={11} />
                        <span>@{acc?.handle}</span>
                        {i > 0 && <span className="cs-stagger-hint">+{i * 45}min stagger</span>}
                      </div>
                    )
                  })}
              </div>
            </div>
            <div className="cs-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button
                className="btn btn-teal"
                onClick={handleSaveToCalendar}
                disabled={!saveDate || saving}
              >
                {saving ? 'Saving…' : 'Confirm & save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
