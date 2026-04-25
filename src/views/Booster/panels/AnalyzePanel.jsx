import { useState, useEffect } from 'react'
import { generatePostAnalysis } from '../../../services/gemini'
import { saveTracker } from '../../../services/booster'

const PRIORITY_CLASS = {
  'Must-fix': 'bst-priority-mustfix',
  'High':     'bst-priority-high',
  'Medium':   'bst-priority-medium',
  'Low':      'bst-priority-low',
}

const STRENGTH_CLASS = {
  high:   'bst-sig-high',
  medium: 'bst-sig-medium',
  low:    'bst-sig-low',
}

const STRENGTH_LABEL = { high: '強', medium: '中', low: '弱' }

const FIT_LABELS = {
  'follower-fit': '追蹤者適配',
  'stranger-fit': '陌生人適配',
  'both':         '兩者兼顧',
}

const DENSITY_CLASS = { '低': 'bst-density-low', '中': 'bst-density-mid', '高': 'bst-density-high' }

const GAP_CLASS = { low: 'bst-gap-low', medium: 'bst-gap-mid', high: 'bst-gap-high' }
const GAP_LABEL = { low: '低', medium: '中', high: '高' }

const CONF_CLASS = {
  Directional: 'bst-conf-gray',
  Weak:        'bst-conf-gold',
  Usable:      'bst-conf-teal',
  Strong:      'bst-conf-blue',
  Deep:        'bst-conf-green',
}

function relativeTime(iso) {
  if (!iso) return null
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return '剛才'
  if (diff < 3600)  return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  return `${Math.floor(diff / 86400)} 天前`
}

function Section({ id, title, badge, collapsed, onToggle, children }) {
  return (
    <div className="bst-az-section">
      <button className="bst-az-section-hd" onClick={() => onToggle(id)}>
        <span className="bst-az-section-title">
          {title}
          {badge && <span className="bst-az-section-badge">{badge}</span>}
        </span>
        <span className="bst-az-section-arrow">{collapsed ? '▾' : '▴'}</span>
      </button>
      {!collapsed && <div className="bst-az-section-body">{children}</div>}
    </div>
  )
}

