import { useState, useEffect } from 'react'
import { generateDraftPost } from '../../../services/gemini'
import { saveTracker } from '../../../services/booster'

const FRESHNESS_CLASS = { green: 'bst-badge-green', yellow: 'bst-badge-gold', red: 'bst-badge-red' }
const FRESHNESS_LABEL = { green: '可以發', yellow: '建議換角度', red: '風險高' }
const RISK_CLASS  = { none: 'bst-badge-neutral', recent: 'bst-badge-gold', high: 'bst-badge-red' }
const RISK_LABEL  = { none: '無重複', recent: '近期發過', high: '高重複風險' }
const VOICE_CLASS = { strong: 'bst-az-chip-on', usable: 'bst-az-chip-on', thin: 'bst-az-chip-off' }
const VOICE_LABEL = { strong: 'Brand Voice 完整', usable: '僅有風格指南', thin: '無語氣資料' }

const DEFAULT_SETTINGS = { freshnessGate: true, angleAlternatives: true, improvementQuestions: true }

function relativeTime(iso) {
  if (!iso) return null
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)   return '剛才'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  return `${Math.floor(diff / 86400)} 天前`
}

function Toggle({ label, active, onChange }) {
  return (
    <button
      className={`bst-draft-toggle ${active ? 'bst-draft-toggle-on' : 'bst-draft-toggle-off'}`}
      onClick={() => onChange(!active)}
      type="button"
    >
      {active ? '✓' : '○'} {label}
    </button>
  )
}

