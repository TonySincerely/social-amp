import { useState, useEffect, useRef } from 'react'
import { getAllTrackers, createTracker, deleteTracker } from '../../services/booster'
import { SetupPanel } from './panels/SetupPanel'
import { VoicePanel } from './panels/VoicePanel'
import { TopicsPanel } from './panels/TopicsPanel'
import { DraftPanel } from './panels/DraftPanel'
import { AnalyzePanel } from './panels/AnalyzePanel'
import { PredictPanel } from './panels/PredictPanel'
import { ReviewPanel } from './panels/ReviewPanel'
import './Booster.css'

const PANELS = [
  { id: 'setup',   label: 'Setup',   alwaysEnabled: true },
  { id: 'voice',   label: 'Voice',   alwaysEnabled: false },
  { id: 'topics',  label: 'Topics',  alwaysEnabled: false },
  { id: 'draft',   label: 'Draft',   alwaysEnabled: false },
  { id: 'analyze', label: 'Analyze', alwaysEnabled: true },
  { id: 'predict', label: 'Predict', alwaysEnabled: false },
  { id: 'review',  label: 'Review',  alwaysEnabled: false },
]

export function Booster() {
  const [trackers, setTrackers]         = useState([])
  const [activeHandle, setActiveHandle] = useState(null)
  const [activePanel, setActivePanel]   = useState('setup')
  const [loading, setLoading]           = useState(true)
  const [adding, setAdding]             = useState(false)
  const [newHandle, setNewHandle]       = useState('')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)
  const [draftTopic, setDraftTopic]       = useState(null)
  const [analyzeDraftText, setAnalyzeDraftText] = useState(null)
  const [predictText, setPredictText]           = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  async function load() {
    try {
      setLoading(true)
      const rows = await getAllTrackers()
      setTrackers(rows)
      if (rows.length > 0 && !activeHandle) setActiveHandle(rows[0].handle)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddHandle() {
    const handle = newHandle.trim().replace(/^@/, '')
    if (!handle) return
    try {
      setSaving(true)
      const row = await createTracker('@' + handle)
      const updated = [...trackers, row]
      setTrackers(updated)
      setActiveHandle(row.handle)
      setNewHandle('')
      setAdding(false)
      setActivePanel('setup')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const activeTracker = trackers.find(t => t.handle === activeHandle) ?? null
  const hasTracker    = !!activeTracker?.tracker

  function renderPanel() {
    switch (activePanel) {
      case 'setup':   return <SetupPanel   tracker={activeTracker} onRefresh={load} />
      case 'voice':   return <VoicePanel   tracker={activeTracker} onRefresh={load} />
      case 'topics':  return <TopicsPanel  tracker={activeTracker} onSendToDraft={topic => { setDraftTopic(topic); setActivePanel('draft') }} />
      case 'draft':   return <DraftPanel   tracker={activeTracker} pendingTopic={draftTopic} onSendToAnalyze={text => { setAnalyzeDraftText(text); setActivePanel('analyze') }} onSendToPredict={text => { setPredictText(text); setActivePanel('predict') }} />
      case 'analyze': return <AnalyzePanel tracker={activeTracker} pendingText={analyzeDraftText} />
      case 'predict': return <PredictPanel tracker={activeTracker} pendingText={predictText} />
      case 'review':  return <ReviewPanel  tracker={activeTracker} onRefresh={load} />
      default:        return null
    }
  }

  if (loading) {
    return (
      <div className="bst-wrap">
        <div className="bst-loading">載入中…</div>
      </div>
    )
  }

  return (
    <div className="bst-wrap">
      <div className="bst-header">
        <div className="bst-header-left">
          <h1 className="bst-title">AK Threads</h1>
          <p className="bst-subtitle">Threads 內容決策系統</p>
        </div>

        <div className="bst-handle-bar">
          {trackers.length > 0 && (
            <select
              className="bst-handle-select"
              value={activeHandle ?? ''}
              onChange={e => {
                setActiveHandle(e.target.value)
                setActivePanel('setup')
              }}
            >
              {trackers.map(t => (
                <option key={t.handle} value={t.handle}>{t.handle}</option>
              ))}
            </select>
          )}

          {adding ? (
            <div className="bst-add-row">
              <span className="bst-handle-at">@</span>
              <input
                ref={inputRef}
                className="bst-handle-input"
                value={newHandle}
                onChange={e => setNewHandle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddHandle()
                  if (e.key === 'Escape') { setAdding(false); setNewHandle('') }
                }}
                placeholder="your_handle"
                disabled={saving}
              />
              <button className="bst-btn-sm bst-btn-primary" onClick={handleAddHandle} disabled={saving || !newHandle.trim()}>
                {saving ? '…' : '新增'}
              </button>
              <button className="bst-btn-sm" onClick={() => { setAdding(false); setNewHandle('') }}>取消</button>
            </div>
          ) : (
            <button className="bst-btn-sm bst-btn-add" onClick={() => setAdding(true)}>
              ＋ 新增帳號
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bst-error">{error}</div>
      )}

      {trackers.length === 0 && !adding ? (
        <div className="bst-empty">
          <div className="bst-empty-icon">↑</div>
          <p className="bst-empty-msg">尚未新增任何 Threads 帳號</p>
          <button className="bst-btn bst-btn-primary" onClick={() => setAdding(true)}>
            ＋ 新增帳號
          </button>
        </div>
      ) : trackers.length > 0 ? (
        <>
          <div className="bst-tab-bar">
            {PANELS.map(p => {
              const enabled = p.alwaysEnabled || hasTracker
              return (
                <button
                  key={p.id}
                  className={`bst-tab${activePanel === p.id ? ' bst-tab-active' : ''}${!enabled ? ' bst-tab-locked' : ''}`}
                  onClick={() => enabled && setActivePanel(p.id)}
                  title={!enabled ? '請先完成 Setup' : undefined}
                >
                  {p.label}
                  {!enabled && <span className="bst-lock">🔒</span>}
                </button>
              )
            })}
          </div>

          <div className="bst-panel-wrap">
            {renderPanel()}
          </div>
        </>
      ) : null}
    </div>
  )
}
