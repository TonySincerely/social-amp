import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getProduct, getAllAccounts, updateProduct, saveCalendarPost, updateCalendarPost, getAllPlatformConfigs, seedPlatformDefaults } from '../../services/storage'
import { generateMultiAccountDrafts, regenerateDraft, getTrendBrief, generatePostImage } from '../../services/gemini'
import { PlatformBadge, RefreshIcon, CheckIcon, CloseIcon } from '../../components/Icons'
import { MOOD_PRESETS } from '../../data/visualPresets'
import { langShort } from '../../data/languages'
import './ContentStudio.css'

function getImageAspectStyle(platform) {
  if (['instagram', 'pinterest'].includes(platform)) return { aspectRatio: '3/4', maxHeight: 380 }
  if (platform === 'x') return { aspectRatio: '16/9' }
  return { aspectRatio: '1/1', maxHeight: 420 }
}

// Resolve which languages to generate for a given account, falling back to product then English
function resolveAccountLanguages(account, product) {
  if (account.languages?.length > 0) return account.languages
  if (product?.languages?.length > 0) return product.languages
  return ['English']
}

// Compute draft slots: one per account × language combination
function buildDraftSlots(selectedAccountIds, accounts, product) {
  return selectedAccountIds.flatMap(accountId => {
    const account = accounts.find(a => a.id === accountId)
    if (!account) return []
    const langs = resolveAccountLanguages(account, product)
    return langs.map(language => ({
      accountId,
      language,
      key: `${accountId}::${language}`,
    }))
  })
}

function parseSlotKey(key) {
  const idx = key.indexOf('::')
  if (idx === -1) return { accountId: key, language: 'English' }
  return { accountId: key.slice(0, idx), language: key.slice(idx + 2) }
}