export function DraftPanel({ tracker, pendingTopic, onSendToAnalyze, onSendToPredict }) {
  const hasTracker = !!tracker?.tracker
  const posts      = tracker?.tracker?.posts ?? []

  const savedSettings = tracker?.config?.draft_settings ?? DEFAULT_SETTINGS

  const [topic, setTopic]       = useState('')
  const [settings, setSettings] = useState(savedSettings)
  const [result, setResult]         = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [draftText, setDraftText]   = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [copied, setCopied]         = useState(false)

  // Pre-fill from Topics → Draft
  useEffect(() => {
    if (pendingTopic) setTopic(pendingTopic)
  }, [pendingTopic])

  // Load last result from config on mount
  useEffect(() => {
    const saved = tracker?.config?.last_draft
    if (saved?.result) {
      setResult(saved.result)
      setDraftText(saved.result.draft ?? '')
      if (saved.topic) setTopic(saved.topic)
      setGeneratedAt(saved.generatedAt ?? null)
    } else {
      setGeneratedAt(null)
    }
    setSettings(tracker?.config?.draft_settings ?? DEFAULT_SETTINGS)
  }, [tracker?.handle])

  async function persistSettings(next) {
    setSettings(next)
    try {
      await saveTracker(tracker.handle, {
        config: { ...(tracker.config ?? {}), draft_settings: next }
      })
    } catch { /* non-critical */ }
  }

  async function handleGenerate() {
    if (!topic.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setDraftText('')
    try {
      const data = await generateDraftPost(
        topic.trim(),
        posts,
        tracker?.brand_voice ?? null,
        tracker?.style_guide ?? null,
        tracker?.concept_library ?? null,
        settings
      )
      const now = new Date().toISOString()
      setResult(data)
      setDraftText(data.draft ?? '')
      setGeneratedAt(now)
      // Persist last result
      await saveTracker(tracker.handle, {
        config: {
          ...(tracker.config ?? {}),
          last_draft: { result: data, topic: topic.trim(), generatedAt: now }
        }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draftText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (!hasTracker) {
    return (
      <div className="bst-panel bst-panel-locked">
        <div className="bst-lock-icon">↑</div>
        <p className="bst-lock-msg">請先在 Setup 完成歷史資料匯入</p>
      </div>
    )
  }

  const hasBrandVoice  = !!tracker?.brand_voice
  const hasStyleGuide  = !!tracker?.style_guide
  const voiceStatus    = hasBrandVoice ? 'strong' : hasStyleGuide ? 'usable' : 'thin'

  return (
    <div className="bst-panel">
      <div className="bst-topics-header-row">
        <div className="bst-panel-header">
          <h2 className="bst-panel-title">Draft</h2>
          <p className="bst-panel-desc">根據 Brand Voice 起草一篇 Threads 貼文。草稿是起點，預計你會自己修改。</p>
        </div>
        <span className={`bst-az-data-chip ${VOICE_CLASS[voiceStatus]}`}>
          {VOICE_LABEL[voiceStatus]}
        </span>
      </div>

      {voiceStatus === 'thin' && (
        <div className="bst-draft-voice-hint">
          建議先完成 Setup 匯入貼文，再跑 Voice 生成 Brand Voice，起草品質會更接近你的實際語感。
        </div>
      )}
      {voiceStatus === 'usable' && (
        <div className="bst-draft-voice-hint bst-draft-voice-hint-mid">
          只有風格指南，語氣對齊度中等。跑一次 Voice 可以讓起草更接近你的風格。
        </div>
      )}

      {/* Settings toggles */}
      <div className="bst-draft-config-bar">
        <span className="bst-draft-config-label">功能開關</span>
        <Toggle label="新鮮度檢查" active={settings.freshnessGate}
          onChange={v => persistSettings({ ...settings, freshnessGate: v })} />
        <Toggle label="角度建議" active={settings.angleAlternatives}
          onChange={v => persistSettings({ ...settings, angleAlternatives: v })} />
        <Toggle label="改進問題" active={settings.improvementQuestions}
          onChange={v => persistSettings({ ...settings, improvementQuestions: v })} />
      </div>

      {/* Topic input */}
      <div className="bst-draft-topic-area">
        <label className="bst-form-label">主題 / 角度</label>
        <div className="bst-draft-topic-row">
          <input
            className="bst-form-input bst-draft-topic-input"
            placeholder="輸入主題、觀點或角度…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && topic.trim() && handleGenerate()}
            disabled={loading}
          />
          <button
            className="bst-analyze-btn"
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
          >
            {loading ? '起草中…' : result ? '↻ 重新起草' : '✦ 起草'}
          </button>
          {generatedAt && !loading && (
            <span className="bst-topics-run-time">{relativeTime(generatedAt)}生成</span>
          )}
        </div>
      </div>

      {error && <div className="bst-setup-error">{error}</div>}

      {loading && (
        <div className="bst-topics-loading">
          <span className="bst-coming-dot" />
          Gemini 正在對齊你的 Brand Voice 起草…
        </div>
      )}

      {result && !loading && (
        <div className="bst-draft-results">

          {/* Freshness check */}
          {settings.freshnessGate && result.freshnessCheck && (
            <div className="bst-draft-freshness">
              <div className="bst-draft-freshness-hd">
                <span className="bst-draft-freshness-title">新鮮度檢查</span>
                <span className={`bst-topic-badge ${FRESHNESS_CLASS[result.freshnessCheck.decision] ?? 'bst-badge-neutral'}`}>
                  {FRESHNESS_LABEL[result.freshnessCheck.decision] ?? result.freshnessCheck.decision}
                </span>
                {result.freshnessCheck.internalRisk && result.freshnessCheck.internalRisk !== 'none' && (
                  <span className={`bst-topic-badge ${RISK_CLASS[result.freshnessCheck.internalRisk] ?? 'bst-badge-neutral'}`}>
                    {RISK_LABEL[result.freshnessCheck.internalRisk]}
                  </span>
                )}
                <span className="bst-topic-badge bst-badge-neutral">外部未驗證</span>
              </div>
              {result.freshnessCheck.decisionNote && (
                <p className="bst-draft-freshness-note">{result.freshnessCheck.decisionNote}</p>
              )}
              {result.freshnessCheck.riskNote && result.freshnessCheck.internalRisk !== 'none' && (
                <p className="bst-draft-freshness-note">{result.freshnessCheck.riskNote}</p>
              )}
            </div>
          )}

          {/* Draft */}
          <div className="bst-draft-textarea-wrap">
            <div className="bst-draft-textarea-hd">
              <span className="bst-draft-section-label">草稿</span>
              <div className="bst-draft-textarea-actions">
                <button className="bst-btn-sm" onClick={handleCopy} disabled={!draftText}>
                  {copied ? '✓ 已複製' : '複製'}
                </button>
                {onSendToAnalyze && (
                  <button
                    className="bst-btn-sm bst-btn-primary"
                    onClick={() => onSendToAnalyze(draftText)}
                    disabled={!draftText}
                  >
                    → Analyze
                  </button>
                )}
                {onSendToPredict && (
                  <button
                    className="bst-btn-sm"
                    onClick={() => onSendToPredict(draftText)}
                    disabled={!draftText}
                  >
                    → Predict
                  </button>
                )}
              </div>
            </div>
            <textarea
              className="bst-voice-editor bst-draft-textarea"
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              spellCheck={false}
            />
            {result.writingLogic && (
              <div className="bst-draft-logic">
                <span className="bst-draft-logic-label">起草邏輯</span>
                <span className="bst-draft-logic-text">{result.writingLogic}</span>
              </div>
            )}
          </div>

          {/* Angle alternatives */}
          {settings.angleAlternatives && result.angleAlternatives?.length > 0 && (
            <div className="bst-draft-angles">
              <p className="bst-draft-section-label">其他角度選項</p>
              {result.angleAlternatives.map((a, i) => (
                <div key={i} className="bst-draft-angle-card">
                  <div className="bst-draft-angle-hd">
                    <span className="bst-topic-rank">#{i + 1}</span>
                    <span className="bst-draft-angle-text">{a.angle}</span>
                    <button
                      className="bst-btn-sm"
                      onClick={() => { setTopic(a.angle); }}
                    >
                      用這個
                    </button>
                  </div>
                  {a.note && <p className="bst-draft-angle-note">{a.note}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Improvement questions */}
          {settings.improvementQuestions && result.improvementQuestions?.length > 0 && (
            <div className="bst-draft-questions">
              <p className="bst-draft-section-label">改進問題</p>
              <p className="bst-draft-questions-hint">回答任何一題後重新起草，草稿品質會更貼近你想要的方向。</p>
              <ul className="bst-draft-q-list">
                {result.improvementQuestions.map((q, i) => (
                  <li key={i} className="bst-draft-q-item">{q}</li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
