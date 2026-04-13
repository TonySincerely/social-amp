import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  getAllProducts, getAllAccounts, getAllPlatformConfigs,
  seedPlatformDefaults, updateProduct, saveCalendarPost,
} from '../services/storage'
import {
  generateMultiAccountDrafts, regenerateDraft,
  getTrendBrief, generatePostImage, isGeminiInitialized,
} from '../services/gemini'
import { PLATFORM_BEST_TIMES, formatTime12 } from '../services/planner'
import { MOOD_PRESETS } from '../data/visualPresets'
import { langShort } from '../data/languages'
import { PlatformBadge, RefreshIcon, CheckIcon, CloseIcon } from './Icons'
import './QuickCreateDrawer.css'

// ── helpers ───────────────────────────────────────────────────────────────────

function resolveAccountLanguages(account, product) {
  if (account.languages?.length > 0) return account.languages
  if (product?.languages?.length > 0) return product.languages
  return ['English']
}

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

function getImageAspectStyle(platform) {
  if (['instagram', 'pinterest'].includes(platform)) return { aspectRatio: '3/4', maxHeight: 280 }
  if (platform === 'x') return { aspectRatio: '16/9' }
  return { aspectRatio: '1/1', maxHeight: 280 }
}

// ── constants ─────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Context', 'Setup', 'Draft', 'Schedule']

const IDENTITY_OPTIONS = [
  { value: 'random_guy', label: 'Random user' },
  { value: 'founder', label: 'Founder' },
]

const TONE_OPTIONS = [
  { value: 'promoting', label: 'Promoting' },
  { value: 'showcasing', label: 'Showcasing' },
  { value: 'discussing', label: 'Discussing' },
  { value: 'questioning', label: 'Questioning' },
  { value: 'jesting', label: 'Jesting' },
]

// ── component ─────────────────────────────────────────────────────────────────

