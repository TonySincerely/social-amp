import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { saveProduct, getProduct, getAllAccounts } from '../../services/storage'
import { PlatformBadge } from '../../components/Icons'
import { MOOD_PRESETS } from '../../data/visualPresets'
import { LANGUAGES } from '../../data/languages'
import './ProductSetup.css'

const PLATFORMS = ['instagram', 'threads', 'x', 'reddit', 'pinterest', 'facebook']
const STAGES = [
  { value: 'idea', label: 'Idea' },
  { value: 'prototype', label: 'Prototype' },
  { value: 'live', label: 'Live' },
]

export function ProductSetup() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    name: '',
    problemStatement: '',
    targetPersona: '',
    languages: ['English'],
    ksp: [],
    visualTones: [],
    preferredColors: [],
    stage: '',
    validationGoal: '',
    platforms: [],
    accountIds: [],
  })
  const [kspInput, setKspInput] = useState('')
  const [visualToneInput, setVisualToneInput] = useState('')
  const [colorInput, setColorInput] = useState('')
  const [existingBrief, setExistingBrief] = useState(null)
  const [errors, setErrors] = useState({})
  const [warnings, setWarnings] = useState({})
  const [accounts, setAccounts] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAllAccounts().then(setAccounts)
    if (isEdit) {
      getProduct(id).then(p => {
        if (p) {
          setExistingBrief(p.trendBrief || null)
          setForm({
            name: p.name || '',
            problemStatement: p.problemStatement || '',
            targetPersona: p.targetPersona || '',
            languages: p.languages || (p.language ? [p.language] : ['English']),
            ksp: p.ksp || [],
            visualTones: p.visualTones || [],
            preferredColors: p.preferredColors || [],
            stage: p.stage || '',
            validationGoal: p.validationGoal || '',
            platforms: p.platforms || [],
            accountIds: p.accountIds || [],
          })
        }
      })
    }
  }, [id, isEdit])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: null }))
  }

  function togglePlatform(pl) {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(pl)
        ? prev.platforms.filter(p => p !== pl)
        : [...prev.platforms, pl],
    }))
    setErrors(prev => ({ ...prev, platforms: null }))
  }

  function toggleAccount(accountId) {
    setForm(prev => ({
      ...prev,
      accountIds: prev.accountIds.includes(accountId)
        ? prev.accountIds.filter(a => a !== accountId)
        : [...prev.accountIds, accountId],
    }))
  }

  function addKsp() {
    const val = kspInput.trim()
    if (!val || form.ksp.length >= 6) return
    setForm(prev => ({ ...prev, ksp: [...prev.ksp, val] }))
    setKspInput('')
  }

  function removeKsp(i) {
    setForm(prev => ({ ...prev, ksp: prev.ksp.filter((_, idx) => idx !== i) }))
  }

  function toggleVisualTone(tone) {
    setForm(prev => ({
      ...prev,
      visualTones: prev.visualTones.includes(tone)
        ? prev.visualTones.filter(t => t !== tone)
        : [...prev.visualTones, tone],
    }))
  }

  function addCustomTone() {
    const v = visualToneInput.trim()
    if (!v || form.visualTones.includes(v)) return
    setForm(prev => ({ ...prev, visualTones: [...prev.visualTones, v] }))
    setVisualToneInput('')
  }

  function removeVisualTone(i) {
    setForm(prev => ({ ...prev, visualTones: prev.visualTones.filter((_, idx) => idx !== i) }))
  }

  function addColor() {
    const v = colorInput.trim()
    if (!v || form.preferredColors.includes(v)) return
    setForm(prev => ({ ...prev, preferredColors: [...prev.preferredColors, v] }))
    setColorInput('')
  }

  function removeColor(i) {
    setForm(prev => ({ ...prev, preferredColors: prev.preferredColors.filter((_, idx) => idx !== i) }))
  }

  function validate() {
    const errs = {}
    const warns = {}
    if (!form.name.trim()) errs.name = 'Product name is required'
    if (!form.problemStatement.trim()) errs.problemStatement = 'Problem statement is required'
    if (!form.targetPersona.trim()) errs.targetPersona = 'Target persona is required'
    if (form.platforms.length === 0) errs.platforms = 'Select at least one platform'
    if (!form.stage) warns.stage = 'Product stage not set — will default to Idea'
    if (!form.validationGoal.trim()) warns.validationGoal = 'No validation goal set — dashboard will show no KPI'
    return { errs, warns }
  }

  async function handleSave() {
    const { errs, warns } = validate()
    setErrors(errs)
    setWarnings(warns)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      const productData = {
        ...(isEdit ? { id } : {}),
        name: form.name.trim(),
        problemStatement: form.problemStatement.trim(),
        targetPersona: form.targetPersona.trim(),
        languages: form.languages.length > 0 ? form.languages : ['English'],
        ksp: form.ksp,
        visualTones: form.visualTones,
        preferredColors: form.preferredColors,
        stage: form.stage || 'idea',
        validationGoal: form.validationGoal.trim(),
        platforms: form.platforms,
        accountIds: form.accountIds,
        trendBrief: isEdit ? existingBrief : null,
      }

      const saved = await saveProduct(productData)
      navigate(`/studio/${saved.id}`)
    } catch (err) {
      setErrors({ _global: err.message })
    } finally {
      setSaving(false)
    }
  }

  const accountsForPlatforms = accounts.filter(a => form.platforms.includes(a.platform))
  const customTones = form.visualTones.filter(t => !MOOD_PRESETS.includes(t))

  return (
    <div className="ps-wrap">
      <div className="ps-header">
        <button className="ps-back" onClick={() => navigate('/products')}>← Products</button>
        <h1 className="ps-title">{isEdit ? 'Edit product' : 'New product'}</h1>
        <p className="ps-subtitle">Fill in the brief. The AI will pre-load your content studio before you arrive.</p>
      </div>

      <div className="ps-form">
        {/* Product name */}
        <div className={`ps-field${errors.name ? ' ps-field-error' : ''}`}>
          <label className="ps-label">
            Product name <span className="ps-required">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Focusly"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
          {errors.name && <div className="ps-error">{errors.name}</div>}
        </div>

        {/* Problem statement */}
        <div className={`ps-field${errors.problemStatement ? ' ps-field-error' : ''}`}>
          <label className="ps-label">
            Problem statement <span className="ps-required">*</span>
            <span className="ps-hint">1–3 sentences</span>
          </label>
          <textarea
            rows={3}
            placeholder="Freelancers juggling multiple clients lose hours to context-switching and missed deadlines…"
            value={form.problemStatement}
            onChange={e => set('problemStatement', e.target.value)}
          />
          {errors.problemStatement && <div className="ps-error">{errors.problemStatement}</div>}
        </div>

        {/* Target persona */}
        <div className={`ps-field${errors.targetPersona ? ' ps-field-error' : ''}`}>
          <label className="ps-label">
            Target persona <span className="ps-required">*</span>
          </label>
          <input
            type="text"
            placeholder="Freelancers with 3+ clients, aged 25–40, use Notion or Asana"
            value={form.targetPersona}
            onChange={e => set('targetPersona', e.target.value)}
          />
          {errors.targetPersona && <div className="ps-error">{errors.targetPersona}</div>}
        </div>

        {/* Languages */}
        <div className="ps-field">
          <label className="ps-label">
            Content languages
            <span className="ps-hint">Default for all accounts — overridable per account</span>
          </label>
          {(() => {
            const unselected = LANGUAGES.filter(l => !form.languages.includes(l.value))
            return (
              <>
                {unselected.length > 0 && (
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value) set('languages', [...form.languages, e.target.value])
                    }}
                  >
                    <option value="">Add language…</option>
                    {unselected.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                )}
                {form.languages.length > 0 && (
                  <div className="ps-ksp-tags" style={{ marginTop: 6 }}>
                    {form.languages.map(lang => (
                      <span key={lang} className="ps-ksp-tag ps-lang-tag">
                        {lang}
                        <button
                          type="button"
                          className="ps-ksp-remove"
                          onClick={() => set('languages', form.languages.filter(l => l !== lang))}
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {/* KSP */}
        <div className="ps-field">
          <label className="ps-label">
            Key selling points
            <span className="ps-hint">Up to 6 — press Enter to add</span>
          </label>
          <div className="ps-ksp-input-row">
            <input
              type="text"
              placeholder="e.g. No setup required — works in 30 seconds"
              value={kspInput}
              onChange={e => setKspInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKsp() } }}
              disabled={form.ksp.length >= 6}
            />
            <button
              type="button"
              className="ps-ksp-add"
              onClick={addKsp}
              disabled={!kspInput.trim() || form.ksp.length >= 6}
            >
              +
            </button>
          </div>
          {form.ksp.length > 0 && (
            <div className="ps-ksp-tags">
              {form.ksp.map((k, i) => (
                <span key={i} className="ps-ksp-tag">
                  {k}
                  <button type="button" className="ps-ksp-remove" onClick={() => removeKsp(i)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Visual tones */}
        <div className="ps-field">
          <label className="ps-label">
            Visual tones
            <span className="ps-hint">Aesthetic descriptors for image generation</span>
          </label>
          <div className="ps-visual-presets">
            {MOOD_PRESETS.map(m => (
              <button
                key={m}
                type="button"
                className={`ps-visual-preset${form.visualTones.includes(m) ? ' selected' : ''}`}
                onClick={() => toggleVisualTone(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="ps-ksp-input-row" style={{ marginTop: 6 }}>
            <input
              type="text"
              placeholder="Or type a custom descriptor…"
              value={visualToneInput}
              onChange={e => setVisualToneInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTone() } }}
            />
            <button
              type="button"
              className="ps-ksp-add"
              onClick={addCustomTone}
              disabled={!visualToneInput.trim()}
            >
              +
            </button>
          </div>
          {customTones.length > 0 && (
            <div className="ps-ksp-tags">
              {customTones.map(t => (
                <span key={t} className="ps-ksp-tag">
                  {t}
                  <button type="button" className="ps-ksp-remove" onClick={() => removeVisualTone(form.visualTones.indexOf(t))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Preferred colors */}
        <div className="ps-field">
          <label className="ps-label">
            Preferred colors
            <span className="ps-hint">Color language for image prompts — press Enter to add</span>
          </label>
          <div className="ps-ksp-input-row">
            <input
              type="text"
              placeholder="e.g. warm ivory, deep navy, forest green"
              value={colorInput}
              onChange={e => setColorInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColor() } }}
            />
            <button
              type="button"
              className="ps-ksp-add"
              onClick={addColor}
              disabled={!colorInput.trim()}
            >
              +
            </button>
          </div>
          {form.preferredColors.length > 0 && (
            <div className="ps-ksp-tags">
              {form.preferredColors.map((c, i) => (
                <span key={i} className="ps-ksp-tag ps-color-tag">
                  {c}
                  <button type="button" className="ps-ksp-remove" onClick={() => removeColor(i)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Platforms */}
        <div className={`ps-field${errors.platforms ? ' ps-field-error' : ''}`}>
          <label className="ps-label">
            Platforms <span className="ps-required">*</span>
            <span className="ps-hint">Up to 3 recommended</span>
          </label>
          <div className="ps-platforms">
            {PLATFORMS.map(pl => (
              <button
                key={pl}
                className={`ps-platform-btn${form.platforms.includes(pl) ? ' selected' : ''}`}
                onClick={() => togglePlatform(pl)}
                type="button"
              >
                <PlatformBadge platform={pl} size={11} />
                <span>{pl.charAt(0).toUpperCase() + pl.slice(1)}</span>
              </button>
            ))}
          </div>
          {errors.platforms && <div className="ps-error">{errors.platforms}</div>}
        </div>

        {/* Accounts */}
        {form.platforms.length > 0 && (
          <div className="ps-field">
            <label className="ps-label">
              Accounts
              <span className="ps-hint">Select accounts for these platforms</span>
            </label>
            {accountsForPlatforms.length === 0 ? (
              <div className="ps-no-accounts">
                No accounts yet for selected platforms.{' '}
                <button className="ps-link" onClick={() => navigate('/accounts')} type="button">
                  Add accounts →
                </button>
              </div>
            ) : (
              <div className="ps-accounts">
                {accountsForPlatforms.map(a => (
                  <div
                    key={a.id}
                    className={`ps-account-row${form.accountIds.includes(a.id) ? ' selected' : ''}`}
                    onClick={() => toggleAccount(a.id)}
                  >
                    <div className="ps-account-check">
                      {form.accountIds.includes(a.id) && <span>✓</span>}
                    </div>
                    <PlatformBadge platform={a.platform} size={11} />
                    <span className="ps-account-handle">@{a.handle}</span>
                    {a.followerCount && (
                      <span className="ps-account-followers">{formatFollowers(a.followerCount)}</span>
                    )}
                    {a.persona && <span className="ps-account-persona-dot" title="Persona set" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stage + Validation goal */}
        <div className="ps-row">
          <div className={`ps-field${warnings.stage ? ' ps-field-warn' : ''}`} style={{ flex: 1 }}>
            <label className="ps-label">Product stage</label>
            <div className="ps-stages">
              {STAGES.map(s => (
                <button
                  key={s.value}
                  className={`ps-stage-btn${form.stage === s.value ? ' selected' : ''}`}
                  onClick={() => set('stage', s.value)}
                  type="button"
                >
                  {s.label}
                </button>
              ))}
            </div>
            {warnings.stage && <div className="ps-warn">{warnings.stage}</div>}
          </div>

          <div className={`ps-field${warnings.validationGoal ? ' ps-field-warn' : ''}`} style={{ flex: 1 }}>
            <label className="ps-label">Validation goal</label>
            <input
              type="text"
              placeholder="e.g. 500 views, 20 comments in 5 days"
              value={form.validationGoal}
              onChange={e => set('validationGoal', e.target.value)}
            />
            {warnings.validationGoal && <div className="ps-warn">{warnings.validationGoal}</div>}
          </div>
        </div>

        {errors._global && <div className="ps-global-error">{errors._global}</div>}

        <div className="ps-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/products')} type="button">
            Cancel
          </button>
          <button className="btn btn-purple" onClick={handleSave} disabled={saving} type="button">
            {saving
              ? <><div className="spinner" style={{ width: 12, height: 12, borderTopColor: 'white' }} /> Saving…</>
              : 'Save & enter studio →'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

function formatFollowers(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
