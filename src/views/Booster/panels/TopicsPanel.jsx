import { useState, useEffect } from 'react'
import { generateTopicsRecommendation } from '../../../services/gemini'
import { saveTracker } from '../../../services/booster'

const SOURCE_LABELS = {
  comment_demand:        '留言需求',
  historical_performance:'歷史表現',
  concept_extension:     '概念延伸',
  content_balance:       '內容均衡',
}

const SOURCE_CLASSES = {
  comment_demand:        'bst-badge-teal',
  historical_performance:'bst-badge-blue',
  concept_extension:     'bst-badge-purple',
  content_balance:       'bst-badge-gold',
}

const FRESHNESS_LABELS = {
  green:      '外部新鮮',
  yellow:     '需要角度',
  red:        '已過熱',
  unverified: '外部未驗證',
}

const FRESHNESS_CLASSES = {
  green:      'bst-badge-green',
  yellow:     'bst-badge-gold',
  red:        'bst-badge-red',
  unverified: 'bst-badge-neutral',
}

const RISK_LABELS = {
  recent: '近期發過',
  high:   '⚠ 重複風險',
}

const CONFIDENCE_CLASSES = {
  Directional: 'bst-conf-gray',
  Weak:        'bst-conf-gold',
  Usable:      'bst-conf-teal',
  Strong:      'bst-conf-blue',
  Deep:        'bst-conf-green',
}