export function QuickCreateDrawer() {
  const navigate = useNavigate()
  const { showQuickCreate, setShowQuickCreate, setShowApiKeyModal, quickCreateDate, setQuickCreateDate } = useApp()

  // data
  const [dataLoaded, setDataLoaded] = useState(false)
  const [products, setProducts] = useState([])
  const [allAccounts, setAllAccounts] = useState([])
  const [platformConfigs, setPlatformConfigs] = useState({})

  // navigation
  const [step, setStep] = useState(1)

  // step 1
  const [selectedProductId, setSelectedProductId] = useState(null)
  const [identity, setIdentity] = useState('random_guy')
  const [postTone, setPostTone] = useState('promoting')

  // step 2
  const [angleInput, setAngleInput] = useState('')
  const [angle, setAngle] = useState('')
  const [briefFetching, setBriefFetching] = useState(false)
  const [visualOpen, setVisualOpen] = useState(false)
  const [visualTones, setVisualTones] = useState([])
  const [preferredColors, setPreferredColors] = useState([])
  const [visualToneInput, setVisualToneInput] = useState('')
  const [colorInput, setColorInput] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [showStep2Warning, setShowStep2Warning] = useState(false)
  const [step2Warnings, setStep2Warnings] = useState([])

  // step 3
  const [drafts, setDrafts] = useState({})
  const [activeTab, setActiveTab] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [imageStates, setImageStates] = useState({})

  // step 4
  const [saveDate, setSaveDate] = useState('')
  const [saveTime, setSaveTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // ── load on open ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!showQuickCreate) return
    let cancelled = false
    async function load() {
      await seedPlatformDefaults()
      const [prods, accs, allConfigs] = await Promise.all([
        getAllProducts(),
        getAllAccounts(),
        getAllPlatformConfigs(),
      ])
      if (cancelled) return
      setProducts(prods)
      setAllAccounts(accs)
      const cfgMap = {}
      allConfigs.forEach(c => { cfgMap[c.platform] = c })
      setPlatformConfigs(cfgMap)
      if (prods.length === 1) {
        setSelectedProductId(prods[0].id)
        if (prods[0].visualTones?.length > 0) setVisualTones(prods[0].visualTones)
        if (prods[0].preferredColors?.length > 0) setPreferredColors(prods[0].preferredColors)
      }
      if (quickCreateDate) setSaveDate(quickCreateDate)
      setDataLoaded(true)
    }
    load()
    return () => { cancelled = true }
  }, [showQuickCreate])

  // ── reset after close animation ───────────────────────────────────────────────

  useEffect(() => {
    if (showQuickCreate) return
    const t = setTimeout(() => {
      setStep(1)
      setDataLoaded(false)
      setProducts([])
      setAllAccounts([])
      setPlatformConfigs({})
      setSelectedProductId(null)
      setIdentity('random_guy')
      setPostTone('promoting')
      setAngleInput('')
      setAngle('')
      setBriefFetching(false)
      setVisualOpen(false)
      setVisualTones([])
      setPreferredColors([])
      setVisualToneInput('')
      setColorInput('')
      setSelectedAccountIds([])
      setShowStep2Warning(false)
      setStep2Warnings([])
      setDrafts({})
      setActiveTab(null)
      setGenerating(false)
      setImageStates({})
      setSaveDate('')
      setSaveTime('')
      setSaving(false)
      setSaveError(null)
      setQuickCreateDate(null)
    }, 300)
    return () => clearTimeout(t)
  }, [showQuickCreate])

  // ── derived ───────────────────────────────────────────────────────────────────

  const product = products.find(p => p.id === selectedProductId) || null
  const linkedAccounts = allAccounts.filter(a => (product?.accountIds || []).includes(a.id))
  const brief = product?.trendBrief
  const briefStale = brief && (Date.now() - new Date(brief.fetchedAt)) > 24 * 3_600_000
  const draftSlots = buildDraftSlots(selectedAccountIds, linkedAccounts, product)
  const approvedSlots = draftSlots.filter(s => drafts[s.key]?.status === 'approved')
  const approvedCount = approvedSlots.length
  const allApproved = draftSlots.length > 0 && approvedCount === draftSlots.length
  const hasDrafts = draftSlots.some(s => drafts[s.key]?.text)
  const visualDescriptorCount = visualTones.length + preferredColors.length
  const activeSlot = draftSlots.find(s => s.key === activeTab)
  const activeAccount = activeSlot ? linkedAccounts.find(a => a.id === activeSlot.accountId) : null
  const activeDraft = activeTab ? drafts[activeTab] : null
  const activeImageState = activeTab ? imageStates[activeTab] : null
  const accountSlotCount = {}
  draftSlots.forEach(s => { accountSlotCount[s.accountId] = (accountSlotCount[s.accountId] || 0) + 1 })

  // Recommended time based on dominant platform of selected accounts
  const suggestedTime = (() => {
    const platforms = selectedAccountIds
      .map(id => linkedAccounts.find(a => a.id === id)?.platform)
      .filter(Boolean)
    if (!platforms.length) return null
    const counts = {}
    platforms.forEach(p => { counts[p] = (counts[p] || 0) + 1 })
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    const time = PLATFORM_BEST_TIMES[dominant]?.[0]
    return time ? { time, platform: dominant } : null
  })()

  // ── actions ───────────────────────────────────────────────────────────────────

  function close() { setShowQuickCreate(false) }

  function selectProduct(id) {
    if (selectedProductId === id) return
    setSelectedProductId(id)
    const p = products.find(x => x.id === id)
    setVisualTones(p?.visualTones?.length > 0 ? p.visualTones : [])
    setPreferredColors(p?.preferredColors?.length > 0 ? p.preferredColors : [])
    setSelectedAccountIds([])
    setAngle('')
    setAngleInput('')
    setDrafts({})
    setActiveTab(null)
  }

  async function fetchBrief() {
    if (!product) return
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }
    setBriefFetching(true)
    try {
      const newBrief = await getTrendBrief({
        name: product.name,
        problemStatement: product.problemStatement,
        targetPersona: product.targetPersona,
        ksp: product.ksp,
      })
      const updated = await updateProduct(product.id, { trendBrief: newBrief })
      setProducts(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (e) {
      console.error(e)
    } finally {
      setBriefFetching(false)
    }
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
  function toggleAccount(id) {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Soft validation for step 2 — warn if missing context, allow proceeding
  function handleStep2Next() {
    const warnings = []
    if (!angle.trim()) warnings.push('No angle entered — the AI will choose its own focus.')
    if (selectedAccountIds.length === 0) warnings.push('No accounts selected — nothing will be generated until you add one.')
    if (warnings.length > 0) {
      setStep2Warnings(warnings)
      setShowStep2Warning(true)
    } else {
      setStep(3)
    }
  }

  function confirmStep2Continue() {
    setShowStep2Warning(false)
    setStep(3)
  }

  // Step 3 → 4: confirm if partially approved
  function handleStep3Continue() {
    if (allApproved) { goToStep4(); return }
    const pending = draftSlots.length - approvedCount
    if (confirm(`${pending} draft${pending !== 1 ? 's' : ''} not approved will be discarded. Continue?`)) {
      goToStep4()
    }
  }

  function goToStep4() {
    if (!saveTime && suggestedTime) setSaveTime(suggestedTime.time)
    setStep(4)
  }

  async function handleGenerate() {
    if (!angle.trim() || selectedAccountIds.length === 0) return
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }
    const slots = buildDraftSlots(selectedAccountIds, linkedAccounts, product)
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

    const accountsForGeneration = slots.map(slot => {
      const account = linkedAccounts.find(a => a.id === slot.accountId)
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
    const account = linkedAccounts.find(a => a.id === accountId)
    if (!account) return
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }
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
    const account = linkedAccounts.find(a => a.id === accountId)
    const draftText = drafts[slotKey]?.text
    if (!draftText?.trim() || !account) return
    if (!isGeminiInitialized()) { setShowApiKeyModal(true); return }
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

  async function handleSave() {
    if (!saveDate || !product) return
    setSaving(true)
    setSaveError(null)
    try {
      const monthKey = saveDate.slice(0, 7)
      await Promise.all(
        approvedSlots.map((slot, i) => {
          const account = linkedAccounts.find(a => a.id === slot.accountId)
          const imgState = imageStates[slot.key]
          return saveCalendarPost({
            productId: product.id,
            accountId: slot.accountId,
            platform: account?.platform,
            accountHandle: account?.handle,
            copy: drafts[slot.key].text,
            angle: angle.trim(),
            identity,
            postTone,
            date: saveDate,
            time: saveTime || undefined,
            monthKey,
            scheduledOffset: i,
            status: 'ready',
            ...(imgState?.base64 ? {
              imageBase64: imgState.base64,
              imageMimeType: imgState.mimeType,
              imagePrompt: imgState.prompt,
            } : {}),
          })
        })
      )
      close()
      navigate(`/calendar?month=${monthKey}`)
    } catch (e) {
      setSaveError(e.message || 'Save failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────────

  const step1Valid = !!selectedProductId

  // Step 3 footer state
  const canGenerate = angle.trim().length > 0 && selectedAccountIds.length > 0
  const canContinue = approvedCount > 0

  return (
    <div className={`qc-backdrop${showQuickCreate ? ' open' : ''}`} onClick={close}>
      <div className={`qc-drawer${showQuickCreate ? ' open' : ''}`} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="qc-header">
          <div className="qc-header-title">New Post</div>
          <button className="qc-close" onClick={close}><CloseIcon size={14} /></button>
        </div>

        {/* Stepper */}
        <div className="qc-stepper">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <Fragment key={n}>
                <div className={`qc-step${active ? ' active' : ''}${done ? ' done' : ''}`}>
                  <div className="qc-step-num">
                    {done ? <CheckIcon size={9} /> : n}
                  </div>
                  <span className="qc-step-label">{label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`qc-step-connector${done ? ' done' : ''}`} />
                )}
              </Fragment>
            )
          })}
        </div>

        {/* Body */}
        <div className="qc-body">
          {!dataLoaded ? (
            <div className="qc-loading"><div className="spinner" /></div>
          ) : (
            <>
              {/* ── Step 1: Context ── */}
              {step === 1 && (
                <div className="qc-step-body fade-in">
                  {products.length > 1 && (
                    <div className="qc-field">
                      <div className="qc-label">Product</div>
                      <div className="qc-product-list">
                        {products.map(p => (
                          <div
                            key={p.id}
                            className={`qc-product-item${selectedProductId === p.id ? ' selected' : ''}`}
                            onClick={() => selectProduct(p.id)}
                          >
                            <div className="qc-item-check">{selectedProductId === p.id && <CheckIcon size={9} />}</div>
                            <div>
                              <div className="qc-product-name">{p.name}</div>
                              <div className="qc-product-persona">{p.targetPersona}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {products.length === 1 && product && (
                    <div className="qc-single-product">
                      <div className="qc-single-product-name">{product.name}</div>
                      <div className="qc-single-product-persona">{product.targetPersona}</div>
                    </div>
                  )}

                  <div className="qc-field">
                    <label className="qc-label" htmlFor="qc-identity">Identity</label>
                    <select
                      id="qc-identity"
                      className="qc-select"
                      value={identity}
                      onChange={e => setIdentity(e.target.value)}
                    >
                      {IDENTITY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="qc-field">
                    <label className="qc-label" htmlFor="qc-tone">Tone</label>
                    <select
                      id="qc-tone"
                      className="qc-select"
                      value={postTone}
                      onChange={e => setPostTone(e.target.value)}
                    >
                      {TONE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Step 2: Setup ── */}
              {step === 2 && (
                <div className="qc-step-body fade-in">
                  {/* Angle */}
                  <div className="qc-field">
                    <div className="qc-label-row">
                      <span className="qc-label">Post angle</span>
                      {brief?.angles?.length > 0 ? (
                        // Brief exists — icon-only refresh
                        <button
                          className="qc-brief-refresh"
                          onClick={fetchBrief}
                          disabled={briefFetching}
                          title={briefStale ? 'Stale — refresh angles' : 'Refresh angles'}
                        >
                          {briefFetching
                            ? <div className="spinner" style={{ width: 10, height: 10 }} />
                            : <RefreshIcon size={11} />
                          }
                          {briefStale && <span className="qc-brief-stale-dot" />}
                        </button>
                      ) : (
                        // No brief — labelled fetch button
                        <button
                          className="qc-brief-btn"
                          onClick={fetchBrief}
                          disabled={briefFetching}
                        >
                          {briefFetching
                            ? <div className="spinner" style={{ width: 10, height: 10 }} />
                            : '✦ Fetch angles'
                          }
                        </button>
                      )}
                    </div>

                    {brief?.angles?.length > 0 && (
                      <div className="qc-angle-chips">
                        {brief.angles.map((a, i) => (
                          <button
                            key={i}
                            className={`qc-angle-chip${angle === a ? ' selected' : ''}`}
                            onClick={() => { setAngle(a); setAngleInput(a) }}
                          >{a}</button>
                        ))}
                      </div>
                    )}

                    <textarea
                      className="qc-textarea"
                      placeholder="Describe your angle or hook…"
                      value={angleInput}
                      rows={3}
                      onChange={e => { setAngleInput(e.target.value); setAngle(e.target.value) }}
                    />
                  </div>

                  {/* Visual */}
                  <div className="qc-field qc-field--collapsible">
                    <div className="qc-collapsible-title" onClick={() => setVisualOpen(o => !o)}>
                      <span className={`qc-collapse-arrow${visualOpen ? ' open' : ''}`}>›</span>
                      Visual
                      {visualDescriptorCount > 0 && (
                        <span className="qc-visual-count">{visualDescriptorCount}</span>
                      )}
                    </div>
                    {visualOpen && (
                      <div className="qc-visual-body">
                        <div className="qc-preset-chips">
                          {MOOD_PRESETS.map(m => (
                            <button
                              key={m}
                              className={`qc-preset-chip${visualTones.includes(m) ? ' selected' : ''}`}
                              onClick={() => toggleVisualTone(m)}
                            >{m}</button>
                          ))}
                        </div>
                        <div className="qc-input-row">
                          <input
                            type="text"
                            className="qc-text-input"
                            placeholder="Custom mood or style…"
                            value={visualToneInput}
                            onChange={e => setVisualToneInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTone() } }}
                          />
                          <button className="qc-add-btn" onClick={addCustomTone} disabled={!visualToneInput.trim()}>+</button>
                        </div>
                        <div className="qc-sublabel">Colors</div>
                        <div className="qc-input-row">
                          <input
                            type="text"
                            className="qc-text-input"
                            placeholder="e.g. warm ivory, deep navy…"
                            value={colorInput}
                            onChange={e => setColorInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColor() } }}
                          />
                          <button className="qc-add-btn" onClick={addColor} disabled={!colorInput.trim()}>+</button>
                        </div>
                        {(visualTones.length > 0 || preferredColors.length > 0) && (
                          <div className="qc-active-chips">
                            {visualTones.map(t => (
                              <span key={t} className="qc-chip">
                                {t}
                                <button onClick={() => setVisualTones(prev => prev.filter(x => x !== t))}>×</button>
                              </span>
                            ))}
                            {preferredColors.map(c => (
                              <span key={c} className="qc-chip qc-chip--color">
                                {c}
                                <button onClick={() => setPreferredColors(prev => prev.filter(x => x !== c))}>×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Accounts */}
                  <div className="qc-field">
                    <div className="qc-label">Accounts</div>
                    {linkedAccounts.length === 0 ? (
                      <div className="qc-empty-hint">No accounts linked to this product.</div>
                    ) : (
                      <div className="qc-account-list">
                        {linkedAccounts.map(a => {
                          const selected = selectedAccountIds.includes(a.id)
                          const langs = resolveAccountLanguages(a, product)
                          return (
                            <div
                              key={a.id}
                              className={`qc-account-item${selected ? ' selected' : ''}`}
                              onClick={() => toggleAccount(a.id)}
                            >
                              <div className="qc-item-check">{selected && <CheckIcon size={9} />}</div>
                              <PlatformBadge platform={a.platform} size={11} />
                              <span className="qc-account-handle">@{a.handle}</span>
                              {langs.length > 1 && (
                                <span className="qc-lang-indicator">{langs.map(langShort).join(' · ')}</span>
                              )}
                              {a.persona && <span className="qc-persona-badge">persona</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 3: Draft ── */}
              {step === 3 && (
                <div className="qc-step-body qc-step-body--draft fade-in">
                  {!hasDrafts && !generating ? (
                    <div className="qc-draft-empty">
                      <div className="qc-draft-empty-icon">✍️</div>
                      <div className="qc-draft-empty-title">Ready to generate</div>
                      <div className="qc-draft-empty-desc">
                        {canGenerate
                          ? `${draftSlots.length} draft${draftSlots.length !== 1 ? 's' : ''} across ${selectedAccountIds.length} account${selectedAccountIds.length !== 1 ? 's' : ''}. Hit Generate below.`
                          : 'Go back to Setup to enter an angle and select accounts before generating.'
                        }
                      </div>
                    </div>
                  ) : (
                    <div className="qc-draft-content">
                      {/* Tabs */}
                      <div className="qc-tabs">
                        {draftSlots.map(slot => {
                          const acc = linkedAccounts.find(a => a.id === slot.accountId)
                          const d = drafts[slot.key]
                          const showLang = accountSlotCount[slot.accountId] > 1
                          return (
                            <button
                              key={slot.key}
                              className={`qc-tab${activeTab === slot.key ? ' active' : ''}`}
                              onClick={() => setActiveTab(slot.key)}
                            >
                              {acc && <PlatformBadge platform={acc.platform} size={10} />}
                              <span>@{acc?.handle || slot.accountId.slice(0, 8)}</span>
                              {showLang && <span className="qc-tab-lang">{langShort(slot.language)}</span>}
                              {d?.status === 'approved' && <span className="qc-tab-dot approved" />}
                              {d?.status === 'needs_work' && <span className="qc-tab-dot needs-work" />}
                              {d?.generating && <div className="spinner" style={{ width: 9, height: 9 }} />}
                            </button>
                          )
                        })}
                      </div>

                      {/* Approval status bar */}
                      <div className="qc-draft-status-bar">
                        <span className={`qc-approval-count${allApproved ? ' all' : ''}`}>
                          {approvedCount}/{draftSlots.length} approved
                        </span>
                        {allApproved && (
                          <span className="qc-all-approved-hint">All approved — continue to schedule</span>
                        )}
                      </div>

                      {/* Active draft card */}
                      {activeTab && (
                        <div className="qc-draft-area fade-in">
                          {activeDraft?.generating ? (
                            <div className="qc-draft-loading">
                              <div className="spinner" />
                              <span>Generating for @{activeAccount?.handle}…</span>
                            </div>
                          ) : activeDraft?.error ? (
                            <div className="qc-draft-error">
                              <div>Generation failed: {activeDraft.error}</div>
                              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleRegenerate(activeTab)}>Retry</button>
                            </div>
                          ) : (
                            <div className="qc-draft-card">
                              <div className="qc-mockup-header">
                                <div className="qc-mockup-avatar" />
                                <span className="qc-mockup-handle">@{activeAccount?.handle}</span>
                                {activeSlot && accountSlotCount[activeSlot.accountId] > 1 && (
                                  <span className="qc-mockup-lang">{activeSlot.language}</span>
                                )}
                                <PlatformBadge platform={activeAccount?.platform} size={11} />
                              </div>

                              <textarea
                                className="qc-draft-text"
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
                                const charCls = charLimit ? (charLen > charLimit ? 'over' : charLen / charLimit >= 0.9 ? 'warn' : '') : ''
                                const wordCls = wordLimit ? (wordLen > wordLimit ? 'over' : wordLen / wordLimit >= 0.9 ? 'warn' : '') : ''
                                return (
                                  <div className="qc-counts-row">
                                    {charLimit && <span className={`qc-count${charCls ? ' ' + charCls : ''}`}>{charLen} / {charLimit} chars</span>}
                                    {wordLimit
                                      ? <span className={`qc-count${wordCls ? ' ' + wordCls : ''}`}>{wordLen} / {wordLimit} words</span>
                                      : <span className="qc-count">{wordLen} words</span>
                                    }
                                  </div>
                                )
                              })()}

                              {/* Image block */}
                              {(() => {
                                const descriptors = [...visualTones, ...preferredColors]
                                const aspectStyle = getImageAspectStyle(activeAccount?.platform)
                                return (
                                  <div className="qc-image-block" style={aspectStyle}>
                                    {!activeImageState && (
                                      <div className="qc-image-placeholder">
                                        {descriptors.length > 0 && (
                                          <div className="qc-image-descriptor-chips">
                                            {descriptors.map(d => (
                                              <span key={d} className="qc-image-descriptor">{d}</span>
                                            ))}
                                          </div>
                                        )}
                                        <button
                                          className="qc-gen-image-btn"
                                          onClick={() => handleGenerateImage(activeTab)}
                                          disabled={!activeDraft?.text?.trim() || generating}
                                        >
                                          ✦ Generate Image
                                        </button>
                                        {!activeDraft?.text?.trim() && (
                                          <span className="qc-image-hint">Write a draft first</span>
                                        )}
                                      </div>
                                    )}
                                    {activeImageState?.generating && (
                                      <div className="qc-image-loading">
                                        <div className="spinner" />
                                        <span>Generating image…</span>
                                      </div>
                                    )}
                                    {activeImageState?.error && !activeImageState.generating && (
                                      <div className="qc-image-error">
                                        <span>{activeImageState.error}</span>
                                        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleGenerateImage(activeTab)}>Retry</button>
                                      </div>
                                    )}
                                    {activeImageState?.base64 && !activeImageState.generating && (
                                      <>
                                        <img
                                          src={`data:${activeImageState.mimeType};base64,${activeImageState.base64}`}
                                          alt="Generated post visual"
                                          className="qc-generated-image"
                                        />
                                        <div className="qc-image-overlay-actions">
                                          <button className="qc-image-action-btn" onClick={() => handleGenerateImage(activeTab)}>
                                            <RefreshIcon size={10} /> Regen
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )
                              })()}

                              <div className="qc-draft-actions">
                                <button
                                  className="btn btn-ghost"
                                  style={{ fontSize: 11 }}
                                  onClick={() => handleRegenerate(activeTab)}
                                  disabled={activeDraft?.generating}
                                >
                                  <RefreshIcon size={11} /> Regenerate
                                </button>
                                <div className="qc-status-btns">
                                  <button
                                    className={`qc-status-btn needs-work${activeDraft?.status === 'needs_work' ? ' active' : ''}`}
                                    onClick={() => setDraftStatus(activeTab, 'needs_work')}
                                  >
                                    <CloseIcon size={10} /> Needs work
                                  </button>
                                  <button
                                    className={`qc-status-btn approve${activeDraft?.status === 'approved' ? ' active' : ''}`}
                                    onClick={() => setDraftStatus(activeTab, 'approved')}
                                  >
                                    <CheckIcon size={10} /> Approve
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 4: Schedule ── */}
              {step === 4 && (
                <div className="qc-step-body fade-in">
                  <div className="qc-datetime-row">
                    <div className="qc-field" style={{ flex: 1 }}>
                      <label className="qc-label">Publish date</label>
                      <input
                        type="date"
                        className="qc-text-input"
                        value={saveDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={e => setSaveDate(e.target.value)}
                      />
                    </div>
                    <div className="qc-field" style={{ flex: 1 }}>
                      <label className="qc-label">Time</label>
                      <input
                        type="time"
                        className="qc-text-input"
                        value={saveTime}
                        onChange={e => setSaveTime(e.target.value)}
                      />
                      {suggestedTime && (
                        <div className="qc-time-suggestion">
                          {formatTime12(suggestedTime.time)} recommended · {suggestedTime.platform}
                          {!saveTime && (
                            <button
                              className="qc-time-use-btn"
                              onClick={() => setSaveTime(suggestedTime.time)}
                            >Use</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="qc-schedule-summary">
                    <div className="qc-summary-label">
                      Saving {approvedCount} post{approvedCount !== 1 ? 's' : ''}
                    </div>
                    {approvedSlots.map((slot, i) => {
                      const acc = linkedAccounts.find(a => a.id === slot.accountId)
                      const showLang = accountSlotCount[slot.accountId] > 1
                      const hasImage = !!imageStates[slot.key]?.base64
                      return (
                        <div key={slot.key} className="qc-summary-row">
                          <PlatformBadge platform={acc?.platform} size={11} />
                          <span className="qc-summary-handle">@{acc?.handle}</span>
                          {showLang && <span className="qc-stagger-hint">{slot.language}</span>}
                          {hasImage && <span className="qc-summary-image-badge">image</span>}
                          {i > 0 && <span className="qc-stagger-hint">+{i * 45}min stagger</span>}
                        </div>
                      )
                    })}
                  </div>

                  {saveError && <div className="qc-save-error">{saveError}</div>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {dataLoaded && (
          <div className="qc-footer">
            {/* Step 2 inline warning replaces normal footer content */}
            {step === 2 && showStep2Warning ? (
              <div className="qc-warning-banner">
                <div className="qc-warning-messages">
                  {step2Warnings.map((w, i) => (
                    <div key={i} className="qc-warning-line">⚠ {w}</div>
                  ))}
                  <div className="qc-warning-sub">Missing context may reduce draft quality.</div>
                </div>
                <div className="qc-warning-actions">
                  <button className="btn btn-ghost" onClick={() => setShowStep2Warning(false)}>Go back</button>
                  <button className="btn btn-purple" onClick={confirmStep2Continue}>Continue anyway</button>
                </div>
              </div>
            ) : (
              <>
                {step > 1 && (
                  <button className="btn btn-ghost" onClick={() => {
                    setShowStep2Warning(false)
                    setStep(s => s - 1)
                  }}>
                    ← Back
                  </button>
                )}
                <div className="qc-footer-spacer" />

                {step === 1 && (
                  <button className="btn btn-purple" onClick={() => setStep(2)} disabled={!step1Valid}>
                    Next →
                  </button>
                )}

                {step === 2 && (
                  <button className="btn btn-purple" onClick={handleStep2Next}>
                    Next →
                  </button>
                )}

                {step === 3 && (
                  <>
                    {canGenerate && (
                      <button
                        className={`btn ${canContinue ? 'btn-ghost' : 'btn-purple'}`}
                        onClick={handleGenerate}
                        disabled={generating}
                      >
                        {generating
                          ? <><div className="spinner" style={{ width: 12, height: 12, borderTopColor: 'currentColor' }} /> Generating…</>
                          : hasDrafts
                            ? `Regenerate ${draftSlots.length}`
                            : `Generate ${draftSlots.length} draft${draftSlots.length !== 1 ? 's' : ''}`
                        }
                      </button>
                    )}
                    {canContinue && (
                      <button className="btn btn-purple" onClick={handleStep3Continue}>
                        Continue →
                      </button>
                    )}
                    {!canContinue && hasDrafts && (
                      <button className="btn btn-purple" disabled>
                        Continue →
                      </button>
                    )}
                  </>
                )}

                {step === 4 && (
                  <button className="btn btn-teal" onClick={handleSave} disabled={!saveDate || saving}>
                    {saving
                      ? <><div className="spinner" style={{ width: 12, height: 12, borderTopColor: 'white' }} /> Saving…</>
                      : 'Save to Calendar'
                    }
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
