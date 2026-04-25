import { useState, useEffect, useRef } from 'react'
import { generateBrandVoice } from '../../../services/gemini'
import { saveBrandVoice } from '../../../services/booster'

const CONF_CLASS = {
  Directional: 'bst-conf-gray',
  Weak:        'bst-conf-gold',
  Usable:      'bst-conf-teal',
  Strong:      'bst-conf-blue',
  Deep:        'bst-conf-green',
}

function dataLevel(n) {
  if (n >= 50) return 'Deep'
  if (n >= 20) return 'Strong'
  if (n >= 10) return 'Usable'
  if (n >= 5)  return 'Weak'
  return 'Directional'
}

function extractGeneratedDate(md) {
  return md?.match(/生成日期：(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
}

function hasManualRefinements(md) {
  if (!md) return false
  const match = md.match(/## Manual Refinements[\s\S]*$/)
  if (!match) return false
  const body = match[0].replace(/## Manual Refinements[^\n]*\n/, '').replace(/> [^\n]*\n/g, '').trim()
  return body.replace(/^- [^\n]*$/gm, '').trim().length > 0
}

export function VoicePanel({ tracker, onRefresh }) {
  const hasTracker = !!tracker?.tracker
  const posts       = tracker?.tracker?.posts ?? []
  const totalPosts  = posts.filter(p => p.text && !p.is_reply_post).length
  const level       = dataLevel(totalPosts)

  const [voiceText, setVoiceText] = useState(tracker?.brand_voice ?? '')
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [dirty, setDirty]         = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError]         = useState(null)
  const textareaRef               = useRef(null)

  useEffect(() => {
    setVoiceText(tracker?.brand_voice ?? '')
    setDirty(false)
  }, [tracker?.handle])

  const hasVoice    = !!voiceText.trim()
  const genDate     = extractGeneratedDate(voiceText)
  const hasManual   = hasManualRefinements(voiceText)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const md = await generateBrandVoice(
        posts,
        tracker?.style_guide ?? null,
        hasVoice ? voiceText : null
      )
      setVoiceText(md)
      setDirty(false)
      await saveBrandVoice(tracker.handle, md)
      onRefresh?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveBrandVoice(tracker.handle, voiceText)
      setDirty(false)
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

  return (
    <div className="bst-panel">
      <div className="bst-topics-header-row">
        <div className="bst-panel-header">
          <h2 className="bst-panel-title">Voice</h2>
          <p className="bst-panel-desc">深度分析歷史貼文，萃取寫作聲音與風格特徵，生成可編輯的 Brand Voice 檔案供 Draft 使用。</p>
        </div>
        <span className={`bst-conf-badge ${CONF_CLASS[level]}`}>
          {level} · {totalPosts} 篇
        </span>
      </div>

      {/* Status */}
      {hasVoice && (
        <div className="bst-setup-status">
          <span className="bst-status-dot bst-status-dot-green" />
          <span className="bst-status-text">
            Brand Voice 已生成
            {genDate && <span className="bst-status-age"> · {genDate}</span>}
            {hasManual && <span className="bst-voice-manual-badge">已有 Manual Refinements</span>}
          </span>
        </div>
      )}

      {/* Action bar */}
      <div className="bst-topics-action-bar">
        <button
          className="bst-analyze-btn"
          onClick={handleGenerate}
          disabled={loading || totalPosts === 0}
        >
          {loading ? '生成中…' : hasVoice ? '↻ 重新生成' : '✦ 生成 Brand Voice'}
        </button>
        {totalPosts === 0 && (
          <span className="bst-topics-hint">請先在 Setup 匯入貼文資料</span>
        )}
      </div>

      {hasVoice && !loading && (
        <div className="bst-voice-regen-note">
          {hasManual
            ? '重新生成時會保留你的 Manual Refinements，其他段落會更新。'
            : '在文件最底部的 Manual Refinements 填入分析遺漏的細節，重新生成時會保留。'}
        </div>
      )}

      {error && <div className="bst-setup-error">{error}</div>}

      {loading && (
        <div className="bst-topics-loading">
          <span className="bst-coming-dot" />
          Gemini 正在分析你的寫作風格，這需要約 30–60 秒…
        </div>
      )}

      {/* Editor */}
      {hasVoice && !loading && (
        <div className="bst-voice-editor-wrap">
          <textarea
            ref={textareaRef}
            className="bst-voice-editor"
            value={voiceText}
            onChange={e => { setVoiceText(e.target.value); setDirty(true) }}
            spellCheck={false}
          />
          <div className="bst-voice-editor-footer">
            <div className="bst-voice-editor-left">
              {dirty && <span className="bst-voice-dirty-chip">未儲存的修改</span>}
              {savedFlash && <span className="bst-voice-saved-chip">✓ 已儲存</span>}
            </div>
            <button
              className="bst-btn bst-btn-primary"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? '儲存中…' : '儲存修改'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