export function AnalyzePanel({ tracker, pendingText }) {
  const posts     = tracker?.tracker?.posts ?? []
  const hasData   = posts.length > 0
  const hasStyle  = !!tracker?.style_guide
  const hasVoice  = !!tracker?.brand_voice

  const [postText, setPostText]       = useState('')
  const [result, setResult]           = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)

  useEffect(() => {
    if (pendingText) setPostText(pendingText)
  }, [pendingText])

  useEffect(() => {
    const saved = tracker?.config?.last_analyze
    if (saved?.result) {
      setResult(saved.result)
      if (saved.postText && !pendingText) setPostText(saved.postText)
      setGeneratedAt(saved.generatedAt ?? null)
    } else {
      setGeneratedAt(null)
    }
  }, [tracker?.handle])
  const [collapsed, setCollapsed] = useState(
    new Set(['styleMatching', 'psychologyAnalysis', 'upsideComparisons', 'algorithmSignals'])
  )

  function toggleSection(id) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleAnalyze() {
    if (!postText.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await generatePostAnalysis(
        postText.trim(),
        posts,
        tracker?.style_guide ?? null,
        tracker?.brand_voice ?? null
      )
      const now = new Date().toISOString()
      setResult(data)
      setGeneratedAt(now)
      setCollapsed(new Set(['styleMatching', 'psychologyAnalysis', 'upsideComparisons', 'algorithmSignals']))
      if (tracker?.handle) {
        try {
          await saveTracker(tracker.handle, {
            config: {
              ...(tracker.config ?? {}),
              last_analyze: { result: data, postText: postText.trim(), generatedAt: now },
            },
          })
        } catch { /* non-critical */ }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const conf = result?.referenceStrength

  return (
    <div className="bst-panel">
      <div className="bst-panel-header">
        <h2 className="bst-panel-title">Analyze</h2>
        <p className="bst-panel-desc">貼上任一篇貼文草稿，進行演算法紅線掃描、風格比對、心理學分析與 AI 味偵測。無需設定即可使用。</p>
      </div>

      {/* Data context bar */}
      <div className="bst-az-data-bar">
        <span className={`bst-az-data-chip ${hasData ? 'bst-az-chip-on' : 'bst-az-chip-off'}`}>
          {hasData ? `${posts.length} 篇歷史資料` : '無歷史資料'}
        </span>
        {hasStyle && <span className="bst-az-data-chip bst-az-chip-on">風格指南</span>}
        {hasVoice && <span className="bst-az-data-chip bst-az-chip-on">Brand Voice</span>}
        {!hasData && <span className="bst-az-data-note">分析仍可運作，但無個人化比對</span>}
      </div>

      {/* Input */}
      <div className="bst-analyze-input-area">
        <textarea
          className="bst-analyze-textarea"
          placeholder="貼上你的貼文草稿…"
          rows={8}
          value={postText}
          onChange={e => setPostText(e.target.value)}
          disabled={loading}
        />
        <button
          className="bst-analyze-btn"
          onClick={handleAnalyze}
          disabled={loading || !postText.trim()}
        >
          {loading ? '分析中…' : result ? '↻ 重新分析' : '分析'}
        </button>
        {generatedAt && !loading && (
          <span className="bst-topics-run-time">{relativeTime(generatedAt)}分析</span>
        )}
      </div>

      {error && <div className="bst-setup-error">{error}</div>}

      {loading && (
        <div className="bst-topics-loading">
          <span className="bst-coming-dot" />
          Gemini 正在掃描紅線、比對風格、分析心理訊號…
        </div>
      )}

      {result && !loading && (
        <div className="bst-az-results">
          {/* 1. Red Lines */}
          <Section id="redLines" title="演算法紅線"
            badge={result.redLines?.length > 0 ? `${result.redLines.length} 項警告` : null}
            collapsed={collapsed.has('redLines')} onToggle={toggleSection}
          >
            {result.redLines?.length === 0
              ? <div className="bst-az-no-redlines">✓ 未命中任何紅線</div>
              : result.redLines.map((r, i) => (
                <div key={i} className="bst-az-redline-card">
                  <div className="bst-az-redline-hd">
                    <span className="bst-az-redline-code">{r.code}</span>
                    <span className="bst-az-redline-label">{r.label}</span>
                  </div>
                  <p className="bst-az-redline-detail">{r.detail}</p>
                </div>
              ))
            }
          </Section>

          {/* 2. Decision Summary */}
          <Section id="decisionSummary" title="決策摘要"
            collapsed={collapsed.has('decisionSummary')} onToggle={toggleSection}
          >
            <div className="bst-az-decision-grid">
              <div className="bst-az-decision-card">
                <span className="bst-az-decision-label">最大上升空間</span>
                <p className="bst-az-decision-val">{result.decisionSummary?.strongestUpside}</p>
              </div>
              <div className="bst-az-decision-card bst-az-decision-blocker">
                <span className="bst-az-decision-label">主要擴散阻力</span>
                <p className="bst-az-decision-val">{result.decisionSummary?.mainBlocker}</p>
              </div>
              <div className="bst-az-decision-card">
                <span className="bst-az-decision-label">適配類型</span>
                <p className="bst-az-decision-val">
                  {FIT_LABELS[result.decisionSummary?.fit] ?? result.decisionSummary?.fit}
                </p>
                {result.decisionSummary?.fitNote && (
                  <p className="bst-az-decision-note">{result.decisionSummary.fitNote}</p>
                )}
              </div>
            </div>
            {result.postFeatures && (
              <div className="bst-az-features-row">
                {[
                  ['內容類型', result.postFeatures.contentType],
                  ['Hook 類型', result.postFeatures.hookType],
                  ['字數', result.postFeatures.wordCount],
                  ['情緒弧線', result.postFeatures.emotionalArc],
                  ['結尾模式', result.postFeatures.endingPattern],
                ].map(([k, v]) => v ? (
                  <span key={k} className="bst-az-feature-chip">
                    <span className="bst-az-feature-key">{k}</span> {v}
                  </span>
                ) : null)}
              </div>
            )}
          </Section>

          {/* 3. Proposed Changes */}
          <Section id="proposedChanges" title="建議修改（精確定位）"
            badge={result.proposedChanges?.length > 0 ? `${result.proposedChanges.length} 項` : '無'}
            collapsed={collapsed.has('proposedChanges')} onToggle={toggleSection}
          >
            {result.proposedChanges?.length === 0
              ? <p className="bst-az-no-changes">這篇貼文目前沒有需要修改的地方。</p>
              : result.proposedChanges.map((c, i) => (
                <div key={i} className="bst-az-change-item">
                  <div className="bst-az-change-hd">
                    <span className={`bst-az-priority ${PRIORITY_CLASS[c.priority] ?? ''}`}>
                      {c.priority}
                    </span>
                    <span className="bst-az-change-where">{c.where}</span>
                  </div>
                  <p className="bst-az-change-issue">{c.issue}</p>
                  <div className="bst-az-change-suggestion">
                    <span className="bst-az-change-suggestion-label">建議改法</span>
                    <p>{c.suggestedChange}</p>
                  </div>
                  <p className="bst-az-change-why">{c.why}</p>
                </div>
              ))
            }
          </Section>

          {/* 4. AI Tone Detection */}
          <Section id="aiDetection" title="AI 味偵測"
            badge={result.aiToneDetection?.totalTriggered > 0
              ? `${result.aiToneDetection.totalTriggered} 項` : null}
            collapsed={collapsed.has('aiDetection')} onToggle={toggleSection}
          >
            {result.aiToneDetection && (
              <>
                <div className="bst-az-ai-summary">
                  <span className={`bst-az-density-badge ${DENSITY_CLASS[result.aiToneDetection.density] ?? ''}`}>
                    AI 味濃度：{result.aiToneDetection.density}
                  </span>
                  <span className="bst-az-ai-counts">
                    確定 {result.aiToneDetection.definiteCount ?? 0} 項 ·
                    可能 {result.aiToneDetection.possibleCount ?? 0} 項
                  </span>
                  {result.aiToneDetection.densityNote && (
                    <span className="bst-az-ai-note">{result.aiToneDetection.densityNote}</span>
                  )}
                </div>
                {result.aiToneDetection.definite?.length > 0 && (
                  <div className="bst-az-ai-group">
                    <span className="bst-az-ai-group-label">確定有 AI 味</span>
                    {result.aiToneDetection.definite.map((item, i) => (
                      <div key={i} className="bst-az-ai-item bst-az-ai-definite">
                        <span className="bst-az-ai-location">{item.location}</span>
                        <span className="bst-az-ai-trigger">{item.trigger}</span>
                        <p className="bst-az-ai-expl">{item.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
                {result.aiToneDetection.possible?.length > 0 && (
                  <div className="bst-az-ai-group">
                    <span className="bst-az-ai-group-label">可能有 AI 味</span>
                    {result.aiToneDetection.possible.map((item, i) => (
                      <div key={i} className="bst-az-ai-item bst-az-ai-possible">
                        <span className="bst-az-ai-location">{item.location}</span>
                        <span className="bst-az-ai-trigger">{item.trigger}</span>
                        <p className="bst-az-ai-expl">{item.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
                {result.aiToneDetection.definite?.length === 0 &&
                 result.aiToneDetection.possible?.length === 0 && (
                  <div className="bst-az-no-redlines">✓ 未偵測到明顯 AI 痕跡</div>
                )}
              </>
            )}
          </Section>

          {/* 5. Suppression Risks */}
          <Section id="suppressionRisks" title="壓制風險"
            badge={result.suppressionRisks?.length > 0 ? `${result.suppressionRisks.length} 項` : null}
            collapsed={collapsed.has('suppressionRisks')} onToggle={toggleSection}
          >
            {result.suppressionRisks?.length === 0
              ? <div className="bst-az-no-redlines">✓ 未識別到明顯壓制風險</div>
              : <ul className="bst-az-risk-list">
                  {result.suppressionRisks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
            }
          </Section>

          {/* 6. Algorithm Signals */}
          <Section id="algorithmSignals" title="演算法信號評估"
            collapsed={collapsed.has('algorithmSignals')} onToggle={toggleSection}
          >
            <div className="bst-az-signal-grid">
              {result.algorithmSignals?.map((sig, i) => (
                <div key={i} className="bst-az-signal-card">
                  <div className="bst-az-signal-hd">
                    <span className="bst-az-signal-label">{sig.label}</span>
                    <span className={`bst-az-signal-strength ${STRENGTH_CLASS[sig.strength] ?? ''}`}>
                      {STRENGTH_LABEL[sig.strength] ?? sig.strength}
                    </span>
                  </div>
                  <p className="bst-az-signal-assessment">{sig.assessment}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 7. Style Matching */}
          <Section id="styleMatching" title="風格比對"
            collapsed={collapsed.has('styleMatching')} onToggle={toggleSection}
          >
            {!hasData
              ? <p className="bst-az-no-data-note">無歷史資料，跳過個人化風格比對</p>
              : result.styleMatching && (
                <div className="bst-az-style-fields">
                  {[
                    ['Hook 類型', result.styleMatching.hookTypeNote],
                    ['字數', result.styleMatching.wordCountNote],
                    ['結尾模式', result.styleMatching.endingPatternNote],
                    ['內容類型', result.styleMatching.contentTypeNote],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} className="bst-az-style-field">
                      <span className="bst-topic-field-lbl">{label}</span>
                      <p className="bst-topic-field-val">{val}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </Section>

          {/* 8. Psychology Analysis */}
          <Section id="psychologyAnalysis" title="心理學分析"
            collapsed={collapsed.has('psychologyAnalysis')} onToggle={toggleSection}
          >
            {result.psychologyAnalysis && (
              <div className="bst-az-psych">
                <div className="bst-az-psych-row">
                  <span className="bst-az-psych-label">Hook 機制</span>
                  <span className="bst-az-psych-val">{result.psychologyAnalysis.hookMechanism}</span>
                </div>
                <div className="bst-az-psych-row">
                  <span className="bst-az-psych-label">Hook/Payoff 落差</span>
                  <span className={`bst-az-gap-badge ${GAP_CLASS[result.psychologyAnalysis.hookPayoffGap] ?? ''}`}>
                    {GAP_LABEL[result.psychologyAnalysis.hookPayoffGap] ?? result.psychologyAnalysis.hookPayoffGap}
                  </span>
                  <span className="bst-az-psych-note">{result.psychologyAnalysis.hookPayoffNote}</span>
                </div>
                {result.psychologyAnalysis.emotionalArcNote && (
                  <div className="bst-az-psych-row">
                    <span className="bst-az-psych-label">情緒弧線</span>
                    <span className="bst-az-psych-note">{result.psychologyAnalysis.emotionalArcNote}</span>
                  </div>
                )}
                <div className="bst-az-share-grid">
                  {[
                    ['私訊轉傳', result.psychologyAnalysis.dmForwardability],
                    ['公開轉發', result.psychologyAnalysis.publicRepostability],
                    ['身份訊號', result.psychologyAnalysis.identitySignal],
                    ['實用分享', result.psychologyAnalysis.utilityShare],
                  ].map(([label, val]) => (
                    <div key={label} className="bst-az-share-item">
                      <span className="bst-az-share-label">{label}</span>
                      <span className={`bst-az-signal-strength ${STRENGTH_CLASS[val] ?? ''}`}>
                        {STRENGTH_LABEL[val] ?? val}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="bst-az-psych-row">
                  <span className="bst-az-psych-label">可轉述性</span>
                  <span className={`bst-az-signal-strength ${STRENGTH_CLASS[result.psychologyAnalysis.retellability] ?? ''}`}>
                    {STRENGTH_LABEL[result.psychologyAnalysis.retellability] ?? result.psychologyAnalysis.retellability}
                  </span>
                  <span className="bst-az-psych-note">{result.psychologyAnalysis.retellabilityNote}</span>
                </div>
                <div className="bst-az-psych-row">
                  <span className="bst-az-psych-label">留言深度觸發</span>
                  <span className={`bst-az-signal-strength ${STRENGTH_CLASS[result.psychologyAnalysis.commentDepth] ?? ''}`}>
                    {STRENGTH_LABEL[result.psychologyAnalysis.commentDepth] ?? result.psychologyAnalysis.commentDepth}
                  </span>
                  <span className="bst-az-psych-note">{result.psychologyAnalysis.commentDepthNote}</span>
                </div>
              </div>
            )}
          </Section>

          {/* 9. Upside Comparisons */}
          <Section id="upsideComparisons" title="歷史表現比對"
            collapsed={collapsed.has('upsideComparisons')} onToggle={toggleSection}
          >
            {!hasData
              ? <p className="bst-az-no-data-note">無歷史資料，跳過表現比對</p>
              : <p className="bst-az-upside-text">{result.upsideComparisons}</p>
            }
          </Section>

          {/* Reference Strength — always visible */}
          {conf && (
            <div className="bst-topics-conf-footer">
              <span className={`bst-conf-level ${CONF_CLASS[conf.level] ?? 'bst-conf-gray'}`}>
                {conf.level}
              </span>
              <span className="bst-conf-msg">
                {conf.dataPath} · {conf.totalPosts} 篇 · 相近貼文 {conf.comparablePosts} 篇 · {conf.message}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
