import { useState, useEffect } from 'react'
import { getAllAccounts, saveAccount, deleteAccount } from '../../services/storage'
import { distillPostPatterns } from '../../services/gemini'
import { PlatformBadge, PlusIcon, EditIcon, TrashIcon, CloseIcon } from '../../components/Icons'
import { LANGUAGES } from '../../data/languages'
import './AccountHub.css'

const PLATFORMS = ['instagram', 'threads', 'x', 'reddit', 'pinterest', 'facebook']
const TONE_PRESETS = ['educator', 'puncher', 'helper', 'jester', 'closer', 'storyteller', 'neutral']

const EMPTY_FORM = {
  handle: '',
  platform: 'instagram',
  followerCount: '',
  languages: [],
  persona: '',
  tonePreset: 'neutral',
  topPostsRaw: '',
  postPatterns: null,
}

export function AccountHub() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [patternsOpen, setPatternsOpen] = useState(false)

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
    setPatternsOpen(false)
    setShowModal(true)
  }

  function openEdit(account) {
    setEditing(account)
    setForm({
      handle: account.handle || '',
      platform: account.platform || 'instagram',
      followerCount: account.followerCount ? String(account.followerCount) : '',
      languages: account.languages || (account.language ? [account.language] : []),
      persona: account.persona || '',
      tonePreset: account.tonePreset || 'neutral',
      topPostsRaw: account.topPostsRaw || '',
      postPatterns: account.postPatterns || null,
    })
    setErrors({})
    setPatternsOpen(!!(account.topPostsRaw || account.postPatterns?.length))
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
        languages: form.languages.length > 0 ? form.languages : null,
        persona: form.persona.trim() || null,
        tonePreset: form.tonePreset,
        topPostsRaw: form.topPostsRaw.trim() || null,
        postPatterns: form.postPatterns || null,
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

  async function handleDistill() {
    if (!form.topPostsRaw.trim()) return
    setDistilling(true)
    setErrors(prev => ({ ...prev, _distill: null }))
    try {
      const patterns = await distillPostPatterns(form.topPostsRaw, form.platform)
      set('postPatterns', patterns)
    } catch (err) {
      setErrors(prev => ({ ...prev, _distill: err.message }))
    } finally {
      setDistilling(false)
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
                {a.postPatterns?.length > 0 && (
                  <span className="voice-tag voice-patterns">✦ patterns</span>
                )}
                {a.languages?.map(l => (
                  <span key={l} className="voice-tag voice-lang">{l}</span>
                ))}
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

              {/* Languages */}
              <div className="ps-field">
                <label className="ps-label">
                  Languages
                  <span className="ps-hint">optional — overrides product default</span>
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

              {/* Writing patterns */}
              <div className="ps-field">
                <div className="ah-patterns-toggle" onClick={() => setPatternsOpen(o => !o)}>
                  <span className={`ah-collapse-arrow${patternsOpen ? ' open' : ''}`}>›</span>
                  <span className="ps-label" style={{ margin: 0 }}>Writing patterns</span>
                  <span className="ps-hint">optional — learn from top posts</span>
                  {form.postPatterns?.length > 0 && (
                    <span className="ah-patterns-badge">✦ {form.postPatterns.length} patterns</span>
                  )}
                </div>
                {patternsOpen && (
                  <>
                    <textarea
                      rows={6}
                      placeholder={'Paste 3–10 of your top-performing posts, separated by ---\n\nMore posts = better patterns.'}
                      value={form.topPostsRaw}
                      onChange={e => { set('topPostsRaw', e.target.value); set('postPatterns', null) }}
                      style={{ marginTop: 8 }}
                    />
                    <div className="ah-patterns-actions">
                      <button
                        className="btn btn-ghost ah-distill-btn"
                        onClick={handleDistill}
                        disabled={!form.topPostsRaw.trim() || distilling}
                        type="button"
                      >
                        {distilling
                          ? <><div className="spinner" style={{ width: 11, height: 11 }} /> Distilling…</>
                          : '✦ Distill patterns'
                        }
                      </button>
                      {form.postPatterns?.length > 0 && (
                        <button
                          className="btn btn-ghost"
                          onClick={() => set('postPatterns', null)}
                          type="button"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {errors._distill && <div className="ps-error">{errors._distill}</div>}
                    {form.postPatterns?.length > 0 && (
                      <div className="ah-patterns-list">
                        {form.postPatterns.map((p, i) => (
                          <div key={i} className="ah-pattern-item">
                            <span className="ah-pattern-num">{i + 1}</span>
                            <span>{p}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
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
