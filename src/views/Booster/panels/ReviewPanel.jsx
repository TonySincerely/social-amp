import { useState, useEffect } from 'react'
import { generateReview } from '../../../services/gemini'
import { savePostReviewState, saveTracker } from '../../../services/booster'

const BAND_CLASS  = { over: 'bst-badge-green', in: 'bst-badge-teal', under: 'bst-badge-red', no_prediction: 'bst-badge-neutral' }
const BAND_LABEL  = { over: '超出', in: '區間內', under: '低於', no_prediction: '無預測' }
const CHECKPOINT_OPTIONS = [
  { value: 24,  label: '24 小時' },
  { value: 72,  label: '72 小時' },
  { value: 168, label: '7 日' },
]

function MetricInput({ label, value, onChange, optional }) {
  return (
    <div className="bst-review-metric-field">
      <label className="bst-form-label">
        {label}{optional && <span className="bst-review-optional"> 選填</span>}
      </label>
      <input
        className="bst-form-input bst-review-metric-input"
        type="number"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="0"
      />
    </div>
  )
}

export function ReviewPanel({ tracker, onRefresh }) {
  const hasTracker = !!tracker?.tracker
  const posts = (tracker?.tracker?.posts ?? [])
    .filter(p => p.text && !p.is_reply_post)
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))

  const [search, setSearch]           = useState('')
  const [selectedPost, setSelectedPost] = useState(null)
  const [checkpoint, setCheckpoint]   = useState(24)
  const [metrics, setMetrics]         = useState({ likes: '', replies: '', reposts: '', views: '' })
  const [result, setResult]           = useState(null)
  const [loading, setLoading]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [savedFlash, setSavedFlash]   = useState(false)
  const [error, setError]             = useState(null)

  useEffect(() => {
    setSelectedPost(null)
    setResult(null)
    setMetrics({ likes: '', replies: '', reposts: '', views: '' })
  }, [tracker?.handle])

  const filtered = posts.filter(p =>
    !search.trim() || p.text.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 25)

  async function handleReview() {
    if (!selectedPost) return
    const actual = {
      likes:   Number(metrics.likes)   || 0,
      replies: Number(metrics.replies) || 0,
      reposts: Number(metrics.reposts) || 0,
      views:   metrics.views !== '' ? Number(metrics.views) : undefined,
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await generateReview(
        selectedPost.text,
        actual,
        checkpoint,
        selectedPost.prediction_snapshot ?? null,
        posts.filter(p => p.id !== selectedPost.id).slice(0, 15)
      )
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!result || !selectedPost) return
    setSaving(true)
    setError(null)
    try {
      const reviewState = {
        actual_checkpoint_hours: checkpoint,
        actual_metrics: {
          likes:   Number(metrics.likes)   || 0,
          replies: Number(metrics.replies) || 0,
          reposts: Number(metrics.reposts) || 0,
          ...(metrics.views !== '' ? { views: Number(metrics.views) } : {}),
        },
        deviation_summary:  result.deviationSummary,
        calibration_notes:  result.calibrationNotes,
        validated_signals:  result.signalValidation,
        learning_points:    result.learningPoints,
      }
      await savePostReviewState(tracker.handle, selectedPost.id, reviewState)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
      onRefresh?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!hasTracker) {
    return (
      <div className="bst-panel bst-panel-locked">
        <div className="bst-lock-icon">↑</div>
        <p className="bst-lock-msg">請先在 Setup 完成歷史資料匯入</p>
      </div>
    )
  }

  const hasPrediction = !!selectedPost?.prediction_snapshot

  return (
    <div className="bst-panel">
      <div className="bst-panel-header">
        <h2 className="bst-panel-title">Review</h2>
        <p className="bst-panel-desc">輸入實際發文後的指標，與預測對照，萃取學習點，寫回 Tracker 讓系統越用越準。</p>
      </div>

      {/* Step 1: Select post */}
      <div className="bst-review-step">
        <p className="bst-review-step-label">① 選擇貼文</p>
        <input
          className="bst-form-input"
          placeholder="搜尋貼文文字…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="bst-review-post-list">
          {filtered.length === 0 && (
            <p className="bst-review-empty">找不到符合的貼文</p>
          )}
          {filtered.map(p => {
            const isSelected = selectedPost?.id === p.id
            const reviewed   = !!p.review_state?.last_reviewed_at
            const hasPred    = !!p.prediction_snapshot
            const date       = p.created_at ? new Date(p.created_at).toLocaleDateString('zh-TW') : ''
            return (
              <button
                key={p.id}
                className={`bst-review-post-item${isSelected ? ' bst-review-post-selected' : ''}`}
                onClick={() => { setSelectedPost(p); setResult(null) }}
              >
                <div className="bst-review-post-item-top">
                  <span className="bst-review-post-snippet">{p.text.slice(0, 80)}{p.text.length > 80 ? '…' : ''}</span>
                  <div className="bst-review-post-badges">
                    {hasPred    && <span className="bst-topic-badge bst-badge-blue">有預測</span>}
                    {reviewed   && <span className="bst-topic-badge bst-badge-teal">已復盤</span>}
                  </div>
                </div>
                {date && <span className="bst-review-post-date">{date}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Step 2: Metrics + checkpoint */}
      {selectedPost && (
        <div className="bst-review-step">
          <p className="bst-review-step-label">② 輸入實際指標</p>

          {hasPrediction && (
            <div className="bst-setup-status">
              <span className="bst-status-dot bst-status-dot-green" />
              <span className="bst-status-text">這篇有預測快照——復盤將包含預測對照</span>
            </div>
          )}

          <div className="bst-review-checkpoint-row">
            <span className="bst-form-label">發文後</span>
            {CHECKPOINT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`bst-draft-toggle ${checkpoint === opt.value ? 'bst-draft-toggle-on' : 'bst-draft-toggle-off'}`}
                onClick={() => setCheckpoint(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="bst-review-metrics-grid">
            <MetricInput label="讚"  value={metrics.likes}   onChange={v => setMetrics(m => ({ ...m, likes:   v }))} />
            <MetricInput label="回覆" value={metrics.replies} onChange={v => setMetrics(m => ({ ...m, replies: v }))} />
            <MetricInput label="轉發" value={metrics.reposts} onChange={v => setMetrics(m => ({ ...m, reposts: v }))} />
            <MetricInput label="觀看" value={metrics.views}   onChange={v => setMetrics(m => ({ ...m, views:   v }))} optional />
          </div>

          <button
            className="bst-analyze-btn"
            onClick={handleReview}
            disabled={loading || (metrics.likes === '' && metrics.replies === '')}
          >
            {loading ? '復盤中…' : result ? '↻ 重新復盤' : '復盤'}
          </button>
        </div>
      )}

      {error && <div className="bst-setup-error">{error}</div>}

      {loading && (
        <div className="bst-topics-loading">
          <span className="bst-coming-dot" />
          Gemini 正在分析偏差原因、校正預測…
        </div>
      )}

      {result && !loading && (
        <div className="bst-review-results">

          {/* Deviation summary */}
          <div className="bst-review-summary-card">
            <span className="bst-review-summary-label">復盤摘要</span>
            <p className="bst-review-summary-text">{result.deviationSummary}</p>
          </div>

          {/* Prediction comparison */}
          {result.predictionComparison?.some(r => r.bandHit !== 'no_prediction') && (
            <div className="bst-review-section">
              <p className="bst-draft-section-label">預測 vs 實際</p>
              <div className="bst-review-pred-table">
                <div className="bst-review-pred-hd">
                  <span>指標</span>
                  <span>基準預測</span>
                  <span>實際</span>
                  <span>偏差</span>
                  <span>落點</span>
                </div>
                {result.predictionComparison.map((row, i) => (
                  <div key={i} className="bst-review-pred-row">
                    <span className="bst-review-pred-metric">{row.metric}</span>
                    <span>{row.baseline || '—'}</span>
                    <span className="bst-review-pred-actual">{row.actual}</span>
                    <span className={`bst-review-deviation ${row.deviationPct?.startsWith('+') ? 'bst-dev-up' : row.deviationPct?.startsWith('-') ? 'bst-dev-down' : ''}`}>
                      {row.deviationPct === 'N/A' || !row.deviationPct ? '—' : row.deviationPct}
                    </span>
                    <span className={`bst-topic-badge ${BAND_CLASS[row.bandHit] ?? 'bst-badge-neutral'}`}>
                      {BAND_LABEL[row.bandHit] ?? row.bandHit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deviation reasons */}
          {result.deviationReasons?.length > 0 && (
            <div className="bst-review-section">
              <p className="bst-draft-section-label">偏差原因分析</p>
              <ul className="bst-az-risk-list">
                {result.deviationReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {/* Upside / uncertainty that played out */}
          {(result.upsideDriversThatPlayedOut?.length > 0 || result.uncertaintyThatMattered?.length > 0) && (
            <div className="bst-review-section bst-review-drivers-row">
              {result.upsideDriversThatPlayedOut?.length > 0 && (
                <div className="bst-predict-factor-group">
                  <span className="bst-predict-factor-label bst-predict-factor-up">發揮作用的上升因素</span>
                  <ul className="bst-predict-factor-list">
                    {result.upsideDriversThatPlayedOut.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {result.uncertaintyThatMattered?.length > 0 && (
                <div className="bst-predict-factor-group">
                  <span className="bst-predict-factor-label bst-predict-factor-risk">影響結果的不確定因素</span>
                  <ul className="bst-predict-factor-list">
                    {result.uncertaintyThatMattered.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Signal validation */}
          {result.signalValidation && (
            <div className="bst-review-section">
              <p className="bst-draft-section-label">信號驗證</p>
              <div className="bst-review-signals">
                {Object.entries(result.signalValidation).map(([k, v]) => {
                  const LABELS = { hookPayoff: 'Hook/兌現', shareMotivation: '分享動機', topicFreshness: '主題新鮮度', strangerFit: '陌生人適配' }
                  return v ? (
                    <div key={k} className="bst-az-style-field">
                      <span className="bst-topic-field-lbl">{LABELS[k] ?? k}</span>
                      <p className="bst-topic-field-val">{v}</p>
                    </div>
                  ) : null
                })}
              </div>
            </div>
          )}

          {/* Learning points */}
          {result.learningPoints?.length > 0 && (
            <div className="bst-review-section">
              <p className="bst-draft-section-label">學習點</p>
              <ul className="bst-draft-q-list">
                {result.learningPoints.map((lp, i) => (
                  <li key={i} className="bst-draft-q-item">{lp}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Calibration note */}
          {result.calibrationNotes && (
            <div className="bst-review-calibration">
              <span className="bst-draft-logic-label">校正備注</span>
              <span className="bst-draft-logic-text">{result.calibrationNotes}</span>
            </div>
          )}

          {/* Questions */}
          {result.questions?.length > 0 && (
            <div className="bst-draft-questions">
              <p className="bst-draft-section-label">跟進問題</p>
              <ul className="bst-draft-q-list">
                {result.questions.map((q, i) => <li key={i} className="bst-draft-q-item">{q}</li>)}
              </ul>
            </div>
          )}

          {/* Save */}
          <div className="bst-review-save-row">
            <button
              className="bst-btn bst-btn-primary"
              onClick={handleSave}
              disabled={saving || !selectedPost}
            >
              {saving ? '儲存中…' : '儲存復盤結果到 Tracker'}
            </button>
            {savedFlash && <span className="bst-voice-saved-chip">✓ 已儲存</span>}
            {!selectedPost && <span className="bst-topics-hint">需先選擇貼文才能儲存</span>}
          </div>
        </div>
      )}
    </div>
  )
}
