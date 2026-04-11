import { useState, useEffect } from 'react'
import { getAllPlatformConfigs, getPlatformConfig, savePlatformConfig, seedPlatformDefaults, PLATFORM_DEFAULTS } from '../../services/storage'
import { distillStrategy, isGeminiInitialized } from '../../services/gemini'
import { PlatformBadge, CloseIcon, PlusIcon, EditIcon } from '../../components/Icons'
import './Playbook.css'

const PLATFORMS = ['instagram', 'x', 'threads', 'reddit', 'facebook', 'pinterest']

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  x: 'X',
  threads: 'Threads',
  reddit: 'Reddit',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
}

const LIMIT_FIELDS = [
  { key: 'charLimit',    label: 'Char limit',   unit: 'chars' },
  { key: 'wordLimit',    label: 'Word limit',   unit: 'words' },
  { key: 'hashtagLimit', label: 'Hashtag rec.',  unit: 'tags'  },
  { key: 'linkInPost',   label: 'Link in post',  type: 'bool'  },
  { key: 'videoMaxSec',  label: 'Video cap',     unit: 'sec'   },
]

export function Playbook() {
  const [activePlatform, setActivePlatform] = useState('instagram')
  const [configs, setConfigs] = useState({})
  const [loading, setLoading] = useState(true)

  // Limit inline editing
  const [editLimit, setEditLimit] = useState(null)

  // Strategy modal
  const [showModal, setShowModal] = useState(false)
  const [modalStrategy, setModalStrategy] = useState(null)
  const [modalName, setModalName] = useState('')
  const [modalContent, setModalContent] = useState('')
  const [modalDirectives, setModalDirectives] = useState([])
  const [modalDistilling, setModalDistilling] = useState(false)
  const [modalContentDirty, setModalContentDirty] = useState(false)

  useEffect(() => {
    async function load() {
      await seedPlatformDefaults()
      const all = await getAllPlatformConfigs()
      const map = {}
      all.forEach(c => { map[c.platform] = c })
      setConfigs(map)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    setEditLimit(null)
    closeModal()
  }, [activePlatform])

  const config = configs[activePlatform] || { platform: activePlatform, limits: {}, strategies: [], selectedStrategyId: null }
  const strategies = config.strategies || []

  // ─── Limit handlers ──────────────────────────────────────────────────────────

  function startEditLimit(field) {
    const raw = config.limits[field]
    setEditLimit({ field, value: raw == null ? '' : String(raw) })
  }

  async function saveLimit() {
    if (!editLimit) return
    const { field, value } = editLimit
    const parsed = value.trim() === '' ? null : Number(value)
    if (value.trim() !== '' && isNaN(parsed)) { setEditLimit(null); return }
    const updated = { ...config, limits: { ...config.limits, [field]: parsed } }
    const saved = await savePlatformConfig(updated)
    setConfigs(prev => ({ ...prev, [activePlatform]: saved }))
    setEditLimit(null)
  }

  async function toggleLinkInPost() {
    const updated = { ...config, limits: { ...config.limits, linkInPost: !config.limits.linkInPost } }
    const saved = await savePlatformConfig(updated)
    setConfigs(prev => ({ ...prev, [activePlatform]: saved }))
  }

  async function restoreDefaults() {
    const defaults = PLATFORM_DEFAULTS[activePlatform]
    if (!defaults) return
    const updated = { ...config, limits: { ...defaults } }
    const saved = await savePlatformConfig(updated)
    setConfigs(prev => ({ ...prev, [activePlatform]: saved }))
  }

  // ─── Strategy handlers ────────────────────────────────────────────────────────

  function openNewModal() {
    setModalStrategy(null)
    setModalName('')
    setModalContent('')
    setModalDirectives([])
    setModalContentDirty(false)
    setShowModal(true)
  }

  function openEditModal(s) {
    setModalStrategy(s)
    setModalName(s.name)
    setModalContent(s.content)
    setModalDirectives(s.directives || [])
    setModalContentDirty(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setModalStrategy(null)
    setModalName('')
    setModalContent('')
    setModalDirectives([])
    setModalDistilling(false)
    setModalContentDirty(false)
  }

  async function handleDistillInModal() {
    if (!modalContent.trim() || !isGeminiInitialized()) return
    setModalDistilling(true)
    try {
      const directives = await distillStrategy(modalContent)
      setModalDirectives(directives)
      setModalContentDirty(false)
    } catch (e) {
      console.error(e)
    } finally {
      setModalDistilling(false)
    }
  }

  async function saveStrategy() {
    const name = modalName.trim()
    const content = modalContent.trim()
    if (!name || !content) return

    const strategyData = {
      name,
      content,
      directives: modalDirectives,
      distilledAt: modalDirectives.length > 0 ? new Date().toISOString() : null,
    }

    let updatedStrategies
    if (modalStrategy) {
      updatedStrategies = strategies.map(s =>
        s.id === modalStrategy.id ? { ...s, ...strategyData } : s
      )
    } else {
      const newS = { id: crypto.randomUUID(), ...strategyData, createdAt: new Date().toISOString() }
      updatedStrategies = [...strategies, newS]
    }

    const updated = { ...config, strategies: updatedStrategies }
    const saved = await savePlatformConfig(updated)
    setConfigs(prev => ({ ...prev, [activePlatform]: saved }))
    closeModal()

    // Background distillation if no directives yet and Gemini is available
    const needsDistill = modalDirectives.length === 0 || (modalStrategy && modalContentDirty)
    if (needsDistill && isGeminiInitialized()) {
      const target = saved.strategies.find(s => s.name === name && s.content === content)
      if (target) distillInBackground(target.id, activePlatform)
    }
  }

  async function distillInBackground(strategyId, platform) {
    setConfigs(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        strategies: (prev[platform]?.strategies || []).map(s =>
          s.id === strategyId ? { ...s, distilling: true } : s
        ),
      },
    }))
    try {
      // Read fresh from DB — avoids clobbering selectedStrategyId or other changes
      // that happened between saveStrategy and distillation completing
      const freshConfig = await getPlatformConfig(platform)
      if (!freshConfig) return
      const strategy = freshConfig.strategies.find(s => s.id === strategyId)
      if (!strategy) return
      const directives = await distillStrategy(strategy.content)
      const updatedStrategies = freshConfig.strategies.map(s =>
        s.id === strategyId
          ? { ...s, directives, distilledAt: new Date().toISOString(), distilling: false }
          : s
      )
      const resaved = await savePlatformConfig({ ...freshConfig, strategies: updatedStrategies })
      setConfigs(prev => ({ ...prev, [platform]: resaved }))
    } catch {
      setConfigs(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          strategies: (prev[platform]?.strategies || []).map(s =>
            s.id === strategyId ? { ...s, distilling: false } : s
          ),
        },
      }))
    }
  }

  async function selectStrategy(id) {
    const newId = config.selectedStrategyId === id ? null : id
    const updated = { ...config, selectedStrategyId: newId }
    const saved = await savePlatformConfig(updated)
    setConfigs(prev => ({ ...prev, [activePlatform]: saved }))
  }

  async function deleteStrategy(id) {
    const updatedStrategies = strategies.filter(s => s.id !== id)
    const updated = {
      ...config,
      strategies: updatedStrategies,
      selectedStrategyId: config.selectedStrategyId === id ? null : config.selectedStrategyId,
    }
    const saved = await savePlatformConfig(updated)
    setConfigs(prev => ({ ...prev, [activePlatform]: saved }))
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────

  function renderLimitValue(field, type, unit) {
    const raw = config.limits[field]

    if (type === 'bool') {
      return (
        <span
          className={`pb-limit-val pb-limit-toggle${raw ? ' on' : ''}`}
          onClick={toggleLinkInPost}
          title="Click to toggle"
        >
          {raw ? 'Yes' : 'No'}
        </span>
      )
    }

    if (editLimit?.field === field) {
      return (
        <input
          type="number"
          className="pb-limit-input"
          value={editLimit.value}
          autoFocus
          min={0}
          onChange={e => setEditLimit(prev => ({ ...prev, value: e.target.value }))}
          onBlur={saveLimit}
          onKeyDown={e => {
            if (e.key === 'Enter') saveLimit()
            if (e.key === 'Escape') setEditLimit(null)
          }}
        />
      )
    }

    return (
      <span
        className={`pb-limit-val${raw == null ? ' pb-limit-null' : ''}`}
        onClick={() => startEditLimit(field)}
        title="Click to edit"
      >
        {raw == null ? '—' : raw}
        {raw != null && unit && <span className="pb-limit-unit">{unit}</span>}
      </span>
    )
  }

  function renderStrategyPreview(s) {
    if (s.distilling) {
      return (
        <div className="pb-strategy-preview pb-strategy-distilling">
          <div className="spinner" style={{ width: 10, height: 10, flexShrink: 0 }} />
          Extracting directives…
        </div>
      )
    }
    if (s.directives?.length > 0) {
      return (
        <ol className="pb-directive-preview-list">
          {s.directives.slice(0, 3).map((d, i) => (
            <li key={i} className="pb-directive-preview-item">{d}</li>
          ))}
          {s.directives.length > 3 && (
            <li className="pb-directive-preview-item pb-directive-preview-more">
              +{s.directives.length - 3} more
            </li>
          )}
        </ol>
      )
    }
    return <div className="pb-strategy-preview">{s.content}</div>
  }

  if (loading) {
    return (
      <div className="pb-wrap">
        <div className="pb-loading"><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="pb-wrap">
      <div className="pb-header">
        <h1 className="pb-title">Playbook</h1>
        <p className="pb-subtitle">Platform limits and content strategies your team uses when creating posts.</p>
      </div>

      {/* Platform tabs */}
      <div className="pb-tabs">
        {PLATFORMS.map(p => (
          <button
            key={p}
            className={`pb-tab${activePlatform === p ? ' active' : ''}`}
            onClick={() => setActivePlatform(p)}
          >
            <PlatformBadge platform={p} size={11} />
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Two-column content */}
      <div className="pb-content">

        {/* Left — Limits */}
        <div className="pb-section">
          <div>
            <div className="pb-section-title">Limits</div>
            <div className="pb-section-note">Injected as hard constraints into every draft</div>
          </div>
          <div className="pb-limits">
            {LIMIT_FIELDS.map(({ key, label, unit, type }) => (
              <div key={key} className="pb-limit-row">
                <span className="pb-limit-label">{label}</span>
                {renderLimitValue(key, type, unit)}
              </div>
            ))}
          </div>
          <button className="pb-restore-btn" onClick={restoreDefaults}>
            Restore defaults
          </button>
        </div>

        {/* Right — Strategies */}
        <div className="pb-section">
          <div className="pb-section-header">
            <div>
              <div className="pb-section-title">Strategies</div>
              <div className="pb-ai-note">Active strategy directives are injected into AI generation</div>
            </div>
            <button className="pb-add-btn" onClick={openNewModal}>
              <PlusIcon size={11} /> New
            </button>
          </div>

          <div className="pb-strategies">
            {strategies.length === 0 ? (
              <div className="pb-empty">
                <div className="pb-empty-title">No strategies yet</div>
                <div className="pb-empty-hint">
                  Add your team's first content strategy for {PLATFORM_LABELS[activePlatform]}
                </div>
                <button className="pb-empty-action" onClick={openNewModal}>
                  + Add first strategy
                </button>
              </div>
            ) : (
              strategies.map(s => {
                const isSelected = config.selectedStrategyId === s.id
                return (
                  <div
                    key={s.id}
                    className={`pb-strategy-card${isSelected ? ' selected' : ''}`}
                    onClick={() => selectStrategy(s.id)}
                  >
                    <div className={`pb-radio${isSelected ? ' on' : ''}`} />
                    <div className="pb-strategy-body">
                      <div className="pb-strategy-name-row">
                        <div className="pb-strategy-name">{s.name}</div>
                        {s.directives?.length > 0 && !s.distilling && (
                          <span className="pb-ai-badge" title="Directives extracted — AI-ready">✦</span>
                        )}
                      </div>
                      {renderStrategyPreview(s)}
                    </div>
                    <div className="pb-strategy-actions">
                      <button
                        className="pb-strategy-btn"
                        onClick={e => { e.stopPropagation(); openEditModal(s) }}
                        title="Edit strategy"
                      >
                        <EditIcon size={12} />
                      </button>
                      <button
                        className="pb-strategy-btn pb-strategy-btn--del"
                        onClick={e => { e.stopPropagation(); deleteStrategy(s.id) }}
                        title="Delete strategy"
                      >
                        <CloseIcon size={11} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>

      {/* Strategy modal */}
      {showModal && (
        <div className="pb-overlay" onClick={closeModal}>
          <div className="pb-modal" onClick={e => e.stopPropagation()}>
            <div className="pb-modal-header">
              <h2>{modalStrategy ? 'Edit strategy' : 'New strategy'}</h2>
              <button className="pb-modal-close" onClick={closeModal}>
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="pb-modal-body">
              <div className="pb-modal-field">
                <label className="pb-modal-label">Name</label>
                <input
                  type="text"
                  className="pb-modal-input"
                  placeholder="e.g. Hook-first storytelling"
                  value={modalName}
                  autoFocus
                  onChange={e => setModalName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') closeModal() }}
                />
              </div>
              <div className="pb-modal-field">
                <label className="pb-modal-label">Source document</label>
                <textarea
                  className="pb-modal-textarea"
                  placeholder="Paste your strategy, guide, or best-practice document here…"
                  value={modalContent}
                  onChange={e => { setModalContent(e.target.value); setModalContentDirty(true) }}
                />
              </div>

              {/* Directives panel */}
              <div className="pb-directives-panel">
                <div className="pb-directives-header">
                  <div>
                    <div className="pb-directives-label">AI directives</div>
                    <div className="pb-directives-sublabel">What the AI will actually follow</div>
                  </div>
                  {!modalDistilling && (
                    <button
                      className={`pb-distill-btn${modalContentDirty && modalDirectives.length > 0 ? ' dirty' : ''}`}
                      onClick={handleDistillInModal}
                      disabled={!modalContent.trim() || !isGeminiInitialized()}
                      title={!isGeminiInitialized() ? 'Set API key to distill' : undefined}
                    >
                      {modalDirectives.length > 0
                        ? (modalContentDirty ? '↻ Re-distill' : '↻ Regenerate')
                        : '✦ Distill'}
                    </button>
                  )}
                </div>

                {modalDistilling ? (
                  <div className="pb-directives-distilling">
                    <div className="spinner" style={{ width: 12, height: 12 }} />
                    Extracting directives from document…
                  </div>
                ) : modalDirectives.length > 0 ? (
                  <>
                    {modalContentDirty && (
                      <div className="pb-directives-stale-hint">
                        Document changed — directives may be outdated
                      </div>
                    )}
                    <ol className="pb-directives-list">
                      {modalDirectives.map((d, i) => (
                        <li key={i} className="pb-directive-item">{d}</li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <div className="pb-directives-empty">
                    {!isGeminiInitialized()
                      ? 'Set your API key to auto-extract directives on save.'
                      : 'Directives will be extracted automatically when you save, or click Distill to preview now.'}
                  </div>
                )}
              </div>
            </div>
            <div className="pb-modal-footer">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button
                className="btn btn-purple"
                onClick={saveStrategy}
                disabled={!modalName.trim() || !modalContent.trim()}
              >
                Save strategy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
