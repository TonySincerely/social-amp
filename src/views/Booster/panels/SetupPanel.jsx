import { useState, useEffect, useRef } from 'react'
import {
  probeBoosterServer,
  startProfileScrape, stopProfileScrape, createProfileLogStream,
  startApiFetch, stopApiFetch, createApiFetchStream,
  saveTrackerPosts, saveStyleGuide, saveConceptLibrary,
} from '../../../services/booster'
import {
  generateBoosterStyleGuide,
  generateBoosterConceptLibrary,
  normalizePostsWithGemini,
} from '../../../services/gemini'

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小時前`
  return `${Math.floor(hrs / 24)} 天前`
}

function detectJsonFormat(obj) {
  // Meta Threads API paginated response
  if (obj?.data && Array.isArray(obj.data) && obj.data[0]?.timestamp) return 'threads-api'
  // Meta account data export
  if (obj?.threads_v2 || obj?.threads_activity_report) return 'meta-export'
  // Raw array of post objects
  if (Array.isArray(obj) && obj[0]?.text !== undefined) return 'raw-array'
  // Tracker JSON (v1 schema)
  if (obj?.posts && Array.isArray(obj.posts) && obj.account) return 'tracker-v1'
  // Legacy tracker (dict-based posts)
  if (obj?.posts && !Array.isArray(obj.posts)) return 'tracker-legacy'
  return 'unknown'
}

function normalizeApiResponse(data) {
  return data.map(p => ({
    id:           p.id,
    text:         p.text || null,
    created_at:   p.timestamp ? new Date(p.timestamp).toISOString() : null,
    permalink:    p.permalink || null,
    media_type:   mapThreadsApiMediaType(p.media_type),
    is_reply_post: false,
    metrics: {
      views:   p.views   ?? 0,
      likes:   p.like_count ?? 0,
      replies: p.replies_count ?? 0,
      reposts: p.repost_count ?? 0,
      quotes:  p.quote_count ?? 0,
      shares:  0,
    },
  })).filter(p => p.text)
}

function mapThreadsApiMediaType(t) {
  if (t === 'VIDEO')          return 'VIDEO'
  if (t === 'CAROUSEL_ALBUM') return 'CAROUSEL'
  if (t === 'IMAGE')          return 'IMAGE'
  return 'TEXT'
}

function normalizeMetaExport(obj) {
  const posts = []
  const report = obj.threads_v2 || obj.threads_activity_report || []
  for (const account of report) {
    const media = account.media || account.threads_data || []
    for (const entry of media) {
      const post = entry.post || entry
      const data = post.data || []
      const text = data[0]?.post || post.text || null
      const ts   = post.timestamp || entry.timestamp
      if (!text) continue
      posts.push({
        id:          String(post.id || `export-${Math.random().toString(36).slice(2)}`),
        text,
        created_at:  ts ? new Date(ts * 1000).toISOString() : null,
        media_type:  'TEXT',
        is_reply_post: false,
        metrics:     { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 },
      })
    }
  }
  return posts
}

function normalizeTrackerV1(obj) {
  return obj.posts.filter(p => p.text).map(p => ({
    id:          p.id,
    text:        p.text,
    created_at:  p.created_at || null,
    permalink:   p.permalink || null,
    media_type:  p.media_type || 'TEXT',
    is_reply_post: p.is_reply_post || false,
    metrics:     p.metrics || { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 },
    comments:    p.comments || [],
    topics:      p.topics || [],
  }))
}

function normalizeLegacyTracker(obj) {
  return Object.entries(obj.posts).map(([id, p]) => ({
    id,
    text:        p.title || p.text || null,
    created_at:  p.date ? new Date(p.date).toISOString() : null,
    media_type:  'TEXT',
    is_reply_post: false,
    metrics: {
      views:   p.data_snapshots?.[p.data_snapshots.length - 1]?.views_count ?? 0,
      likes:   p.data_snapshots?.[p.data_snapshots.length - 1]?.likes_count ?? 0,
      replies: p.data_snapshots?.[p.data_snapshots.length - 1]?.replies_count ?? 0,
      reposts: 0, quotes: 0, shares: 0,
    },
  })).filter(p => p.text)
}

function normalizeRawArray(arr) {
  return arr.filter(p => p.text).map((p, i) => ({
    id:          p.id || p.post_id || `paste-${i}`,
    text:        p.text,
    created_at:  p.created_at || p.timestamp || null,
    media_type:  p.media_type || 'TEXT',
    is_reply_post: p.is_reply_post || false,
    metrics: p.metrics || {
      views:   p.views ?? 0,
      likes:   p.likes ?? p.like_count ?? 0,
      replies: p.replies ?? p.replies_count ?? 0,
      reposts: p.reposts ?? p.repost_count ?? 0,
      quotes:  p.quotes ?? 0,
      shares:  p.shares ?? 0,
    },
  }))
}

// ── Main component ────────────────────────────────────────────────────────────

export function SetupPanel({ tracker, onRefresh }) {
  const handle      = tracker?.handle ?? ''
  const posts       = tracker?.tracker?.posts ?? []
  const postCount   = posts.length
  const lastUpdated = tracker?.tracker?.last_updated ?? null
  const hasStyleGuide      = !!tracker?.style_guide
  const hasConceptLibrary  = !!tracker?.concept_library

  const [serverReachable, setServerReachable] = useState(null)
  const [selectedPath, setSelectedPath]       = useState(postCount > 0 ? null : 'scrape')

  // Path A (API fetch via server)
  const [apiToken, setApiToken]           = useState('')
  const [apiLimit, setApiLimit]           = useState(200)
  const [apiFetching, setApiFetching]     = useState(false)
  const [apiLogs, setApiLogs]             = useState([])
  const [apiLogsOpen, setApiLogsOpen]     = useState(false)
  const apiStreamRef = useRef(null)

  // Path B (file upload)
  const [filePreview, setFilePreview]     = useState(null) // { posts, source, error }
  const [fileParsing, setFileParsing]     = useState(false)
  const [fileSaving, setFileSaving]       = useState(false)

  // Path C (paste)
  const [pasteText, setPasteText]         = useState('')
  const [pasteParsing, setPasteParsing]   = useState(false)
  const [pastePreview, setPastePreview]   = useState(null) // { posts, source }
  const [pasteSaving, setPasteSaving]     = useState(false)

  // Path D (profile scrape)
  const [postTarget, setPostTarget]       = useState(50)
  const [repliesTarget, setRepliesTarget] = useState(20)
  const [scrapingMode, setScrapingMode]   = useState(null) // 'posts' | 'replies' | null
  const [scrapeLogs, setScrapeLogs]       = useState([])
  const [scrapeLogsOpen, setScrapeLogsOpen] = useState(false)
  const scrapeStreamRef = useRef(null)

  // Artifacts
  const [genStyleGuide, setGenStyleGuide] = useState(false)
  const [genConceptLib, setGenConceptLib] = useState(false)
  const [artifactError, setArtifactError] = useState(null)
  const [viewStyleGuide, setViewStyleGuide]     = useState(false)
  const [viewConceptLibrary, setViewConceptLibrary] = useState(false)

  const [error, setError] = useState(null)
  const logsEndRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    probeBoosterServer().then(ok => { if (!cancelled) setServerReachable(ok) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [scrapeLogs, apiLogs])

  useEffect(() => () => {
    scrapeStreamRef.current?.close()
    apiStreamRef.current?.close()
  }, [])

  // ── Path A: API fetch ─────────────────────────────────────────────────────

  async function handleApiFetch() {
    setError(null); setApiLogs([]); setApiLogsOpen(true); setApiFetching(true)
    apiStreamRef.current?.close()
    apiStreamRef.current = createApiFetchStream(line => {
      setApiLogs(p => [...p, line])
      if (line === '[fetch complete]') { setApiFetching(false); apiStreamRef.current?.close(); onRefresh?.() }
      if (line.startsWith('[fetch exited')) { setApiFetching(false); apiStreamRef.current?.close() }
    })
    try {
      await startApiFetch(handle.replace(/^@/, ''), apiToken, apiLimit)
    } catch (e) { setError(e.message); setApiFetching(false); apiStreamRef.current?.close() }
  }

  // ── Path B: File upload ───────────────────────────────────────────────────

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileParsing(true); setFilePreview(null); setError(null)
    try {
      const text = await file.text()
      let parsed
      try { parsed = JSON.parse(text) } catch { throw new Error('檔案不是有效的 JSON 格式') }
      const fmt = detectJsonFormat(parsed)
      let posts = []
      if (fmt === 'threads-api')    posts = normalizeApiResponse(parsed.data || parsed)
      else if (fmt === 'meta-export')   posts = normalizeMetaExport(parsed)
      else if (fmt === 'tracker-v1')    posts = normalizeTrackerV1(parsed)
      else if (fmt === 'tracker-legacy') posts = normalizeLegacyTracker(parsed)
      else if (fmt === 'raw-array')     posts = normalizeRawArray(parsed)
      else throw new Error('無法辨識的 JSON 格式，請嘗試「直接貼上資料」路徑')
      setFilePreview({ posts, source: `file-${fmt}` })
    } catch (e) { setError(e.message) }
    finally { setFileParsing(false); e.target.value = '' }
  }

  async function handleFileSave() {
    if (!filePreview?.posts?.length) return
    setFileSaving(true); setError(null)
    try {
      await saveTrackerPosts(handle, filePreview.posts, filePreview.source)
      setFilePreview(null)
      onRefresh?.()
    } catch (e) { setError(e.message) }
    finally { setFileSaving(false) }
  }

  // ── Path C: Paste ─────────────────────────────────────────────────────────

  async function handlePasteParse() {
    if (!pasteText.trim()) return
    setPasteParsing(true); setPastePreview(null); setError(null)
    try {
      // Try JSON first
      let posts = null
      try {
        const obj = JSON.parse(pasteText.trim())
        const fmt = detectJsonFormat(obj)
        if (fmt === 'threads-api')     posts = normalizeApiResponse(obj.data || obj)
        else if (fmt === 'meta-export')    posts = normalizeMetaExport(obj)
        else if (fmt === 'tracker-v1')     posts = normalizeTrackerV1(obj)
        else if (fmt === 'tracker-legacy') posts = normalizeLegacyTracker(obj)
        else if (fmt === 'raw-array')      posts = normalizeRawArray(obj)
      } catch { /* not JSON — fall through to Gemini */ }

      if (!posts) {
        // Use Gemini to extract posts from unstructured text
        const extracted = await normalizePostsWithGemini(pasteText)
        posts = extracted.filter(p => p.text).map((p, i) => ({
          id:         `paste-${Date.now()}-${i}`,
          text:       p.text,
          created_at: p.created_at || null,
          media_type: 'TEXT',
          is_reply_post: false,
          metrics:    { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 },
        }))
      }

      if (!posts.length) throw new Error('未能從輸入內容中提取任何貼文')
      setPastePreview({ posts, source: 'paste' })
    } catch (e) { setError(e.message) }
    finally { setPasteParsing(false) }
  }

  async function handlePasteSave() {
    if (!pastePreview?.posts?.length) return
    setPasteSaving(true); setError(null)
    try {
      await saveTrackerPosts(handle, pastePreview.posts, pastePreview.source)
      setPastePreview(null); setPasteText('')
      onRefresh?.()
    } catch (e) { setError(e.message) }
    finally { setPasteSaving(false) }
  }

  // ── Path D: Profile scrape ────────────────────────────────────────────────

  function startScrapeStream(mode) {
    setError(null); setScrapeLogs([]); setScrapeLogsOpen(true); setScrapingMode(mode)
    scrapeStreamRef.current?.close()
    scrapeStreamRef.current = createProfileLogStream(line => {
      setScrapeLogs(p => [...p, line])
      if (line === '[scrape complete]') { setScrapingMode(null); scrapeStreamRef.current?.close(); onRefresh?.() }
      if (line.startsWith('[scrape exited')) { setScrapingMode(null); scrapeStreamRef.current?.close() }
    })
  }

  async function handleScrapePosts() {
    startScrapeStream('posts')
    try {
      await startProfileScrape(handle.replace(/^@/, ''), postTarget, 0)
    } catch (e) { setError(e.message); setScrapingMode(null); scrapeStreamRef.current?.close() }
  }

  async function handleScrapeReplies() {
    startScrapeStream('replies')
    try {
      await startProfileScrape(handle.replace(/^@/, ''), 0, repliesTarget)
    } catch (e) { setError(e.message); setScrapingMode(null); scrapeStreamRef.current?.close() }
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────

  async function handleGenerateStyleGuide() {
    setArtifactError(null); setGenStyleGuide(true)
    try {
      const md = await generateBoosterStyleGuide(posts)
      await saveStyleGuide(handle, md)
      onRefresh?.()
    } catch (e) { setArtifactError(e.message) }
    finally { setGenStyleGuide(false) }
  }

  async function handleGenerateConceptLibrary() {
    setArtifactError(null); setGenConceptLib(true)
    try {
      const md = await generateBoosterConceptLibrary(posts)
      await saveConceptLibrary(handle, md)
      onRefresh?.()
    } catch (e) { setArtifactError(e.message) }
    finally { setGenConceptLib(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const paths = [
    { key: 'api',     label: 'Meta Threads API',  tag: '推薦', needsServer: true,  phase: null },
    { key: 'export',  label: '上傳 JSON 匯出檔',  tag: null,   needsServer: false, phase: null },
    { key: 'paste',   label: '直接貼上資料',       tag: null,   needsServer: false, phase: null },
    { key: 'scrape',  label: '抓取個人頁面',       tag: null,   needsServer: true,  phase: null },
    { key: 'migrate', label: '從舊版 Tracker 遷移', tag: null,   needsServer: false, phase: null },
  ]

  return (
    <div className="bst-panel">
      <div className="bst-panel-header">
        <h2 className="bst-panel-title">Setup</h2>
        <p className="bst-panel-desc">匯入您的 Threads 歷史貼文，建立個人化的分析基礎。</p>
      </div>

      {postCount > 0 && (
        <div className="bst-setup-status">
          <span className="bst-status-dot bst-status-dot-green" />
          <span className="bst-status-text">
            已匯入 <strong>{postCount}</strong> 篇貼文
            {lastUpdated && <span className="bst-status-age"> · 上次更新 {timeAgo(lastUpdated)}</span>}
          </span>
        </div>
      )}

      {error && <div className="bst-setup-error">{error}</div>}

      {/* ── Path tabs ── */}
      <div className="bst-path-tabs">
        {paths.map(p => (
          <button
            key={p.key}
            className={`bst-path-tab${selectedPath === p.key ? ' bst-path-tab-active' : ''}`}
            onClick={() => setSelectedPath(selectedPath === p.key ? null : p.key)}
          >
            {p.label}
            {p.tag && <span className="bst-path-tag">{p.tag}</span>}
          </button>
        ))}
      </div>

      {/* ── Path A: API ── */}
      {selectedPath === 'api' && (
        <div className="bst-path-body">
          {serverReachable === false ? (
            <p className="bst-server-offline">需要本地 Scraper Server — 請先執行 <code>npm run scraper:server</code></p>
          ) : serverReachable === null ? (
            <p className="bst-server-checking">偵測本地伺服器…</p>
          ) : (
            <>
              <p className="bst-path-desc">透過 Meta Threads API 取得完整指標（含按讚數、瀏覽數、留言），資料最完整。需先在 <a href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com</a> 建立 App 並取得存取金鑰。</p>
              <div className="bst-form-row">
                <label className="bst-form-label">存取金鑰（Access Token）</label>
                <input
                  className="bst-form-input"
                  type="password"
                  placeholder="EAA..."
                  value={apiToken}
                  onChange={e => setApiToken(e.target.value)}
                  disabled={apiFetching}
                />
              </div>
              <div className="bst-form-row">
                <label className="bst-form-label">最多取得貼文數</label>
                <select className="bst-scroll-select" value={apiLimit} onChange={e => setApiLimit(Number(e.target.value))} disabled={apiFetching}>
                  {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="bst-scrape-row">
                {apiFetching ? (
                  <button className="bst-btn-sm bst-btn-stop" onClick={stopApiFetch}>停止</button>
                ) : (
                  <button className="bst-btn-sm bst-btn-primary" onClick={handleApiFetch} disabled={!apiToken.trim()}>
                    開始取得
                  </button>
                )}
                {apiLogs.length > 0 && (
                  <button className={`bst-btn-sm bst-log-toggle${apiLogsOpen ? ' bst-log-toggle-active' : ''}`} onClick={() => setApiLogsOpen(o => !o)}>
                    紀錄 ({apiLogs.length})
                  </button>
                )}
              </div>
              {apiLogsOpen && apiLogs.length > 0 && (
                <div className="bst-log-panel">
                  {apiLogs.map((l, i) => <div key={i} className="bst-log-line">{l}</div>)}
                  <div ref={logsEndRef} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Path B: File upload ── */}
      {selectedPath === 'export' && (
        <div className="bst-path-body">
          <p className="bst-path-desc">上傳 Meta 帳號資料匯出的 JSON 檔，或任何包含貼文資料的 JSON 檔案。如果您有 ZIP 檔，請先解壓縮並找到 Threads 相關的 JSON 檔。</p>
          {!filePreview ? (
            <div className="bst-file-upload-area">
              <label className="bst-file-label">
                <input type="file" accept=".json" onChange={handleFileChange} disabled={fileParsing} style={{ display: 'none' }} />
                <span className="bst-file-btn">{fileParsing ? '解析中…' : '選擇 JSON 檔'}</span>
                <span className="bst-file-hint">支援 Meta 匯出格式 / Threads API 格式 / 自訂格式</span>
              </label>
            </div>
          ) : (
            <div className="bst-preview-box">
              <div className="bst-preview-count">
                解析完成 · <strong>{filePreview.posts.length}</strong> 篇貼文
              </div>
              <div className="bst-preview-samples">
                {filePreview.posts.slice(0, 3).map((p, i) => (
                  <div key={i} className="bst-preview-sample">{(p.text || '').slice(0, 80)}{(p.text || '').length > 80 ? '…' : ''}</div>
                ))}
              </div>
              <div className="bst-scrape-row">
                <button className="bst-btn-sm bst-btn-primary" onClick={handleFileSave} disabled={fileSaving}>
                  {fileSaving ? '儲存中…' : '儲存到 Tracker'}
                </button>
                <button className="bst-btn-sm" onClick={() => setFilePreview(null)}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Path C: Paste ── */}
      {selectedPath === 'paste' && (
        <div className="bst-path-body">
          <p className="bst-path-desc">直接貼上您的貼文內容。支援 JSON 陣列、Meta 匯出格式，或純文字（將由 AI 自動解析）。</p>
          {!pastePreview ? (
            <>
              <textarea
                className="bst-paste-textarea"
                placeholder={'貼上您的貼文資料…\n\n支援：\n• JSON 陣列或物件\n• 以「---」分隔的純文字貼文列表\n• 直接複製貼上的貼文'}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={10}
                disabled={pasteParsing}
              />
              <div className="bst-scrape-row">
                <button className="bst-btn-sm bst-btn-primary" onClick={handlePasteParse} disabled={!pasteText.trim() || pasteParsing}>
                  {pasteParsing ? 'AI 解析中…' : '解析'}
                </button>
                {pasteText.trim() && !pasteParsing && (
                  <span className="bst-paste-hint">
                    {pasteText.trim().startsWith('{') || pasteText.trim().startsWith('[') ? '偵測到 JSON 格式' : '將使用 AI 解析純文字'}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="bst-preview-box">
              <div className="bst-preview-count">
                解析完成 · <strong>{pastePreview.posts.length}</strong> 篇貼文
              </div>
              <div className="bst-preview-samples">
                {pastePreview.posts.slice(0, 3).map((p, i) => (
                  <div key={i} className="bst-preview-sample">{(p.text || '').slice(0, 80)}{(p.text || '').length > 80 ? '…' : ''}</div>
                ))}
              </div>
              <div className="bst-scrape-row">
                <button className="bst-btn-sm bst-btn-primary" onClick={handlePasteSave} disabled={pasteSaving}>
                  {pasteSaving ? '儲存中…' : '儲存到 Tracker'}
                </button>
                <button className="bst-btn-sm" onClick={() => setPastePreview(null)}>重新編輯</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Path D: Scrape ── */}
      {selectedPath === 'scrape' && (
        <div className="bst-path-body">
          {serverReachable === null && <p className="bst-server-checking">偵測本地伺服器…</p>}
          {serverReachable === false && (
            <p className="bst-server-offline">需要本地 Scraper Server — 請先執行 <code>npm run scraper:server</code></p>
          )}
          {serverReachable === true && (
            <>
              <p className="bst-path-desc">使用本地 Playwright 瀏覽器抓取您的 Threads 個人頁面，取得最新貼文與互動數據。請確認已完成 Threads 登入。</p>
              <div className="bst-scrape-row">
                <label className="bst-scrape-label">
                  貼文
                  <select className="bst-scroll-select" value={postTarget} onChange={e => setPostTarget(Number(e.target.value))} disabled={!!scrapingMode}>
                    {[20, 50, 100, 150, 200].map(n => <option key={n} value={n}>{n} 篇</option>)}
                  </select>
                </label>
                {scrapingMode === 'posts' ? (
                  <button className="bst-btn-sm bst-btn-stop" onClick={() => stopProfileScrape()}>停止</button>
                ) : (
                  <button className="bst-btn-sm bst-btn-primary" onClick={handleScrapePosts} disabled={!!scrapingMode}>
                    抓取貼文
                  </button>
                )}
              </div>
              <div className="bst-scrape-row">
                <label className="bst-scrape-label">
                  回覆貼文
                  <select className="bst-scroll-select" value={repliesTarget} onChange={e => setRepliesTarget(Number(e.target.value))} disabled={!!scrapingMode}>
                    {[20, 50, 100, 150, 200].map(n => <option key={n} value={n}>{n} 篇</option>)}
                  </select>
                </label>
                {scrapingMode === 'replies' ? (
                  <button className="bst-btn-sm bst-btn-stop" onClick={() => stopProfileScrape()}>停止</button>
                ) : (
                  <button className="bst-btn-sm bst-btn-primary" onClick={handleScrapeReplies} disabled={!!scrapingMode}>
                    抓取回覆
                  </button>
                )}
              </div>
              {scrapeLogs.length > 0 && (
                <div className="bst-scrape-row">
                  <button className={`bst-btn-sm bst-log-toggle${scrapeLogsOpen ? ' bst-log-toggle-active' : ''}`} onClick={() => setScrapeLogsOpen(o => !o)}>
                    紀錄 ({scrapeLogs.length})
                  </button>
                </div>
              )}
              {scrapeLogsOpen && scrapeLogs.length > 0 && (
                <div className="bst-log-panel">
                  {scrapeLogs.map((l, i) => <div key={i} className="bst-log-line">{l}</div>)}
                  <div ref={logsEndRef} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Path E: Migrate ── */}
      {selectedPath === 'migrate' && (
        <div className="bst-path-body">
          <p className="bst-path-desc">如果您有舊版 AK-Threads-Booster 的 <code>threads_daily_tracker.json</code>，可以在「直接貼上資料」路徑貼入整個 JSON 檔案內容，系統會自動偵測並轉換成新格式。</p>
          <button className="bst-btn-sm" onClick={() => setSelectedPath('paste')}>切換到「直接貼上資料」→</button>
        </div>
      )}

      {/* ── Generated Artifacts ── */}
      {postCount > 0 && (
        <div className="bst-artifacts">
          <h3 className="bst-artifacts-title">生成的分析檔案</h3>
          {artifactError && <div className="bst-setup-error" style={{ marginBottom: 12 }}>{artifactError}</div>}

          <div className="bst-artifact-row">
            <div className="bst-artifact-info">
              <span className="bst-artifact-name">風格指南（Style Guide）</span>
              {hasStyleGuide
                ? <span className="bst-artifact-badge bst-artifact-done">✓ 已生成</span>
                : <span className="bst-artifact-badge">未生成</span>}
            </div>
            <div className="bst-artifact-actions">
              <button className="bst-btn-sm bst-btn-primary" onClick={handleGenerateStyleGuide} disabled={genStyleGuide}>
                {genStyleGuide ? '生成中…' : hasStyleGuide ? '重新生成' : '✦ 生成'}
              </button>
              {hasStyleGuide && (
                <button className="bst-btn-sm" onClick={() => setViewStyleGuide(v => !v)}>
                  {viewStyleGuide ? '收起' : '查看'}
                </button>
              )}
            </div>
          </div>
          {viewStyleGuide && tracker?.style_guide && (
            <div className="bst-artifact-preview">{tracker.style_guide}</div>
          )}

          <div className="bst-artifact-row">
            <div className="bst-artifact-info">
              <span className="bst-artifact-name">概念庫（Concept Library）</span>
              {hasConceptLibrary
                ? <span className="bst-artifact-badge bst-artifact-done">✓ 已生成</span>
                : <span className="bst-artifact-badge">未生成</span>}
            </div>
            <div className="bst-artifact-actions">
              <button className="bst-btn-sm bst-btn-primary" onClick={handleGenerateConceptLibrary} disabled={genConceptLib}>
                {genConceptLib ? '生成中…' : hasConceptLibrary ? '重新生成' : '✦ 生成'}
              </button>
              {hasConceptLibrary && (
                <button className="bst-btn-sm" onClick={() => setViewConceptLibrary(v => !v)}>
                  {viewConceptLibrary ? '收起' : '查看'}
                </button>
              )}
            </div>
          </div>
          {viewConceptLibrary && tracker?.concept_library && (
            <div className="bst-artifact-preview">{tracker.concept_library}</div>
          )}
        </div>
      )}
    </div>
  )
}
