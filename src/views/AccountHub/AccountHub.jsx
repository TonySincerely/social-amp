import { useState, useEffect } from 'react'
import { getAllAccounts, saveAccount, deleteAccount } from '../../services/storage'
import { PlatformBadge, PlusIcon, EditIcon, TrashIcon, CloseIcon } from '../../components/Icons'
import './AccountHub.css'

const PLATFORMS = ['instagram', 'threads', 'x', 'reddit', 'pinterest', 'facebook']
const TONE_PRESETS = ['educator', 'puncher', 'helper', 'jester', 'closer', 'storyteller', 'neutral']

const EMPTY_FORM = {
  handle: '',
  platform: 'instagram',
  followerCount: '',
  persona: '',
  tonePreset: 'neutral',
}

export function AccountHub() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const all = await getAllAccounts()
    setAccounts(all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setShowModal(true)
  }

  function openEdit(account) {
    setEditing(account)
    setForm({
      handle: account.handle || '',
      platform: account.platform || 'instagram',
      followerCount: account.followerCount ? String(account.followerCount) : '',
      persona: account.persona || '',
      tonePreset: account.tonePreset || 'neutral',
    })
    setErrors({})
    setShowModal(true)
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: null }))
  }

  async function handleSave() {
    const errs = {}
    if (!form.handle.trim()) errs.handle = 'Handle is required'
    if (!form.platform) errs.platform = 'Platform is required'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      const data = {
        ...(editing ? { id: editing.id, createdAt: editing.createdAt } : {}),
        handle: form.handle.trim().replace(/^@/, ''),
        platform: form.platform,
        followerCount: form.followerCount ? parseInt(form.followerCount, 10) : null,
        persona: form.persona.trim() || null,
        tonePreset: form.tonePreset,
      }
      await saveAccount(data)
      setShowModal(false)
      await load()
    } catch (err) {
      setErrors({ _global: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this account?')) return
    await deleteAccount(id)
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  if (loading) {
    return (
      <div className="ah-wrap">
        <div className="ah-loading"><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="ah-wrap">
      <div className="ah-header">
        <div>
          <h1 className="ah-title">Accounts</h1>
          <p className="ah-subtitle">Manage your social accounts and their posting voices. No live connection required.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <PlusIcon size={13} /> Add account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="ah-empty">
          <div className="ah-empty-icon">👤</div>
          <div className="ah-empty-title">No accounts yet</div>
          <div className="ah-empty-desc">Add your social accounts to assign them to products and control their posting voice.</div>
          <button className="btn btn-primary" onClick={openAdd}>
            <PlusIcon size={13} /> Add account
          </button>
        </div>
      ) : (
        <div className="ah-list">
          {accounts.map(a => (
            <div key={a.id} className="account-row">
              <PlatformBadge platform={a.platform} size={13} />
              <div className="account-row-info">
                <span className="account-handle">@{a.handle}</span>
                {a.followerCount && (
                  <span className="account-followers">{formatFollowers(a.followerCount)} followers</span>
                )}
              </div>
              <div className="account-row-voice">
                {a.persona
                  ? <span className="voice-tag voice-persona">Persona set</span>
                  : <span className="voice-tag">{a.tonePreset || 'neutral'}</span>
                }
              </div>
              {a.persona && (
                <div className="account-row-persona" title={a.persona}>
                  {a.persona.length > 60 ? a.persona.slice(0, 60) + '…' : a.persona}
                </div>
              )}
              <div className="account-row-actions">
                <button className="ah-icon-btn" onClick={() => openEdit(a)} title="Edit">
                  <EditIcon size={14} />
                </button>
                <button className="ah-icon-btn danger" onClick={() => handleDelete(a.id)} title="Delete">
                  <TrashIcon size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="ah-overlay" onClick={() => setShowModal(false)}>
          <div className="ah-modal" onClick={e => e.stopPropagation()}>
            <div className="ah-modal-header">
              <h2>{editing ? 'Edit account' : 'Add account'}</h2>
              <button className="ah-close" onClick={() => setShowModal(false)}>
                <CloseIcon size={14} />
              </button>
            </div>

            <div className="ah-modal-body">
              {/* Platform */}
              <div className={`ps-field${errors.platform ? ' ps-field-error' : ''}`}>
                <label className="ps-label">Platform <span className="ps-required">*</span></label>
                <div className="ah-platform-grid">
                  {PLATFORMS.map(pl => (
                    <button
                      key={pl}
                      className={`ah-platform-btn${form.platform === pl ? ' selected' : ''}`}
                      onClick={() => set('platform', pl)}
                      type="button"
                    >
                      <PlatformBadge platform={pl} size={11} />
                      <span>{pl.charAt(0).toUpperCase() + pl.slice(1)}</span>
                    </button>
                  ))}
                </div>
                {errors.platform && <div className="ps-error">{errors.platform}</div>}
              </div>

              {/* Handle */}
              <div className={`ps-field${errors.handle ? ' ps-field-error' : ''}`}>
                <label className="ps-label">Handle <span className="ps-required">*</span></label>
                <input
                  type="text"
                  placeholder="yourhandle (no @)"
                  value={form.handle}
                  onChange={e => set('handle', e.target.value)}
                />
                {errors.handle && <div className="ps-error">{errors.handle}</div>}
              </div>

              {/* Follower count */}
              <div className="ps-field">
                <label className="ps-label">Follower count <span className="ps-hint">optional</span></label>
                <input
                  type="number"
                  placeholder="e.g. 12000"
                  value={form.followerCount}
                  onChange={e => set('followerCount', e.target.value)}
                  min="0"
                />
              </div>

              {/* Default tone */}
              <div className="ps-field">
                <label className="ps-label">Default tone preset</label>
                <select
                  value={form.tonePreset}
                  onChange={e => set('tonePreset', e.target.value)}
                >
                  {TONE_PRESETS.map(t => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Persona */}
              <div className="ps-field">
                <label className="ps-label">
                  Persona <span className="ps-hint">optional — overrides tone preset when set</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe this account's unique voice, style, or character. E.g.: 'Opinionated tech founder who speaks plainly, uses data to make points, occasionally self-deprecating, never corporate.'"
                  value={form.persona}
                  onChange={e => set('persona', e.target.value)}
                />
              </div>

              {errors._global && <div className="ps-global-error">{errors._global}</div>}
            </div>

            <div className="ah-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatFollowers(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