export function ContentStudio() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const slotHandoff = location.state?.slotId ? location.state : null
  const prefillPost = location.state?.prefillPost ? location.state.prefillPost : null
  const pulseHandoff = !location.state?.slotId && !location.state?.prefillPost && location.state?.angle
    ? location.state : null

  const [product, setProduct] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [platformConfigs, setPlatformConfigs] = useState({})
  const [loading, setLoading] = useState(true)

  // Step state
  const [angle, setAngle] = useState('')
  const [angleInput, setAngleInput] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [identity, setIdentity] = useState('random_guy')
  const [postTone, setPostTone] = useState('promoting')
  const [drafts, setDrafts] = useState({})   // keyed by slotKey (accountId::language)
  const [activeTab, setActiveTab] = useState(null) // a slotKey
  const [generating, setGenerating] = useState(false)
  const [briefRefreshing, setBriefRefreshing] = useState(false)
  const [briefOpen, setBriefOpen] = useState(true)

  // Visual descriptor state
  const [visualTones, setVisualTones] = useState([])
  const [preferredColors, setPreferredColors] = useState([])
  const [visualToneInput, setVisualToneInput] = useState('')
  const [colorInput, setColorInput] = useState('')
  const [visualOpen, setVisualOpen] = useState(false)
  const [imageStates, setImageStates] = useState({}) // keyed by slotKey

  // Save to calendar modal
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveDate, setSaveDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    async function load() {
      await seedPlatformDefaults()
      const [p, accs, allConfigs] = await Promise.all([
        getProduct(productId),
        getAllAccounts(),
        getAllPlatformConfigs(),
      ])
      setProduct(p)
      const linked = accs.filter(a => (p?.accountIds || []).includes(a.id))
      setAccounts(linked)
      const cfgMap = {}
      allConfigs.forEach(c => { cfgMap[c.platform] = c })
      setPlatformConfigs(cfgMap)

      if (p?.visualTones?.length > 0) setVisualTones(p.visualTones)
      if (p?.preferredColors?.length > 0) setPreferredColors(p.preferredColors)

      if (slotHandoff) {
        if (slotHandoff.angle) { setAngle(slotHandoff.angle); setAngleInput(slotHandoff.angle) }
        if (slotHandoff.accountId) setSelectedAccountIds([slotHandoff.accountId])
        if (slotHandoff.date) setSaveDate(slotHandoff.date)
      }

      if (pulseHandoff?.angle) {
        setAngle(pulseHandoff.angle)
        setAngleInput(pulseHandoff.angle)
      }

      if (prefillPost) {
        const { angle: a, identity: id, postTone: pt, accountId, date, copy } = prefillPost
        if (a) { setAngle(a); setAngleInput(a) }
        if (id) setIdentity(id)
        if (pt) setPostTone(pt)
        if (accountId) {
          setSelectedAccountIds([accountId])
          // Use English as default slot key for prefill
          const slotKey = `${accountId}::English`
          setActiveTab(slotKey)
          if (copy) setDrafts({ [slotKey]: { text: copy, status: 'approved', generating: false } })
        }
        if (date) setSaveDate(date)
      }

      setLoading(false)
    }
    load()
  }, [productId])

  const brief = product?.trendBrief
  const briefStale = brief && (Date.now() - new Date(brief.fetchedAt)) > 24 * 3_600_000

  async function refreshBrief() {
    setBriefRefreshing(true)
    try {
      const newBrief = await getTrendBrief({
        name: product.name,
        problemStatement: product.problemStatement,
        targetPersona: product.targetPersona,
        ksp: product.ksp,
      })
      const updated = await updateProduct(productId, { trendBrief: newBrief })
      setProduct(updated)
    } catch (e) {
      console.error(e)
    } finally {
      setBriefRefreshing(false)
    }
  }

  function selectAngle(a) { setAngle(a); setAngleInput(a) }

  function toggleAccount(id) {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleVisualTone(tone) {
    setVisualTones(prev => prev.includes(tone) ? prev.filter(t => t !== tone) : [...prev, tone])
  }

  function addCustomTone() {
    const v = visualToneInput.trim()
    if (!v || visualTones.includes(v)) return
    setVisualTones(prev => [...prev, v])
    setVisualToneInput('')
  }

  function addColor() {
    const v = colorInput.trim()
    if (!v || preferredColors.includes(v)) return
    setPreferredColors(prev => [...prev, v])
    setColorInput('')
  }

  async function handleGenerate() {
    if (!angle.trim() || selectedAccountIds.length === 0) return

    const slots = buildDraftSlots(selectedAccountIds, accounts, product)
    if (slots.length === 0) return

    setGenerating(true)
    const initDrafts = {}
    slots.forEach(slot => { initDrafts[slot.key] = { text: '', status: 'pending', generating: true } })
    setDrafts(initDrafts)
    setActiveTab(slots[0].key)

    const platformPractices = {}
    const platformLimits = {}
    Object.entries(platformConfigs).forEach(([platform, cfg]) => {
      const active = (cfg.strategies || []).find(s => s.id === cfg.selectedStrategyId)
      platformPractices[platform] = active
        ? (active.directives?.length > 0 ? active.directives : [active.content])
        : []
      platformLimits[platform] = cfg.limits || null
    })

    // Enrich accounts with resolved language per slot
    const accountsForGeneration = slots.map(slot => {
      const account = accounts.find(a => a.id === slot.accountId)
      return { ...account, resolvedLanguage: slot.language, _slotKey: slot.key }
    })

    const results = await generateMultiAccountDrafts({
      angle: angle.trim(),
      accounts: accountsForGeneration,
      product,
      identity,
      postTone,
      platformPractices,
      platformLimits,
      visualDescriptors: [...visualTones, ...preferredColors],
    })

    const newDrafts = {}
    results.forEach((r, i) => {
      const slotKey = accountsForGeneration[i]._slotKey
      newDrafts[slotKey] = {
        text: r.draft || '',
        status: r.error ? 'needs_work' : 'pending',
        generating: false,
        error: r.error,
      }
    })
    setDrafts(newDrafts)
    setGenerating(false)
  }

  async function handleRegenerate(slotKey) {
    const { accountId, language } = parseSlotKey(slotKey)
    const account = accounts.find(a => a.id === accountId)
    if (!account) return

    if (drafts[slotKey]?.text && !confirm('Your edits will be lost. Regenerate?')) return

    setDrafts(prev => ({ ...prev, [slotKey]: { ...prev[slotKey], generating: true, error: null } }))
    try {
      const cfg = platformConfigs[account.platform]
      const activeStrategy = (cfg?.strategies || []).find(s => s.id === cfg?.selectedStrategyId)
      const practices = activeStrategy
        ? (activeStrategy.directives?.length > 0 ? activeStrategy.directives : [activeStrategy.content])
        : []
      const text = await regenerateDraft({
        angle: angle.trim(),
        account,
        product,
        identity,
        postTone,
        practices,
        limits: cfg?.limits || null,
        visualDescriptors: [...visualTones, ...preferredColors],
        language,
      })
      setDrafts(prev => ({ ...prev, [slotKey]: { text, status: 'pending', generating: false } }))
    } catch (e) {
      setDrafts(prev => ({ ...prev, [slotKey]: { ...prev[slotKey], generating: false, error: e.message } }))
    }
  }

  async function handleGenerateImage(slotKey) {
    const { accountId } = parseSlotKey(slotKey)
    const account = accounts.find(a => a.id === accountId)
    const draftText = drafts[slotKey]?.text
    if (!draftText?.trim() || !account) return

    setImageStates(prev => ({ ...prev, [slotKey]: { generating: true } }))
    try {
      const result = await generatePostImage({
        postCopy: draftText,
        visualTones,
        preferredColors,
        platform: account.platform,
        productName: product.name,
      })
      setImageStates(prev => ({ ...prev, [slotKey]: { generating: false, ...result } }))
    } catch (e) {
      setImageStates(prev => ({ ...prev, [slotKey]: { generating: false, error: e.message } }))
    }
  }

  function setDraftText(slotKey, text) {
    setDrafts(prev => ({ ...prev, [slotKey]: { ...prev[slotKey], text } }))
  }

  function setDraftStatus(slotKey, status) {
    setDrafts(prev => ({ ...prev, [slotKey]: { ...prev[slotKey], status } }))
  }

  async function handleSaveToCalendar() {
    if (!saveDate) return
    setSaving(true)
    try {
      const monthKey = saveDate.slice(0, 7)
      const slots = buildDraftSlots(selectedAccountIds, accounts, product)
      const approvedSlots = slots.filter(slot => drafts[slot.key]?.status === 'approved')

      await Promise.all(
        approvedSlots.map((slot, i) => {
          const account = accounts.find(a => a.id === slot.accountId)
          const copy = drafts[slot.key].text

          if (slotHandoff?.slotId && slotHandoff.accountId === slot.accountId) {
            return updateCalendarPost(slotHandoff.slotId, {
              copy, angle: angle.trim(), identity, postTone,
              date: saveDate, monthKey, status: 'ready',
            })
          }

          return saveCalendarPost({
            productId,
            accountId: slot.accountId,
            platform: account?.platform,
            accountHandle: account?.handle,
            copy,
            angle: angle.trim(),
            identity,
            postTone,
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
      setSaveError(e.message || 'Save failed. Try again.')
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

  // Derived values
  const draftSlots = buildDraftSlots(selectedAccountIds, accounts, product)
  const hasDrafts = draftSlots.some(slot => drafts[slot.key]?.text)
  const allApproved = draftSlots.length > 0 && draftSlots.every(slot => drafts[slot.key]?.status === 'approved')
  const visualDescriptorCount = visualTones.length + preferredColors.length

  const activeSlot = draftSlots.find(s => s.key === activeTab)
  const activeAccount = activeSlot ? accounts.find(a => a.id === activeSlot.accountId) : null
  const activeDraft = activeTab ? drafts[activeTab] : null
  const activeImageState = activeTab ? imageStates[activeTab] : null

  // For tab labels: show language short code only when an account has >1 language slot
  const accountSlotCount = {}
  draftSlots.forEach(s => { accountSlotCount[s.accountId] = (accountSlotCount[s.accountId] || 0) + 1 })

  return (
    <div className="cs-wrap">
      {/* Left panel */}
      <div className="cs-left">
        <div className="cs-product-header">
          <div className="cs-product-header-top">
            <button className="ps-back" onClick={() => navigate('/products')}>← Products</button>
            <button className="cs-edit-link" onClick={() => navigate(`/products/${productId}`)}>Edit settings</button>
          </div>
          <div className="cs-product-name">{product.name}</div>
          <div className="cs-product-meta">{product.targetPersona}</div>
        </div>

        {/* Context bar */}
        <div className="cs-context-bar">
          <div className="cs-context-field">
            <label className="cs-context-label">Identity</label>
            <select className="cs-context-select" value={identity} onChange={e => setIdentity(e.target.value)}>
              <option value="random_guy">Random user</option>
              <option value="founder">Founder</option>
            </select>
          </div>
          <div className="cs-context-field">
            <label className="cs-context-label">Tone</label>
            <select className="cs-context-select" value={postTone} onChange={e => setPostTone(e.target.value)}>
              <option value="promoting">Promoting</option>
              <option value="showcasing">Showcasing</option>
              <option value="discussing">Discussing</option>
              <option value="questioning">Questioning</option>
              <option value="jesting">Jesting</option>
            </select>
          </div>
        </div>

        {/* Visual descriptors */}
        <div className="cs-section">
          <div className="cs-section-title cs-section-title--toggle" onClick={() => setVisualOpen(o => !o)}>
            <span className={`cs-collapse-arrow${visualOpen ? ' open' : ''}`}>›</span>
            Visual
            {visualDescriptorCount > 0 && (
              <span className="cs-visual-count">{visualDescriptorCount}</span>
            )}
          </div>
          {visualOpen && (
            <>
              <div className="cs-visual-presets">
                {MOOD_PRESETS.map(m => (
                  <button
                    key={m}
                    className={`cs-visual-preset${visualTones.includes(m) ? ' selected' : ''}`}
                    onClick={() => toggleVisualTone(m)}
                  >{m}</button>
                ))}
              </div>
              <div className="cs-visual-input-row">
                <input
                  type="text"
                  className="cs-angle-input"
                  placeholder="Custom mood or style…"
                  value={visualToneInput}
                  onChange={e => setVisualToneInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTone() } }}
                />
                <button className="cs-visual-add" onClick={addCustomTone} disabled={!visualToneInput.trim()}>+</button>
              </div>
              <div className="cs-visual-sublabel">Colors</div>
              <div className="cs-visual-input-row">
                <input
                  type="text"
                  className="cs-angle-input"
                  placeholder="e.g. warm ivory, deep navy…"
                  value={colorInput}
                  onChange={e => setColorInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColor() } }}
                />
                <button className="cs-visual-add" onClick={addColor} disabled={!colorInput.trim()}>+</button>
              </div>
              {(visualTones.length > 0 || preferredColors.length > 0) && (
                <div className="cs-visual-active-chips">
                  {visualTones.map(t => (
                    <span key={t} className="cs-visual-chip">
                      {t}
                      <button onClick={() => setVisualTones(prev => prev.filter(x => x !== t))}>×</button>
                    </span>
                  ))}
                  {preferredColors.map(c => (
                    <span key={c} className="cs-visual-chip cs-visual-chip--color">
                      {c}
                      <button onClick={() => setPreferredColors(prev => prev.filter(x => x !== c))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Trend brief */}
        <div className="cs-section">
          <div className="cs-section-title cs-section-title--toggle" onClick={() => setBriefOpen(o => !o)}>
            <span className={`cs-collapse-arrow${briefOpen ? ' open' : ''}`}>›</span>
            Trend brief
            {briefStale && <span className="cs-brief-stale-dot" title="Brief is stale" />}
            <button
              className="cs-refresh-btn cs-refresh-btn--inline"
              onClick={e => { e.stopPropagation(); refreshBrief() }}
              disabled={briefRefreshing}
              title={briefRefreshing ? 'Refreshing…' : brief ? (briefStale ? 'Stale — refresh' : 'Refresh') : 'Fetch brief'}
            >
              <RefreshIcon size={11} />
            </button>
          </div>
          {briefOpen && (
            <>
              {briefRefreshing && <div className="cs-brief-loading"><div className="spinner" /></div>}
              {!brief && !briefRefreshing && (
                <div className="cs-brief-empty">No brief yet — hit the refresh button to fetch.</div>
              )}
              {brief && !briefRefreshing && brief.topics?.length > 0 && (
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
                >{a}</button>
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

        {/* Account selection */}
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
                  const langs = resolveAccountLanguages(a, product)
                  return (
                    <div
                      key={a.id}
                      className={`cs-account-item${selected ? ' selected' : ''}`}
                      onClick={() => toggleAccount(a.id)}
                    >
                      <div className="cs-account-check">{selected && <CheckIcon size={10} />}</div>
                      <PlatformBadge platform={a.platform} size={11} />
                      <span className="cs-account-handle">@{a.handle}</span>
                      {langs.length > 1 && (
                        <span className="cs-lang-indicator">{langs.map(langShort).join(' · ')}</span>
                      )}
                      {a.persona && (
                        <span className="cs-persona-indicator" title={a.persona}>persona</span>
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
                : `Generate ${draftSlots.length} draft${draftSlots.length !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="cs-right">
        {!hasDrafts ? (
          <div className="cs-drafts-empty">
            <div className="cs-drafts-empty-icon">✍️</div>
            <div className="cs-drafts-empty-title">No drafts yet</div>
            <div className="cs-drafts-empty-desc">
              Pick an angle, select accounts, and hit Generate to create drafts for each account and language.
            </div>
          </div>
        ) : (
          <>
            {/* Tabs — one per slot */}
            <div className="cs-tabs">
              {draftSlots.map(slot => {
                const acc = accounts.find(a => a.id === slot.accountId)
                const d = drafts[slot.key]
                const showLang = accountSlotCount[slot.accountId] > 1
                return (
                  <button
                    key={slot.key}
                    className={`cs-tab${activeTab === slot.key ? ' active' : ''} ${d?.status || ''}`}
                    onClick={() => setActiveTab(slot.key)}
                  >
                    {acc && <PlatformBadge platform={acc.platform} size={10} />}
                    <span>@{acc?.handle || slot.accountId.slice(0, 8)}</span>
                    {showLang && (
                      <span className="cs-tab-lang">{langShort(slot.language)}</span>
                    )}
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
                    <span>Generating for @{activeAccount?.handle}{activeSlot && accountSlotCount[activeSlot.accountId] > 1 ? ` · ${activeSlot.language}` : ''}…</span>
                  </div>
                ) : activeDraft?.error ? (
                  <div className="cs-draft-error">
                    <div>Generation failed: {activeDraft.error}</div>
                    <button className="btn btn-ghost" onClick={() => handleRegenerate(activeTab)}>Retry</button>
                  </div>
                ) : (
                  <div className="cs-draft-card cs-post-mockup">
                    {/* Mockup header */}
                    <div className="cs-mockup-header">
                      <div className="cs-mockup-avatar" />
                      <span className="cs-mockup-handle">@{activeAccount?.handle}</span>
                      {activeSlot && accountSlotCount[activeSlot.accountId] > 1 && (
                        <span className="cs-mockup-lang">{activeSlot.language}</span>
                      )}
                      <PlatformBadge platform={activeAccount?.platform} size={11} />
                    </div>

                    {/* Editable copy */}
                    <textarea
                      className="cs-draft-text"
                      value={activeDraft?.text || ''}
                      onChange={e => setDraftText(activeTab, e.target.value)}
                      placeholder="Draft will appear here…"
                    />

                    {/* Counts */}
                    {(() => {
                      const limits = platformConfigs[activeAccount?.platform]?.limits
                      const text = activeDraft?.text || ''
                      const charLimit = limits?.charLimit ?? null
                      const wordLimit = limits?.wordLimit ?? null
                      const charLen = text.length
                      const wordLen = text.trim() ? text.trim().split(/\s+/).length : 0
                      if (!charLimit && !wordLimit) return null
                      const charCls = charLimit ? (charLen > charLimit ? 'over' : charLen / charLimit >= 0.9 ? 'warn' : '') : ''
                      const wordCls = wordLimit ? (wordLen > wordLimit ? 'over' : wordLen / wordLimit >= 0.9 ? 'warn' : '') : ''
                      return (
                        <div className="cs-counts-row">
                          {charLimit && (
                            <span className={`cs-char-count${charCls ? ' ' + charCls : ''}`}>{charLen} / {charLimit} chars</span>
                          )}
                          {wordLimit && (
                            <span className={`cs-char-count${wordCls ? ' ' + wordCls : ''}`}>{wordLen} / {wordLimit} words</span>
                          )}
                          {!wordLimit && <span className="cs-word-plain">{wordLen} words</span>}
                        </div>
                      )
                    })()}

                    {/* Image block */}
                    {(() => {
                      const descriptors = [...visualTones, ...preferredColors]
                      const aspectStyle = getImageAspectStyle(activeAccount?.platform)
                      return (
                        <div className="cs-image-block" style={aspectStyle}>
                          {!activeImageState && (
                            <div className="cs-image-placeholder">
                              {descriptors.length > 0 && (
                                <div className="cs-image-descriptor-chips">
                                  {descriptors.map(d => (
                                    <span key={d} className="cs-image-descriptor">{d}</span>
                                  ))}
                                </div>
                              )}
                              <button
                                className="cs-gen-image-btn"
                                onClick={() => handleGenerateImage(activeTab)}
                                disabled={!activeDraft?.text?.trim() || generating}
                              >
                                ✦ Generate Image
                              </button>
                              {!activeDraft?.text?.trim() && (
                                <span className="cs-image-hint">Write a draft first</span>
                              )}
                            </div>
                          )}
                          {activeImageState?.generating && (
                            <div className="cs-image-loading">
                              <div className="spinner" />
                              <span>Generating image…</span>
                            </div>
                          )}
                          {activeImageState?.error && !activeImageState.generating && (
                            <div className="cs-image-error-state">
                              <span>{activeImageState.error}</span>
                              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleGenerateImage(activeTab)}>Retry</button>
                            </div>
                          )}
                          {activeImageState?.base64 && !activeImageState.generating && (
                            <>
                              <img
                                src={`data:${activeImageState.mimeType};base64,${activeImageState.base64}`}
                                alt="Generated post visual"
                                className="cs-generated-image"
                              />
                              <div className="cs-image-overlay-actions">
                                <button className="cs-image-action-btn" onClick={() => handleGenerateImage(activeTab)} title="Regenerate image">
                                  <RefreshIcon size={10} /> Regen
                                </button>
                                <button className="cs-image-action-btn" onClick={() => navigator.clipboard.writeText(activeImageState.prompt)} title="Copy image prompt">
                                  Copy prompt
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })()}

                    {/* Draft actions */}
                    <div className="cs-draft-actions">
                      <button className="btn btn-ghost" onClick={() => handleRegenerate(activeTab)} disabled={activeDraft?.generating}>
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
                  </div>
                )}
              </div>
            )}

            {hasDrafts && draftSlots.some(slot => !drafts[slot.key]?.text && !drafts[slot.key]?.generating) && (
              <div className="cs-partial-hint fade-in">
                Some slots don't have drafts yet — hit Generate again to fill them in.
              </div>
            )}

            {allApproved && (
              <div className="cs-save-bar fade-in">
                <div className="cs-save-bar-text">
                  All {draftSlots.length} draft{draftSlots.length !== 1 ? 's' : ''} approved
                </div>
                <button className="btn btn-teal" onClick={() => { setSaveError(null); setShowSaveModal(true) }}>
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
              <button className="ah-close" onClick={() => setShowSaveModal(false)}><CloseIcon size={14} /></button>
            </div>
            <div className="cs-modal-body">
              <p className="cs-modal-desc">
                {draftSlots.filter(slot => drafts[slot.key]?.status === 'approved').length} approved post{draftSlots.filter(slot => drafts[slot.key]?.status === 'approved').length !== 1 ? 's' : ''} will be saved to the calendar.
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
                {draftSlots
                  .filter(slot => drafts[slot.key]?.status === 'approved')
                  .map((slot, i) => {
                    const acc = accounts.find(a => a.id === slot.accountId)
                    const showLang = accountSlotCount[slot.accountId] > 1
                    return (
                      <div key={slot.key} className="cs-modal-account-row">
                        <PlatformBadge platform={acc?.platform} size={11} />
                        <span>@{acc?.handle}</span>
                        {showLang && <span className="cs-stagger-hint">{slot.language}</span>}
                        {i > 0 && <span className="cs-stagger-hint">+{i * 45}min stagger</span>}
                      </div>
                    )
                  })}
              </div>
            </div>
            {saveError && <div className="cs-modal-error">{saveError}</div>}
            <div className="cs-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="btn btn-teal" onClick={handleSaveToCalendar} disabled={!saveDate || saving}>
                {saving ? 'Saving…' : 'Confirm & save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
