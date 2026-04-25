import { useState, useEffect } from 'react'
import { generatePrediction } from '../../../services/gemini'
import { saveTracker } from '../../../services/booster'

const CONF_CLASS = {
  Directional: 'bst-conf-gray',
  Weak:        'bst-conf-gold',
  Usable:      'bst-conf-teal',
  Strong:      'bst-conf-blue',
  Deep:        'bst-conf-green',
}

const TREND_CLASS = {
  '成長中':   'bst-badge-green',
  '持平':     'bst-badge-neutral',
  '下降中':   'bst-badge-red',
  '資料不足': 'bst-badge-neutral',
}

const METRICS = [
  { key: 'likes',   label: '讚' },
  { key: 'replies', label: '回覆' },
  { key: 'reposts', label: '轉發' },
]

function dataLevel(n) {
  if (n >= 50) return 'Deep'
  if (n >= 20) return 'Strong'
  if (n >= 10) return 'Usable'
  if (n >= 5)  return 'Weak'
  return 'Directional'
}

function relativeTime(iso) {
  if (!iso) return null
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return '剛才'
  if (diff < 3600)  return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  return `${Math.floor(diff / 86400)} 天前`
}

export function PredictPanel({ tracker, pendingText }) {
  const hasTracker = !!tracker?.tracker
  const posts      = tracker?.tracker?.posts ?? []
  const usable     = posts.filter(p => p.text && p.metrics && !p.is_reply_post)
  const level      = dataLevel(usable.length)

  const [postText, setPostText]     = useState('')
  const [result, setResult]         = useState(null)
  const [predictedAt, setPredictedAt] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  useEffect(() => {
    if (pendingText) setPostText(pendingText)
  }, [pendingText])

  useEffect(() => {
    const saved = tracker?.config?.last_prediction
    if (saved?.result) {
      setResult(saved.result)
      if (saved.postText) setPostText(saved.postText)
      setPredictedAt(saved.predictedAt ?? null)
    } else {
      setPredictedAt(null)
    }
  }, [tracker?.handle])

  async function handlePredict() {
    if (!postText.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const now = new Date().toISOString()
      const data = await generatePrediction(postText.trim(), usable)
      setResult(data)
      setPredictedAt(now)
      await saveTracker(tracker.handle, {
        config: {
          ...(tracker.config ?? {}),
          last_prediction: { result: data, postText: postText.trim(), predictedAt: now }
        }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
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

  const conf = result?.referenceStrength

  return (
    <div className="bst-panel">
      <div className="bst-topics-header-row">
        <div className="bst-panel-header">
          <h2 className="bst-panel-title">Predict</h2>
          <p className="bst-panel-desc">根據相似歷史貼文，預估這篇貼文 24 小時內的可能表現區間。</p>
        </div>
        <span className={`bst-conf-badge ${CONF_CLASS[level]}`}>
          {level} · {usable.length} 篇含指標
        </span>
      </div>

      {usable.length < 5 && (
        <div className="bst-draft-voice-hint">
          歷史資料含指標的貼文不足 5 篇，預測區間僅供方向參考，樣本過小無法做穩定的百分位數計算。
        </div>
      )}

      {/* Input */}
      <div className="bst-analyze-input-area">
        <textarea
          className="bst-analyze-textarea"
          placeholder="貼上待預測的貼文草稿…"
          rows={7}
          value={postText}
          onChange={e => setPostText(e.target.value)}
          disabled={loading}
        />
        <button
          className="bst-analyze-btn"
          onClick={handlePredict}
          disabled={loading || !postText.trim()}
        >
          {loading ? '預測中…' : result ? '↻ 重新預測' : '預測'}
        </button>
        {predictedAt && !loading && (
          <span className="bst-topics-run-time">{relativeTime(predictedAt)}預測</span>
        )}
      </div>

      {error && <div className="bst-setup-error">{error}</div>}

      {loading && (
        <div className="bst-topics-loading">
          <span className="bst-coming-dot" />
          Gemini 正在比對歷史相近貼文，計算表現區間…
        </div>
      )}

      {result && !loading && (
        <div className="bst-predict-results">

          {/* Post features */}
          {result.postFeatures && (
            <div className="bst-az-features-row">
              {[
                ['內容類型', result.postFeatures.contentType],
                ['Hook',     result.postFeatures.hookType],
                ['字數',     result.postFeatures.wordCount],
                ['情緒弧線', result.postFeatures.emotionalArc],
                ['結尾',     result.postFeatures.endingType],
              ].filter(([, v]) => v).map(([k, v]) => (
                <span key={k} className="bst-az-feature-chip">
                  <span className="bst-az-feature-key">{k}</span> {v}
                </span>
              ))}
            </div>
          )}

          {/* Prediction range table */}
          <div className="bst-predict-range-wrap">
            <div className="bst-predict-range-title">24 小時預測區間</div>
            <div className="bst-predict-range-table">
              <div className="bst-predict-range-hd">
                <span className="bst-predict-range-cell bst-predict-metric-col" />
                <span className="bst-predict-range-cell bst-predict-conservative">保守</span>
                <span className="bst-predict-range-cell bst-predict-baseline">基準</span>
                <span className="bst-predict-range-cell bst-predict-optimistic">樂觀</span>
              </div>
              {METRICS.map(({ key, label }) => {
                const r = result.prediction?.[key]
                if (!r) return null
                return (
                  <div key={key} className="bst-predict-range-row">
                    <span className="bst-predict-range-cell bst-predict-metric-col">{label}</span>
                    <span className="bst-predict-range-cell bst-predict-conservative">{r.conservative}</span>
                    <span className="bst-predict-range-cell bst-predict-baseline bst-predict-baseline-val">{r.baseline}</span>
                    <span className="bst-predict-range-cell bst-predict-optimistic">{r.optimistic}</span>
                  </div>
                )
              })}
            </div>
            {result.trendDirection && (
              <div className="bst-predict-trend">
                <span className={`bst-topic-badge ${TREND_CLASS[result.trendDirection] ?? 'bst-badge-neutral'}`}>
                  近期趨勢：{result.trendDirection}
                </span>
                {result.trendNote && <span className="bst-predict-trend-note">{result.trendNote}</span>}
              </div>
            )}
          </div>

          {/* Comparable posts */}
          {result.comparablePosts?.length > 0 && (
            <div className="bst-predict-comparables">
              <p className="bst-draft-section-label">相近歷史貼文（{result.comparablePosts.length} 篇）</p>
              {result.comparablePosts.map((p, i) => (
                <div key={i} className="bst-predict-comparable-card">
                  <div className="bst-predict-comparable-top">
                    <span className="bst-topic-rank">#{i + 1}</span>
                    <p className="bst-predict-comparable-text">{p.summary}</p>
                  </div>
                  <div className="bst-predict-comparable-meta">
                    <div className="bst-predict-comparable-metrics">
                      <span>讚 {p.likes ?? '—'}</span>
                      <span>回覆 {p.replies ?? '—'}</span>
                      <span>轉發 {p.reposts ?? '—'}</span>
                    </div>
                    {p.matchDimensions?.length > 0 && (
                      <div className="bst-predict-comparable-dims">
                        {p.matchDimensions.map((d, j) => (
                          <span key={j} className="bst-angle-chip">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upside + uncertainty */}
          {(result.upsideDrivers?.length > 0 || result.uncertaintyFactors?.length > 0) && (
            <div className="bst-predict-factors">
              {result.upsideDrivers?.length > 0 && (
                <div className="bst-predict-factor-group">
                  <span className="bst-predict-factor-label bst-predict-factor-up">上升空間</span>
                  <ul className="bst-predict-factor-list">
                    {result.upsideDrivers.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {result.uncertaintyFactors?.length > 0 && (
                <div className="bst-predict-factor-group">
                  <span className="bst-predict-factor-label bst-predict-factor-risk">不確定因素</span>
                  <ul className="bst-predict-factor-list">
                    {result.uncertaintyFactors.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Confidence footer */}
          {conf && (
            <div className="bst-topics-conf-footer">
              <span className={`bst-conf-level ${CONF_CLASS[conf.level] ?? 'bst-conf-gray'}`}>
                {conf.level}
              </span>
              <span className="bst-conf-msg">
                {conf.totalPosts} 篇歷史資料 · 使用 {conf.comparablePosts} 篇可比較貼文 · {conf.message}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