function relativeTime(iso) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins} 分鐘前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小時前`
  return `${Math.floor(hrs / 24)} 天前`
}

export function TopicsPanel({ tracker, onSendToDraft }) {
  const hasTracker = !!tracker?.tracker
  const posts = tracker?.tracker?.posts ?? []

  const [result, setResult]           = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [showInsights, setShowInsights] = useState(false)
  const [expanded, setExpanded]       = useState(new Set())

  useEffect(() => {
    const saved = tracker?.config?.last_topics
    if (saved?.result) {
      setResult(saved.result)
      setGeneratedAt(saved.generatedAt)
      setExpanded(new Set(saved.result.topics?.map((_, i) => i) ?? []))
    } else {
      setResult(null)
      setGeneratedAt(null)
      setExpanded(new Set())
    }
  }, [tracker?.handle])

  async function handleRefresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await generateTopicsRecommendation(
        posts,
        tracker?.style_guide ?? null,
        tracker?.concept_library ?? null
      )
      const now = new Date().toISOString()
      setResult(data)
      setGeneratedAt(now)
      setExpanded(new Set(data.topics?.map((_, i) => i) ?? []))
      await saveTracker(tracker.handle, {
        config: { ...(tracker.config ?? {}), last_topics: { result: data, generatedAt: now } }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleCard(i) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  if (!hasTracker) {
    return (
      <div className="bst-panel bst-panel-locked">
        <div className="bst-lock-icon">↑</div>
        <p className="bst-lock-msg">請先在 Setup 完成歷史資料匯入</p>
      </div>
    )
  }

  const conf = result?.dataConfidence

  return (
    <div className="bst-panel">
      <div className="bst-topics-header-row">
        <div className="bst-panel-header">
          <h2 className="bst-panel-title">Topics</h2>
          <p className="bst-panel-desc">綜合留言需求、歷史表現、語意新鮮度，推薦 3–5 個最值得發的下一篇主題。</p>
        </div>
        {conf && (
          <span className={`bst-conf-badge ${CONFIDENCE_CLASSES[conf.level] ?? 'bst-conf-gray'}`}>
            {conf.level} · {conf.totalPosts} 篇
          </span>
        )}
      </div>

      <div className="bst-topics-action-bar">
        <button
          className="bst-analyze-btn"
          onClick={handleRefresh}
          disabled={loading || posts.length === 0}
        >
          {loading ? '分析中…' : result ? '↻ 重新選題' : '✦ 開始選題'}
        </button>
        {generatedAt && !loading && (
          <span className="bst-topics-run-time">{relativeTime(generatedAt)}生成</span>
        )}
        {posts.length === 0 && (
          <span className="bst-topics-hint">請先在 Setup 匯入貼文資料</span>
        )}
      </div>

      {error && <div className="bst-setup-error">{error}</div>}

      {loading && (
        <div className="bst-topics-loading">
          <span className="bst-coming-dot" />
          Gemini 正在分析留言需求、歷史表現與語意新鮮度…
        </div>
      )}

      {result && !loading && (
        <>
          {/* Comment insights */}
          {(result.commentInsights?.topQuestions?.length > 0 ||
            result.commentInsights?.strongestEmotionalTopic) && (
            <div className="bst-topics-section">
              <button
                className="bst-topics-section-toggle"
                onClick={() => setShowInsights(v => !v)}
              >
                留言需求洞察
                <span className="bst-topics-arrow">{showInsights ? '▴' : '▾'}</span>
              </button>
              {showInsights && (
                <div className="bst-insights-body">
                  {result.commentInsights.topQuestions?.length > 0 && (
                    <div className="bst-insights-row">
                      <span className="bst-insights-label">高頻問題</span>
                      <ul className="bst-insights-list">
                        {result.commentInsights.topQuestions.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.commentInsights.strongestEmotionalTopic && (
                    <div className="bst-insights-row">
                      <span className="bst-insights-label">情緒最強</span>
                      <span className="bst-insights-value">{result.commentInsights.strongestEmotionalTopic}</span>
                    </div>
                  )}
                  {result.commentInsights.validatedDemand?.length > 0 && (
                    <div className="bst-insights-row">
                      <span className="bst-insights-label">驗證需求</span>
                      <ul className="bst-insights-list">
                        {result.commentInsights.validatedDemand.map((v, i) => <li key={i}>{v}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Topic cards */}
          <div className="bst-topics-cards">
            {result.topics?.map((topic, i) => (
              <div key={i} className="bst-topic-card">
                <div className="bst-topic-card-hd" onClick={() => toggleCard(i)}>
                  <div className="bst-topic-card-left">
                    <span className="bst-topic-rank">#{i + 1}</span>
                    <span className="bst-topic-name">{topic.name}</span>
                  </div>
                  <div className="bst-topic-badges">
                    <span className={`bst-topic-badge ${SOURCE_CLASSES[topic.source] ?? 'bst-badge-neutral'}`}>
                      {SOURCE_LABELS[topic.source] ?? topic.source}
                    </span>
                    <span className={`bst-topic-badge ${FRESHNESS_CLASSES[topic.freshness] ?? 'bst-badge-neutral'}`}>
                      {FRESHNESS_LABELS[topic.freshness] ?? topic.freshness}
                    </span>
                    {topic.selfRepetitionRisk && topic.selfRepetitionRisk !== 'none' && (
                      <span className="bst-topic-badge bst-badge-risk">
                        {RISK_LABELS[topic.selfRepetitionRisk] ?? topic.selfRepetitionRisk}
                      </span>
                    )}
                    <span className="bst-topic-expand-arrow">{expanded.has(i) ? '▴' : '▾'}</span>
                  </div>
                </div>

                {expanded.has(i) && (
                  <div className="bst-topic-card-body">
                    <div className="bst-topic-field">
                      <span className="bst-topic-field-lbl">推薦理由</span>
                      <p className="bst-topic-field-val">{topic.reasoning}</p>
                    </div>

                    {topic.comparablePost && (
                      <div className="bst-topic-field">
                        <span className="bst-topic-field-lbl">相近歷史貼文</span>
                        <p className="bst-topic-field-val bst-topic-comparable">{topic.comparablePost}</p>
                      </div>
                    )}

                    {topic.freshnessNote && (
                      <div className="bst-topic-field">
                        <span className="bst-topic-field-lbl">內部新鮮度</span>
                        <p className="bst-topic-field-val">{topic.freshnessNote}</p>
                      </div>
                    )}

                    {topic.selfRepetitionNote && topic.selfRepetitionRisk !== 'none' && (
                      <div className="bst-topic-field">
                        <span className="bst-topic-field-lbl">重複風險</span>
                        <p className="bst-topic-field-val">{topic.selfRepetitionNote}</p>
                      </div>
                    )}

                    {topic.angles?.length > 0 && (
                      <div className="bst-topic-field">
                        <span className="bst-topic-field-lbl">建議角度</span>
                        <div className="bst-topic-angles">
                          {topic.angles.map((a, j) => (
                            <span key={j} className="bst-angle-chip">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {topic.notes && (
                      <div className="bst-topic-field">
                        <span className="bst-topic-field-lbl">備註</span>
                        <p className="bst-topic-field-val bst-topic-notes">{topic.notes}</p>
                      </div>
                    )}

                    <div className="bst-topic-card-ft">
                      <button
                        className="bst-btn-sm bst-btn-primary"
                        onClick={() => onSendToDraft?.(topic.name)}
                      >
                        → 送到 Draft
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Reminders */}
          {result.reminders && (
            <div className="bst-topics-reminders">
              <div className="bst-reminders-chips">
                {result.reminders.daysSinceLastPost > 0 && (
                  <span className={`bst-reminder-chip${result.reminders.daysSinceLastPost >= 3 ? ' bst-reminder-warn' : ''}`}>
                    距上篇 {result.reminders.daysSinceLastPost} 天
                  </span>
                )}
                {result.reminders.recentTopics?.map((t, i) => (
                  <span key={i} className="bst-reminder-chip bst-reminder-topic">{t}</span>
                ))}
              </div>
              {result.reminders.warnings?.length > 0 && (
                <ul className="bst-reminders-warnings">
                  {result.reminders.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Confidence footer */}
          {conf && (
            <div className="bst-topics-conf-footer">
              <span className={`bst-conf-level ${CONFIDENCE_CLASSES[conf.level] ?? 'bst-conf-gray'}`}>
                {conf.level}
              </span>
              <span className="bst-conf-msg">{conf.message}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
