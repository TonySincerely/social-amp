import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { saveProduct, getProduct, getAllAccounts } from '../../services/storage'
import { getTrendBrief, isGeminiInitialized } from '../../services/gemini'
import { useApp } from '../../context/AppContext'
import { PlatformBadge, PlusIcon } from '../../components/Icons'
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
  const { setShowApiKeyModal } = useApp()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    name: '',
    problemStatement: '',
    targetPersona: '',
    stage: '',
    validationGoal: '',
    platforms: [],
    accountIds: [],
  })
  const [errors, setErrors] = useState({})
  const [warnings, setWarnings] = useState({})
  const [accounts, setAccounts] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAllAccounts().then(setAccounts)
    if (isEdit) {
      getProduct(id).then(p => {
        if (p) setForm({
          name: p.name || '',
          problemStatement: p.problemStatement || '',
          targetPersona: p.targetPersona || '',
          stage: p.stage || '',
          validationGoal: p.validationGoal || '',
          platforms: p.platforms || [],
          accountIds: p.accountIds || [],
        })
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

    if (!isGeminiInitialized()) {
      setShowApiKeyModal(true)
      return
    }

    setSaving(true)
    try {
      const productData = {
        ...(isEdit ? { id } : {}),
        name: form.name.trim(),
        problemStatement: form.problemStatement.trim(),
        targetPersona: form.targetPersona.trim(),
        stage: form.stage || 'idea',
        validationGoal: form.validationGoal.trim(),
        platforms: form.platforms,
        accountIds: form.accountIds,
        trendBrief: null,
      }

      const saved = await saveProduct(productData)

      // Fire trend brief async — don't block navigation
      getTrendBrief({
        name: saved.name,
        problemStatement: saved.problemStatement,
        targetPersona: saved.targetPersona,
      }).then(brief => {
        saveProduct({ ...saved, trendBrief: brief })
      }).catch(() => {})

      navigate(`/studio/${saved.id}`)
    } catch (err) {
      setErrors({ _global: err.message })
    } finally {
      setSaving(false)
    }
  }

  const accountsForPlatforms = accounts.filter(a => form.platforms.includes(a.platform))

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

        {/* Accounts (shown if platforms selected) */}
        {form.platforms.length > 0 && (
          <div className="ps-field">
            <label className="ps-label">
              Accounts
              <span className="ps-hint">Select accounts for these platforms</span>
            </label>
            {accountsForPlatforms.length === 0 ? (
              <div className="ps-no-accounts">
                No accounts yet for selected platforms.{' '}
                <button
                  className="ps-link"
                  onClick={() => navigate('/accounts')}
                  type="button"
                >
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

        {/* Stage (soft required) */}
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

          {/* Validation goal (soft required) */}
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
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/products')}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn btn-purple"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? <><div className="spinner" style={{ width: 12, height: 12, borderTopColor: 'white' }} /> Saving…</> : 'Save & enter studio →'}
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
