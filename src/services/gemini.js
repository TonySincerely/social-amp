import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

let genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null
let cachedModelName = null

// ─── Model Discovery ──────────────────────────────────────────────────────────

async function findAvailableModel() {
  if (cachedModelName) return cachedModelName

  if (!API_KEY) throw new Error('No API key available')

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    )
    if (!response.ok) throw new Error(`Failed to list models: ${response.status}`)

    const data = await response.json()
    const preferredPatterns = [/gemini.*flash/i, /gemini.*pro/i, /gemini/i]

    for (const pattern of preferredPatterns) {
      const model = data.models?.find(m => {
        const supportsGenerate = m.supportedGenerationMethods?.includes('generateContent')
        return pattern.test(m.name || '') && supportsGenerate
      })
      if (model) {
        cachedModelName = model.name.replace('models/', '')
        return cachedModelName
      }
    }

    const fallback = data.models?.find(m =>
      m.supportedGenerationMethods?.includes('generateContent')
    )
    if (fallback) {
      cachedModelName = fallback.name.replace('models/', '')
      return cachedModelName
    }

    throw new Error('No compatible model found')
  } catch {
    cachedModelName = 'gemini-1.5-flash-latest'
    return cachedModelName
  }
}

// ─── JSON parsing helper ──────────────────────────────────────────────────────

function parseJson(text) {
  let jsonText = text.trim()

  // Strip markdown code blocks
  const codeBlock = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1].trim()

  // Extract the outermost JSON object
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')
  jsonText = jsonMatch[0]

  // Try strict parse first
  try {
    return JSON.parse(jsonText)
  } catch {
    // Sanitize common Gemini quirks and retry
    const sanitized = jsonText
      .replace(/,(\s*[}\]])/g, '$1')                  // trailing commas
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')   // unquoted keys
      .replace(/:\s*'([^'\\]*(\\.[^'\\]*)*)'\s*([,}\]])/g, ': "$1"$3') // single-quoted values
    return JSON.parse(sanitized)
  }
}

// ─── Trend Brief ──────────────────────────────────────────────────────────────

/**
 * Fetch a lightweight trend brief for a product category.
 * Returns { topics, angles, competitors, fetchedAt }
 */
export async function getTrendBrief({ name, problemStatement, targetPersona, ksp }) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')

  const modelName = await findAvailableModel()
  const isV2 = /gemini-2/i.test(modelName)
  const searchTool = isV2
    ? { googleSearch: {} }
    : { googleSearchRetrieval: { dynamicRetrievalConfig: { mode: 'MODE_DYNAMIC' } } }

  const kspBlock = ksp?.length > 0
    ? `Key selling points:\n${ksp.map(k => `- ${k}`).join('\n')}`
    : ''

  const prompt = `You are a social media trend analyst. A team is validating a new product idea.

Product: "${name}"
Problem it solves: "${problemStatement}"
Target persona: "${targetPersona}"${kspBlock ? '\n' + kspBlock : ''}

Search social media and the web for what is trending RIGHT NOW in this product's category over the past 7 days.

Return a concise trend brief with:
- 4 trending topics relevant to this product space (title + 1-sentence why)
- 4 suggested post angles the team could use (each ≤20 words, concrete and actionable)
- 2 competitor or peer post examples showing what's working (describe the post style, not a real URL)

Respond ONLY with valid JSON (no markdown):
{
  "topics": [
    { "title": "Topic name", "why": "One sentence on why this is trending now" }
  ],
  "angles": [
    "Angle description ≤20 words"
  ],
  "competitors": [
    { "description": "Post style / format description", "platform": "Instagram" }
  ]
}`

  async function run(useGrounding) {
    const config = useGrounding ? { model: modelName, tools: [searchTool] } : { model: modelName }
    const model = genAI.getGenerativeModel(config)
    const result = await model.generateContent(prompt)
    return result.response.text()
  }

  let text
  try {
    text = await run(true)
  } catch {
    text = await run(false)
  }

  const data = parseJson(text)
  return { ...data, fetchedAt: new Date().toISOString() }
}

// ─── Pulse Snapshot ───────────────────────────────────────────────────────────

/**
 * Fetch live trend snapshot for a given location.
 * Single grounded call — returns { trends[], upcomingBuzz[] }
 */
export async function getPulseSnapshot({ location }) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')

  const modelName = await findAvailableModel()
  const isV2 = /gemini-2/i.test(modelName)
  const searchTool = isV2
    ? { googleSearch: {} }
    : { googleSearchRetrieval: { dynamicRetrievalConfig: { mode: 'MODE_DYNAMIC' } } }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const prompt = `You are a social media trend analyst. Today is ${today}.

Using Google Search, find what is trending RIGHT NOW on social media relevant to ${location}.

Return exactly this JSON:
{
  "trends": [
    { "id": "short_unique_slug", "platform": "twitter", "topic": "Trend title ≤8 words", "summary": "Why trending now ≤20 words", "momentum": "high" },
    { "id": "short_unique_slug", "platform": "reddit", "topic": "...", "summary": "...", "momentum": "medium" },
    { "id": "short_unique_slug", "platform": "instagram", "topic": "...", "summary": "...", "momentum": "high" },
    { "id": "short_unique_slug", "platform": "web", "topic": "...", "summary": "...", "momentum": "medium" }
  ],
  "upcomingBuzz": [
    { "topic": "Cultural moment name", "approxDate": "Month DD", "why": "Why it is building ≤15 words" }
  ]
}

Rules:
- Return exactly 3 trends per platform: twitter, reddit, instagram, web (12 total)
- momentum must be "high" or "medium" only
- upcomingBuzz: 0–2 items only, for genuinely building moments in ${location} within the next 4 weeks
- Each id must be a unique short slug (e.g. "ai-regulation-push")
- Respond ONLY with valid JSON, no markdown`

  async function run(useGrounding) {
    const config = useGrounding ? { model: modelName, tools: [searchTool] } : { model: modelName }
    const model = genAI.getGenerativeModel(config)
    const result = await model.generateContent(prompt)
    return result.response.text()
  }

  let text
  try {
    text = await run(true)
  } catch {
    text = await run(false)
  }

  const data = parseJson(text)
  return {
    trends: data.trends || [],
    upcomingBuzz: data.upcomingBuzz || [],
  }
}

// ─── URL Product Extraction ───────────────────────────────────────────────────

/**
 * Extract product brief fields from a public URL using grounded Gemini.
 * Returns { name, problemStatement, targetPersona, ksp[] } — nulls for fields
 * that couldn't be confidently extracted.
 */
export async function extractProductFromUrl(url) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  if (!API_KEY) throw new Error('No API key available')

  const modelName = await findAvailableModel()

  const prompt = `You are extracting product information to populate a product brief.

Fetch and read the page at this URL: ${url}

From the actual page content, extract:
1. Product name — the brand or product name, not the company name if different
2. Problem statement — what specific problem does this solve, for whom? Write 1–3 clear sentences as if describing it to someone unfamiliar with the product.
3. Target persona — who is the ideal user? Include role, habits, or pain points (1–2 sentences).
4. Key selling points — up to 6 concrete, specific benefits or differentiators. Each must be under 15 words and focus on a distinct value.

Only extract what is explicitly on the page. If a field cannot be confidently extracted, return null — do not infer or invent.

Respond ONLY with valid JSON:
{
  "name": "Product name or null",
  "problemStatement": "1–3 sentence problem description or null",
  "targetPersona": "Target user description or null",
  "ksp": ["Benefit 1", "Benefit 2"]
}`

  function parseResult(text) {
    const data = parseJson(text)
    return {
      name: data.name || null,
      problemStatement: data.problemStatement || null,
      targetPersona: data.targetPersona || null,
      ksp: Array.isArray(data.ksp) ? data.ksp.filter(Boolean).slice(0, 6) : [],
    }
  }

  // Try 1: url_context — makes a real HTTP request to the URL, reads actual page content
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tools: [{ url_context: {} }],
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      }
    )
    if (response.ok) {
      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
      if (text) return parseResult(text)
    }
  } catch { /* fall through */ }

  // Try 2: Google Search grounding — web search fallback for indexed pages
  const isV2 = /gemini-2/i.test(modelName)
  const searchTool = isV2
    ? { googleSearch: {} }
    : { googleSearchRetrieval: { dynamicRetrievalConfig: { mode: 'MODE_DYNAMIC' } } }
  try {
    const model = genAI.getGenerativeModel({ model: modelName, tools: [searchTool] })
    const result = await model.generateContent(prompt)
    return parseResult(result.response.text())
  } catch { /* fall through */ }

  // Try 3: no tools — last resort
  const model = genAI.getGenerativeModel({ model: modelName })
  const result = await model.generateContent(prompt)
  return parseResult(result.response.text())
}

// ─── Strategy Distillation ────────────────────────────────────────────────────

/**
 * Distill a raw strategy document into 5–8 short imperative directives.
 * Returns an array of strings.
 */
export async function distillStrategy(content) {
  if (!genAI) throw new Error('Gemini API not initialized.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const prompt = `You are a content strategy editor. Extract the core actionable directives from the following content strategy document.

Return 5–8 short, imperative, concrete rules that an AI writing assistant should follow when creating social media posts according to this strategy. Each directive must be one sentence, action-first, and specific.

Source document:
"""
${content}
"""

Respond ONLY with a JSON array of strings. Example:
["Open every post with a question or bold statement.", "Use maximum 3 hashtags, all topic-relevant.", "Never use exclamation marks.", "End with a call to action that invites replies."]`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No directive array found in response')
  return JSON.parse(match[0])
}

// ─── Post Pattern Distillation ────────────────────────────────────────────────

/**
 * Analyze top-performing posts from an account and extract 5–8 behavioral
 * writing pattern directives an AI can follow to imitate the account's style.
 * Returns an array of strings.
 */
export async function distillPostPatterns(rawText, platform) {
  if (!genAI) throw new Error('Gemini API not initialized.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const prompt = `You are a social media writing coach. Analyze these top-performing posts from a single ${platform} account.

Identify 5–8 consistent behavioral writing patterns across these posts. Focus on observable, repeatable characteristics: how posts open (question, bold claim, stat, anecdote), sentence rhythm and pacing, formatting style (line breaks, bullet lists, emoji usage), hashtag behavior (count, placement, style), call-to-action approach, and distinctive voice markers (assertiveness, humor, hedging, first/second person).

Posts:
"""
${rawText}
"""

Return 5–8 short, imperative rules an AI writing assistant should follow to closely imitate this account's writing style. Each rule must be one sentence, action-first, and specific enough to produce a recognizable imitation.

Respond ONLY with a JSON array of strings. Example:
["Open with a punchy one-liner or bold question, never a soft opener.", "Use two line breaks between thoughts — never run ideas together.", "End with a direct question that invites replies.", "Keep hashtags to 3 or fewer, all niche-specific, placed at the end."]`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No pattern array found in response')
  return JSON.parse(match[0])
}

// ─── Draft generation ─────────────────────────────────────────────────────────

const IDENTITY_INSTRUCTIONS = {
  founder: 'Write in first person as the product founder — someone who built this, believes in it deeply, and wants to share their mission. First-person "we" or "I" is appropriate.',
  random_guy: 'Write as an independent user who discovered this product organically — no affiliation, just a genuine and relatable recommendation from a real person.',
}

const POST_TONE_INSTRUCTIONS = {
  promoting: 'Post intent: drive interest and desire for the product. Make the reader want to try it.',
  showcasing: 'Post intent: demonstrate a specific feature or capability. Show what it does — don\'t sell, just show.',
  discussing: 'Post intent: spark conversation around the problem this product solves. Reference the product but don\'t pitch it directly.',
  questioning: 'Post intent: pose a thought-provoking question that the product answers. Let the reader arrive at the solution naturally.',
  jesting: 'Post intent: pure unfiltered edginess — lean into absurdist humor, sharp wit, or deliberate irreverence. Prioritise being unforgettable over being informative. Don\'t sell. Just be memorable.',
}

function buildLimitsBlock(limits) {
  if (!limits) return ''
  const rules = []
  if (limits.wordLimit != null) rules.push(`STRICT word count limit: ${limits.wordLimit} words maximum — count carefully`)
  if (limits.charLimit != null) rules.push(`Max ${limits.charLimit} characters total`)
  if (limits.hashtagLimit != null) rules.push(`Max ${limits.hashtagLimit} hashtag${limits.hashtagLimit !== 1 ? 's' : ''}`)
  if (limits.linkInPost === false) rules.push('Do not include links in the post body')
  if (limits.videoMaxSec != null) rules.push(`Video cap: ${limits.videoMaxSec} seconds`)
  if (rules.length === 0) return ''
  return 'HARD CONSTRAINTS — you must follow these exactly:\n' + rules.map(r => `- ${r}`).join('\n') + '\n'
}

/**
 * Generate a single post draft for one account.
 */
async function generateDraft({ angle, platform, persona, identity, postTone, product, practices, limits, visualDescriptors, language, postPatterns }) {
  if (!genAI) throw new Error('Gemini API not initialized.')

  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const kspBlock = product.ksp?.length > 0
    ? `Key selling points:\n${product.ksp.map(k => `- ${k}`).join('\n')}`
    : ''

  const voiceInstruction = persona
    ? `Write in the voice of this account persona: "${persona}"`
    : IDENTITY_INSTRUCTIONS[identity] || IDENTITY_INSTRUCTIONS.random_guy

  const toneInstruction = persona
    ? ''
    : POST_TONE_INSTRUCTIONS[postTone] || POST_TONE_INSTRUCTIONS.promoting

  const toneBlock = toneInstruction ? toneInstruction + '\n' : ''
  const visualBlock = visualDescriptors?.length > 0
    ? `Visual aesthetic: ${visualDescriptors.join(', ')}\n`
    : ''
  const postPatternsBlock = postPatterns?.length > 0
    ? 'Writing style patterns from this account\'s top posts — follow these closely:\n' + postPatterns.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n'
    : ''
  const resolvedLanguage = language || 'English'
  const languageBlock = resolvedLanguage !== 'English'
    ? `LANGUAGE: Write the post entirely in ${resolvedLanguage}. Use phrasing, idioms, and social media conventions natural to native ${resolvedLanguage} speakers.\n`
    : ''
  const limitsBlock = buildLimitsBlock(limits)
  const practicesBlock = practices?.length > 0
    ? 'Content strategy directives:\n' + practices.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n'
    : ''

  const prompt = `You are writing a social media post for a product validation campaign.

Product: "${product.name}"
What it does: "${product.problemStatement}"
Target audience: "${product.targetPersona}"${kspBlock ? `\n${kspBlock}` : ''}
Platform: ${platform}
Post angle / hook concept: "${angle}"

Voice: ${voiceInstruction}
${toneBlock}${visualBlock}${postPatternsBlock}
Write ONE post draft that:
- Feels native to ${platform} (format, length, tone)
- Leads with the angle or hook
- Mentions the product naturally — never as an ad
- Ends with a subtle call to action or conversation starter

${languageBlock}${limitsBlock}${practicesBlock}Respond ONLY with the post text. No labels, no quotes, no explanation.`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

/**
 * Generate drafts for multiple accounts in parallel.
 * accounts: Array of { id, handle, platform, persona }
 * Returns Array of { accountId, draft, error }
 */
export async function generateMultiAccountDrafts({ angle, accounts, product, identity, postTone, platformPractices, platformLimits, visualDescriptors }) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')

  const results = await Promise.allSettled(
    accounts.map(account =>
      generateDraft({
        angle,
        platform: account.platform,
        persona: account.persona || null,
        identity: identity || 'random_guy',
        postTone: postTone || 'promoting',
        product,
        practices: platformPractices?.[account.platform] || [],
        limits: platformLimits?.[account.platform] || null,
        visualDescriptors: visualDescriptors || [],
        language: account.resolvedLanguage || 'English',
        postPatterns: account.postPatterns || null,
      }).then(draft => ({ accountId: account.id, draft, error: null }))
    )
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    return { accountId: accounts[i].id, draft: null, error: result.reason?.message || 'Generation failed' }
  })
}

// ─── Image Generation ─────────────────────────────────────────────────────────

function getImageAspectRatio(platform) {
  if (['instagram', 'pinterest'].includes(platform)) return '3:4'
  if (platform === 'x') return '16:9'
  return '1:1'
}

/**
 * Build an image prompt via Gemini text, then generate the image via Imagen 3.
 * Returns { prompt, base64, mimeType }
 */
export async function generatePostImage({ postCopy, visualTones, preferredColors, platform, productName }) {
  if (!genAI) throw new Error('Gemini API not initialized.')
  if (!API_KEY) throw new Error('No API key available')

  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const descriptors = [...(visualTones || []), ...(preferredColors || [])].filter(Boolean)
  const descriptorLine = descriptors.length > 0 ? `Visual style: ${descriptors.join(', ')}.` : ''
  const aspectRatio = getImageAspectRatio(platform)
  const formatHint = aspectRatio === '3:4' ? '3:4 portrait' : aspectRatio === '16:9' ? '16:9 landscape' : 'square'

  const promptBuilderPrompt = `Write a concise image generation prompt for a social media post.

Product: "${productName}"
Platform: ${platform}
Post copy: "${postCopy.slice(0, 280)}"
${descriptorLine}

Write a single image generation prompt (2–4 sentences) that:
- Describes a compelling visual scene or product shot suited to ${platform}
- Incorporates the visual style and colors if specified
- Specifies lighting, composition, and mood
- Ends with: "No text. ${formatHint} format, social media ready."

Respond with ONLY the image prompt text — no labels, no explanation.`

  // Build a detailed image prompt via a text call first
  const promptResult = await model.generateContent(promptBuilderPrompt)
  const imagePrompt = promptResult.response.text().trim()

  // Generate image via gemini-2.5-flash-image (Nano Banana) using generateContent
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: imagePrompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio },
        },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    if (response.status === 403 || response.status === 401) {
      throw new Error('Image generation requires a paid Gemini API plan. Enable billing at aistudio.google.com.')
    }
    throw new Error(err.error?.message || `Image generation failed (${response.status})`)
  }

  const data = await response.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find(p => p.inlineData)
  if (!imagePart) throw new Error('No image returned — the model may not support image generation with this API key.')

  return {
    prompt: imagePrompt,
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  }
}

/**
 * Regenerate a single account's draft.
 */
export async function regenerateDraft({ angle, account, product, identity, postTone, practices, limits, visualDescriptors, language, postPatterns }) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const draft = await generateDraft({
    angle,
    platform: account.platform,
    persona: account.persona || null,
    identity: identity || 'random_guy',
    postTone: postTone || 'promoting',
    product,
    practices: practices || [],
    limits: limits || null,
    visualDescriptors: visualDescriptors || [],
    language: language || 'English',
    postPatterns: postPatterns || null,
  })
  return draft
}

// ─── Booster: Style Guide Generation ─────────────────────────────────────────

/**
 * Generate a style guide from tracker posts.
 * posts: array of tracker post objects with text + metrics
 * Returns markdown string in Traditional Chinese.
 */
export async function generateBoosterStyleGuide(posts) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const postsBlock = posts
    .filter(p => p.text)
    .slice(0, 150)
    .map((p, i) => {
      const metrics = p.metrics
        ? `[讚${p.metrics.likes ?? 0} 回覆${p.metrics.replies ?? 0} 轉發${p.metrics.reposts ?? 0}]`
        : ''
      return `--- 貼文 ${i + 1} ${metrics}\n${p.text}`
    })
    .join('\n\n')

  const prompt = `你是一位專業的 Threads 內容策略師。請分析以下來自同一位創作者的 Threads 貼文，生成一份詳細的個人化風格指南（Style Guide）。

**分析原則：**
- 描述創作者的風格「是什麼」，而不是「應該是什麼」
- 高表現貼文的模式應該標註說明，而非變成命令
- 所有分析必須有具體例子支撐
- 以繁體中文輸出

---

${postsBlock}

---

請依照以下結構輸出 Markdown 格式的風格指南：

## 一、勾子（Hook）類型分析
分析常用的開場方式（直述、提問、數字、故事、反問等），並標注哪種類型的互動表現最佳。

## 二、勾子承諾與兌現
分析開場承諾的內容，與正文是否兌現，強表現貼文的共同特徵。

## 三、結尾模式
常用的結尾方式（問句、號召、留白、結論等），哪種結尾引發最多留言。

## 四、段落結構與節奏
慣用的段落長度、換行習慣、列點使用情況、整體閱讀節奏。

## 五、代詞密度與語氣
第一人稱比例、語氣（權威型、對話型、分享型、質疑型），口吻的一致性。

## 六、字數分布
常用的貼文字數區間，高表現貼文的字數傾向。

## 七、內容類型組合
意見型 / 教學型 / 故事型 / 觀察型 / 問題型的比例，與互動表現的關係。

## 八、情緒弧線
貼文的情緒走向（正面→實用、挑戰→解決、好奇→揭曉等），哪種弧線最有擴散潛力。

## 九、話題分群與重複壓力
常見的主題群組，近期是否有重複發過類似角度的風險。

## 十、高表現訊號摘要
3–5 條具體、可複製的高表現寫作規律。

## Manual Refinements（使用者手動補充區）
<!-- 請在此補充任何分析遺漏的個人細節：禁用詞、必做事項、「這不是我的風格」的例子 -->`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

// ─── Booster: Concept Library Generation ─────────────────────────────────────

/**
 * Generate a concept library from tracker posts.
 * Returns markdown string in Traditional Chinese.
 */
export async function generateBoosterConceptLibrary(posts) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const postsBlock = posts
    .filter(p => p.text)
    .slice(0, 150)
    .map((p, i) => `--- 貼文 ${i + 1}\n${p.text}`)
    .join('\n\n')

  const prompt = `你是一位知識整理專家。請分析以下來自同一位 Threads 創作者的貼文，萃取出他們的概念庫（Concept Library）。

**目標：**幫助創作者了解自己已經解釋過哪些概念、用過哪些類比，以及哪些主題還有深化空間。
**語言：**繁體中文
**輸出格式：**Markdown

---

${postsBlock}

---

請依照以下結構輸出：

## 一、已解釋的概念
列出創作者在貼文中清楚解釋過的專業概念或術語，附上出現的貼文編號與簡短摘要。

## 二、使用的類比
列出創作者使用過的類比、比喻、隱喻，說明類比的效果與語境。

## 三、重複出現的概念群
辨識在多篇貼文中反覆出現的核心主題群，這是創作者的「知識地基」。

## 四、淺談待深化的概念
找出被提及但未深入解釋的概念，這些是未來貼文的潛在素材。

## 五、概念地圖摘要
用 3–5 句話描述這位創作者的知識領域邊界與核心專長。`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

// ─── Booster: Normalize unstructured posts with Gemini ───────────────────────

/**
 * Use Gemini to extract posts from unstructured text (plain text, CSV, etc.)
 * Returns array of minimal post objects: { text, created_at (ISO or null) }
 */
// ─── Booster: Post Analysis ───────────────────────────────────────────────────

/**
 * Full pre-publish diagnostic: algorithm red lines, decision summary, pointed
 * changes, style matching, psychology, algorithm signals, AI-tone detection.
 * Returns structured JSON. No rewriting — diagnostic only.
 */
export async function generatePostAnalysis(postText, posts, styleGuide, brandVoice) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const totalPosts = (posts ?? []).filter(p => p.text).length
  let level = 'Directional'
  if (totalPosts >= 50) level = 'Deep'
  else if (totalPosts >= 20) level = 'Strong'
  else if (totalPosts >= 10) level = 'Usable'
  else if (totalPosts >= 5) level = 'Weak'

  // Top performers + recent posts for comparison + repetition check
  const sorted = [...(posts ?? [])].filter(p => p.text)
    .sort((a, b) => ((b.metrics?.likes ?? 0) + (b.metrics?.replies ?? 0) * 2) - ((a.metrics?.likes ?? 0) + (a.metrics?.replies ?? 0) * 2))
  const topPosts = sorted.slice(0, 12)
  const recent = [...(posts ?? [])].filter(p => p.text)
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
    .slice(0, 7)

  const historyBlock = totalPosts > 0
    ? `\n## 歷史貼文資料（供比對用）\n資料信心度：${level}（${totalPosts} 篇）\n\n### 表現最佳貼文（前 ${topPosts.length} 篇）\n` +
      topPosts.map((p, i) => {
        const m = p.metrics
        const metrics = m ? `[讚${m.likes ?? 0} 回覆${m.replies ?? 0} 轉發${m.reposts ?? 0}]` : ''
        return `${i + 1}. ${metrics} ${p.text.slice(0, 200)}`
      }).join('\n') +
      `\n\n### 最近 ${recent.length} 篇（供重複主題檢查）\n` +
      recent.map((p, i) => `${i + 1}. ${p.text.slice(0, 150)}`).join('\n')
    : '\n## 歷史資料：無（分析以外部知識為主，無個人化比對）'

  const styleBlock = styleGuide
    ? `\n## 風格指南摘要\n${styleGuide.slice(0, 700)}\n`
    : ''
  const voiceBlock = brandVoice
    ? `\n## Brand Voice 摘要（用於觀察語氣偏移，不作為改寫依據）\n${brandVoice.slice(0, 500)}\n`
    : ''

  const prompt = `你是 AK-Threads-Booster 的發文前診斷顧問。診斷以下 Threads 貼文草稿。

**核心原則：**
- 這是診斷，不是改寫
- 每個建議修改必須定位精確：位置 → 問題 → 具體替代方案 → 理由
- 不要輸出整篇重寫版本
- 顧問語氣：「根據你的資料觀察...」，不是命令

---

## 待分析貼文
"""
${postText}
"""
${historyBlock}
${styleBlock}${voiceBlock}

---

## 演算法紅線規則（命中即在 redLines 陣列中警告）

R1 互動誘餌：「按讚選A/選B」「按讚如果你同意」「分享給朋友」「Tag 一個人」「留言 YES/+1」
R2 標題黨：聳動句式、承諾和正文不符、過量驚嘆號
R3 首句與正文不一致：hook 說要講 X，正文講 Y
R4 搬運/低品質：其他平台浮水印、高相似度重發、無自己的分析/結論/經驗
R5 連續同主題：對照最近貼文，語意和切角是否幾乎重複
R6 低品質外部連結：廣告滿天、載入慢的頁面
R7 敏感主題聳動表述：健康/財務/政治的武斷誇大聲明
R10 AI 內容未標示：寫實圖片/影片由 AI 生成未標明
R11 圖文不一致：文字和附圖在講不同的事

## 壓制風險規則（放入 suppressionRisks 陣列）
R8 容易引發 Not Interested：首句太聳動但正文空洞、題文嚴重不符
R9 主題混雜：一篇講超過一個核心主題
R12 軟性降權（累積）：多個弱信號同時存在
語意新鮮度：近期是否發過語意相近的文
低陌生人適配：只有老粉懂，陌生人看不懂
低分享誘因：有用但沒有「我想傳給誰」的衝動

## 心理學分析框架
- Hook 機制：資訊缺口 / 數字衝擊 / 模式打斷 / 損失框架 / 故事 / 直述
- Hook/Payoff Gap：首句承諾 vs 正文兌現的落差（低/中/高）
- 分享動機拆解：私訊轉傳 / 公開轉發 / 身份訊號 / 實用價值（各評 high/medium/low）
- 可轉述性：讀者能否用一句話轉述給別人
- 留言深度觸發：是否設計了讓人想補充/反駁/分享案例的結尾

## 演算法信號評估（放入 algorithmSignals，僅評估相關的）
S1 私訊分享潛力、S2 深度留言觸發、S3 停留時間潛力
S7 語意鄰域一致性、S8 Trust Graph 對齊、S9 對陌生人的可推薦性

## AI 味偵測規則（語句層）
固定句式：「說白了就是」「讓我們來看看」「想像一下」等
連續金句：連續 2 句以上可截圖的漂亮句子
過度整齊對比句：「以前是 A，現在是 B」字數接近
表演式轉折：自問自答、「但真正的問題是」「所以我現在怎麼想」
反問鎖結論：用反問句替代論證
書面連接詞 ≥ 3：然而、值得注意的是、換言之、此外
情緒標籤詞：令人震驚的是、值得深思、耐人尋味
哲理收尾：末句突然拉到「時代」「本質」「真正重要的」
論證太順：全篇零讓步、零例外、零判斷修正
收尾太完整：末段同時包含結論+建議+行動呼籲
數字懸空：百分比/倍數沒有來源或情境修飾

---

請輸出以下 JSON（繁體中文），所有分析以顧問語氣，不要輸出重寫版本：

{
  "postFeatures": {
    "contentType": "意見型|教學型|故事型|觀察型|問題型",
    "hookType": "資訊缺口|數字衝擊|模式打斷|損失框架|故事|直述",
    "wordCount": 0,
    "paragraphCount": 0,
    "emotionalArc": "上升型|下降型|轉折型|平穩型",
    "endingPattern": "問句|號召|留白|結論|哲理"
  },
  "redLines": [
    { "code": "R1", "label": "互動誘餌", "detail": "具體說明哪個句子命中，以及風險" }
  ],
  "decisionSummary": {
    "strongestUpside": "最大的上升空間在哪（一句話）",
    "mainBlocker": "最主要的擴散阻力（一句話）",
    "fit": "follower-fit|stranger-fit|both",
    "fitNote": "說明為什麼"
  },
  "proposedChanges": [
    {
      "where": "第N段，第N句「...」（引用原文片段）",
      "issue": "問題描述",
      "suggestedChange": "只針對那一個位置的具體替代方案",
      "why": "理由（如有歷史資料，引用數據）",
      "priority": "Must-fix|High|Medium|Low"
    }
  ],
  "suppressionRisks": ["風險描述1", "風險描述2"],
  "upsideComparisons": "與歷史表現最佳貼文的比較（若無資料則說明）",
  "styleMatching": {
    "hookTypeNote": "這篇的 hook 類型和歷史表現比對",
    "wordCountNote": "字數和歷史高表現貼文的比較",
    "endingPatternNote": "結尾模式分析",
    "contentTypeNote": "內容類型表現分析"
  },
  "psychologyAnalysis": {
    "hookMechanism": "使用的 hook 機制說明",
    "hookPayoffGap": "low|medium|high",
    "hookPayoffNote": "具體說明首句承諾和正文兌現的落差",
    "emotionalArcNote": "情緒弧線分析",
    "dmForwardability": "high|medium|low",
    "publicRepostability": "high|medium|low",
    "identitySignal": "high|medium|low",
    "utilityShare": "high|medium|low",
    "retellability": "high|medium|low",
    "retellabilityNote": "可轉述性分析",
    "commentDepth": "high|medium|low",
    "commentDepthNote": "留言觸發潛力分析"
  },
  "algorithmSignals": [
    { "code": "S1", "label": "私訊分享潛力", "assessment": "分析說明", "strength": "high|medium|low" }
  ],
  "aiToneDetection": {
    "definite": [{ "location": "第N段/句", "trigger": "命中規則名稱", "explanation": "說明" }],
    "possible": [{ "location": "第N段/句", "trigger": "命中規則名稱", "explanation": "說明" }],
    "totalTriggered": 0,
    "definiteCount": 0,
    "possibleCount": 0,
    "density": "低|中|高",
    "densityNote": "整體 AI 味評估（一句話）"
  },
  "referenceStrength": {
    "dataPath": "完整追蹤器+風格指南|追蹤器（無風格指南）|無追蹤器",
    "totalPosts": ${totalPosts},
    "comparablePosts": 0,
    "level": "${level}",
    "message": "一句話說明這次分析的資料基礎"
  }
}

proposedChanges 若貼文已經很好，直接輸出空陣列 []。redLines 若無命中，輸出空陣列 []。只輸出 JSON，不要 markdown。`

  const result = await model.generateContent(prompt)
  return parseJson(result.response.text())
}

// ─── Booster: Review ─────────────────────────────────────────────────────────

/**
 * Post-publish feedback: compare actual metrics against prediction, diagnose
 * deviation, extract learning points. Returns structured JSON.
 */
export async function generateReview(postText, actualMetrics, checkpointHours, predictionSnapshot, recentPosts) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const recentBlock = (recentPosts ?? []).slice(0, 15).map((p, i) => {
    const m = p.metrics
    const metrics = m ? `[讚${m.likes ?? 0} 回覆${m.replies ?? 0} 轉發${m.reposts ?? 0}]` : ''
    return `${i + 1}. ${metrics} ${p.text?.slice(0, 120) ?? ''}`
  }).join('\n')

  const predBlock = predictionSnapshot
    ? `## 預測快照（${predictionSnapshot.confidence_level ?? '未知'}信心度，${predictionSnapshot.comparable_posts_used ?? '?'} 篇可比較貼文）
保守値 / 基準值 / 樂觀值：
- 讚：${predictionSnapshot.ranges?.likes?.conservative ?? '?'} / ${predictionSnapshot.ranges?.likes?.baseline ?? '?'} / ${predictionSnapshot.ranges?.likes?.optimistic ?? '?'}
- 回覆：${predictionSnapshot.ranges?.replies?.conservative ?? '?'} / ${predictionSnapshot.ranges?.replies?.baseline ?? '?'} / ${predictionSnapshot.ranges?.replies?.optimistic ?? '?'}
- 轉發：${predictionSnapshot.ranges?.reposts?.conservative ?? '?'} / ${predictionSnapshot.ranges?.reposts?.baseline ?? '?'} / ${predictionSnapshot.ranges?.reposts?.optimistic ?? '?'}
預測的上升空間因素：${(predictionSnapshot.upside_drivers ?? []).join('、') || '無'}
預測的不確定因素：${(predictionSnapshot.uncertainty_factors ?? []).join('、') || '無'}`
    : '## 預測快照：無（未進行過 Predict）'

  const actualBlock = `## 實際指標（發文後 ${checkpointHours} 小時）
讚：${actualMetrics.likes ?? 0}
回覆：${actualMetrics.replies ?? 0}
轉發：${actualMetrics.reposts ?? 0}${actualMetrics.views ? `\n觀看：${actualMetrics.views}` : ''}`

  const prompt = `你是 AK-Threads-Booster 的發文後復盤顧問。根據以下資料，幫使用者分析這篇貼文的實際表現，找出偏差原因，萃取學習點。

復盤原則：
- 預測誤差是正常的，目的是學習為什麼，不是評分
- 一篇貼文不應該推翻穩定的歷史趨勢，只能延伸
- 顧問語氣：「根據你的數據觀察...」

---

## 復盤貼文
"""
${postText}
"""

${predBlock}

${actualBlock}

## 最近趨勢（供偏差對照）
${recentBlock || '（無歷史資料）'}

---

請輸出以下 JSON（繁體中文）：

{
  "deviationSummary": "一句話總結：這篇表現如何（超出預期/符合預期/低於預期，以及大概幅度）",
  "predictionComparison": [
    { "metric": "讚", "baseline": 0, "actual": ${actualMetrics.likes ?? 0}, "bandHit": "over|in|under|no_prediction", "deviationPct": "+X%|-X%|N/A" },
    { "metric": "回覆", "baseline": 0, "actual": ${actualMetrics.replies ?? 0}, "bandHit": "over|in|under|no_prediction", "deviationPct": "+X%|-X%|N/A" },
    { "metric": "轉發", "baseline": 0, "actual": ${actualMetrics.reposts ?? 0}, "bandHit": "over|in|under|no_prediction", "deviationPct": "+X%|-X%|N/A" }
  ],
  "deviationReasons": ["偏差原因1（具體）", "原因2"],
  "upsideDriversThatPlayedOut": ["有效的上升空間因素"],
  "uncertaintyThatMattered": ["實際影響了結果的不確定因素"],
  "signalValidation": {
    "hookPayoff": "Hook 承諾和正文兌現的關係是否影響了結果",
    "shareMotivation": "這篇主要靠什麼被分享或傳播",
    "topicFreshness": "主題新鮮度的實際影響",
    "strangerFit": "這篇更像 follower-fit 還是 stranger-fit，結果是否印證了"
  },
  "calibrationNotes": "對未來預測有什麼校正意義（一句話）",
  "learningPoints": ["學到的1", "學到的2", "學到的3"],
  "questions": ["針對這次復盤的具體跟進問題（2-3 條）"]
}

predictionComparison 若無預測快照，baseline 填 0，bandHit 填 "no_prediction"。只輸出 JSON，不要 markdown。`

  const result = await model.generateContent(prompt)
  return parseJson(result.response.text())
}

// ─── Booster: Prediction ─────────────────────────────────────────────────────

/**
 * Predict 24-hour performance for a post based on comparable historical posts.
 * Returns structured JSON with prediction ranges, comparables, and confidence.
 */
export async function generatePrediction(postText, posts) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const usable = (posts ?? []).filter(p => p.text && p.metrics && !p.is_reply_post)
  const totalPosts = usable.length

  let level = 'Directional'
  if (totalPosts >= 50) level = 'Deep'
  else if (totalPosts >= 20) level = 'Strong'
  else if (totalPosts >= 10) level = 'Usable'
  else if (totalPosts >= 5) level = 'Weak'

  // Recent 10 for trend analysis, sorted by creation date
  const recent10 = [...usable]
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
    .slice(0, 10)

  const historyBlock = usable.slice(0, 80).map((p, i) => {
    const m = p.metrics
    const wc = p.word_count ?? p.text.split(/\s+/).filter(Boolean).length
    return `${i + 1}. [讚${m.likes ?? 0} 回覆${m.replies ?? 0} 轉發${m.reposts ?? 0}] [${wc}字] ${p.text.slice(0, 200)}`
  }).join('\n')

  const recentBlock = recent10.map((p, i) => {
    const m = p.metrics
    return `${i + 1}. [讚${m.likes ?? 0} 回覆${m.replies ?? 0}] ${p.text.slice(0, 100)}`
  }).join('\n')

  const prompt = `你是 AK-Threads-Booster 的表現預測顧問。根據使用者的歷史貼文資料，預估以下貼文 24 小時內可能的表現區間。

預測原則：
- 給出區間，不要假精準
- 少於 5 篇可比較貼文時，明確說明樣本不足，給粗略估計
- 預測是判斷輔助，不是目標

---

## 待預測貼文
"""
${postText}
"""

## 歷史貼文資料（${totalPosts} 篇，含指標）
${historyBlock}

## 最近 ${recent10.length} 篇趨勢
${recentBlock}

---

請依以下步驟分析：
1. 萃取待預測貼文的特徵（內容類型、Hook 類型、字數、情緒弧線）
2. 從歷史資料中找出 3-5 篇最相近的貼文（比對維度：內容類型、Hook、字數區間、主題）
3. 根據可比較貼文計算區間：保守值（25th percentile）、基準值（中位數）、樂觀值（75th percentile）；不足 5 篇則給粗略範圍
4. 分析最近趨勢（最近 10 篇 vs 整體平均）
5. 列出上升空間因素和不確定因素

輸出以下 JSON（繁體中文）：

{
  "postFeatures": {
    "contentType": "意見型|教學型|故事型|觀察型|問題型",
    "hookType": "資訊缺口|數字衝擊|模式打斷|損失框架|故事|直述",
    "wordCount": 0,
    "emotionalArc": "上升型|下降型|轉折型|平穩型",
    "endingType": "問句|號召|留白|結論|哲理"
  },
  "comparablePosts": [
    {
      "summary": "貼文前 60 字",
      "matchDimensions": ["內容類型", "字數區間"],
      "likes": 0,
      "replies": 0,
      "reposts": 0
    }
  ],
  "prediction": {
    "likes":   { "conservative": 0, "baseline": 0, "optimistic": 0 },
    "replies": { "conservative": 0, "baseline": 0, "optimistic": 0 },
    "reposts": { "conservative": 0, "baseline": 0, "optimistic": 0 }
  },
  "trendDirection": "成長中|持平|下降中|資料不足",
  "trendNote": "最近趨勢的一句說明",
  "upsideDrivers": ["上升空間因素1", "因素2"],
  "uncertaintyFactors": ["不確定因素1"],
  "referenceStrength": {
    "totalPosts": ${totalPosts},
    "comparablePosts": 0,
    "level": "${level}",
    "message": "一句話說明這次預測的資料基礎"
  }
}

只輸出 JSON，不要 markdown。`

  const result = await model.generateContent(prompt)
  return parseJson(result.response.text())
}

// ─── Booster: Draft Generation ───────────────────────────────────────────────

/**
 * Generate a Threads draft from a topic, grounded in the user's brand voice.
 * settings: { freshnessGate, angleAlternatives, improvementQuestions }
 * Returns structured JSON.
 */
export async function generateDraftPost(topic, posts, brandVoice, styleGuide, conceptLibrary, settings = {}) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const { freshnessGate = true, angleAlternatives = true, improvementQuestions = true } = settings

  const recent  = [...(posts ?? [])].filter(p => p.text && !p.is_reply_post)
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
    .slice(0, 15)
  const topPosts = [...(posts ?? [])].filter(p => p.text && !p.is_reply_post)
    .sort((a, b) => ((b.metrics?.likes ?? 0) + (b.metrics?.replies ?? 0) * 2) - ((a.metrics?.likes ?? 0) + (a.metrics?.replies ?? 0) * 2))
    .slice(0, 10)

  const recentBlock = recent.length > 0
    ? '### 最近 ' + recent.length + ' 篇（用於新鮮度檢查）\n' +
      recent.map((p, i) => `${i + 1}. ${p.text.slice(0, 150)}`).join('\n')
    : '（無）'

  const topBlock = topPosts.length > 0
    ? '### 高表現貼文（用於語氣比對）\n' +
      topPosts.map((p, i) => {
        const m = p.metrics
        const metrics = m ? `[讚${m.likes ?? 0} 回覆${m.replies ?? 0}]` : ''
        return `${i + 1}. ${metrics} ${p.text.slice(0, 300)}`
      }).join('\n\n')
    : '（無）'

  const voiceBlock = brandVoice
    ? `\n## Brand Voice（主要語氣與風格依據）\n${brandVoice.slice(0, 2500)}\n`
    : ''

  const styleBlock = styleGuide
    ? `\n## 風格指南（量化基準）\n${styleGuide.slice(0, 1000)}\n`
    : ''

  const conceptBlock = conceptLibrary
    ? `\n## 概念庫摘要（避免重複解釋的概念）\n${conceptLibrary.slice(0, 600)}\n`
    : ''

  const voiceStatus = brandVoice ? 'strong' : styleGuide ? 'usable' : 'thin'

  const freshnessSection = freshnessGate ? `
  "freshnessCheck": {
    "internalRisk": "none|recent|high",
    "riskNote": "說明近期是否發過語意相近的貼文",
    "decision": "green|yellow",
    "decisionNote": "是否建議換角度或繼續"
  },` : ''

  const anglesSection = angleAlternatives ? `
  "angleAlternatives": [
    { "angle": "角度描述", "note": "為什麼這個角度值得考慮" }
  ],` : ''

  const questionsSection = improvementQuestions ? `
  "improvementQuestions": [
    "針對這篇草稿的具體改進問題（3-5 條，每條綁定草稿中的具體位置或說法）"
  ]` : `
  "improvementQuestions": []`

  const prompt = `你是 AK-Threads-Booster 的起草助理。根據以下主題和使用者的 Brand Voice 起草一篇 Threads 貼文。

**起草原則：**
- Brand Voice 是主要語氣依據，讓草稿盡量接近用戶實際的寫法
- Manual Refinements 裡的規則是硬約束，優先級最高
- 避免 AI 味：段落長短不一、有自然的不完整感、不堆砌金句、不用書面連接詞
- 結尾不要哲理升華，不要互動乞討（「記得按讚」「留言告訴我」）
- 草稿是起點，用戶會自己修改

---

## 起草主題
「${topic}」

## 貼文歷史資料
${recentBlock}

${topBlock}
${voiceBlock}${styleBlock}${conceptBlock}

---

請輸出以下 JSON（繁體中文）：

{${freshnessSection}
  "draft": "完整貼文草稿文字（保留換行，直接輸出文字，不加引號說明）",
  "writingLogic": "簡短說明這篇草稿的 hook 選擇、情緒弧線、結尾邏輯（2-3 句）",
  "voiceQuality": "${voiceStatus}",
  "voiceQualityNote": "${brandVoice ? '有完整 Brand Voice 資料，語氣對齊度應較高' : styleGuide ? '只有風格指南，語氣對齊度中等，建議先跑 Voice 再起草' : '無 Brand Voice 或風格指南，語氣對齊度低，建議先完成 Setup 和 Voice'}",${anglesSection}${questionsSection}
}

draft 欄位直接放貼文全文，包含換行符號（\\n）。只輸出 JSON，不要 markdown。`

  const result = await model.generateContent(prompt)
  return parseJson(result.response.text())
}

// ─── Booster: Brand Voice Generation ─────────────────────────────────────────

/**
 * Generate (or regenerate) a Brand Voice markdown document from tracker posts.
 * If existingBrandVoice is provided, the Manual Refinements section is extracted
 * and preserved verbatim in the new output.
 * Returns raw markdown string.
 */
export async function generateBrandVoice(posts, styleGuide, existingBrandVoice) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const mainPosts  = (posts ?? []).filter(p => p.text && !p.is_reply_post).slice(0, 60)
  const replies    = (posts ?? []).filter(p => p.text && p.is_reply_post).slice(0, 20)
  const totalPosts = mainPosts.length
  const totalReplies = replies.length

  let level = 'Directional'
  if (totalPosts >= 50) level = 'Deep'
  else if (totalPosts >= 20) level = 'Strong'
  else if (totalPosts >= 10) level = 'Usable'
  else if (totalPosts >= 5) level = 'Weak'

  // Extract Manual Refinements section from existing voice for preservation
  let manualRefinements = ''
  if (existingBrandVoice?.trim()) {
    const match = existingBrandVoice.match(/## Manual Refinements[\s\S]*$/)
    if (match) manualRefinements = match[0].trim()
  }

  const postsBlock = mainPosts.map((p, i) => {
    const m = p.metrics
    const metrics = m ? `[讚${m.likes ?? 0} 回覆${m.replies ?? 0}]` : ''
    const date = p.created_at ? new Date(p.created_at).toLocaleDateString('zh-TW') : ''
    return `--- 貼文 ${i + 1} ${metrics} ${date}\n${p.text.slice(0, 450)}`
  }).join('\n\n')

  const repliesBlock = replies.length > 0
    ? `\n\n## 作者留言回覆（${replies.length} 則）\n` +
      replies.map((p, i) => `--- 回覆 ${i + 1}\n${p.text.slice(0, 250)}`).join('\n\n')
    : ''

  const styleBlock = styleGuide
    ? `\n## 風格指南（量化基準，供參考）\n${styleGuide.slice(0, 800)}\n`
    : ''

  const today = new Date().toISOString().slice(0, 10)

  const manualBlock = manualRefinements ||
    `## Manual Refinements（使用者手動補充）
> 這個區塊留給你自己填。重新生成時會原封不動保留。

- 分析說錯的地方：
- 分析漏掉的地方：
- 我想要 /draft 一定要做的事：
- 我想要 /draft 絕對不要做的事：
- 屬於「我」的句子：
- 不屬於「我」的句子：`

  const prompt = `你是 AK-Threads-Booster 的 Brand Voice 分析師。請深度分析以下 Threads 創作者的歷史貼文，生成一份完整的 Brand Voice Profile。

原則：
- Brand Voice 是描述性的，不是規範性的。記錄「這個人怎麼寫」，不是「應該怎麼寫」
- 每個維度必須引用具體原文作為佐證（用 > 引號格式）
- 資料信心度：${level}（${totalPosts} 篇貼文 + ${totalReplies} 篇回覆）
- 資料不足的維度要如實說明，不要捏造

---

## 貼文資料
${postsBlock}${repliesBlock}
${styleBlock}

---

請輸出以下格式的完整繁體中文 Markdown 文件。每個維度都要有具體原文引用和分析，不要只寫「尚待分析」：

# Brand Voice Profile

> 狀態：**第一稿參考文件，由 /voice 生成——請仔細閱讀並修改。**
> 分析基礎：${totalPosts} 篇貼文 + ${totalReplies} 篇留言回覆
> 資料信心度：${level}
> 生成日期：${today}
>
> 使用說明：
> 1. 通讀全文，任何地方感覺不對，直接修改——你的修改優先
> 2. 在最底部的 Manual Refinements 補充分析遺漏的細節
> 3. 累積更多貼文後可重新生成來更新基準

---

## 句式結構偏好

分析短句/長句比例、斷句習慣、複合句連接方式、刻意斷段的模式、句式模板（前 5-8 個）。附原文引用。

## 語氣切換模式

分析嚴肅/自嘲/犀利語氣分別在什麼情境出現，語氣轉換節奏，嚴肅 vs 輕鬆比例。附原文引用。

## 情緒表達風格

分析各種情緒（得意、無奈、驚訝、不確定）的具體表達方式，情緒強度偏好，情緒放在文章哪個位置。附原文引用。

## 知識呈現方式

分析如何引入技術概念、白話轉譯技巧、展示專業度的方式、預設讀者知識水準。附原文引用。

## 對粉絲 vs 質疑者的語氣差異

分析回覆支持者 vs 質疑者 vs 批評者的語氣特徵，是否有固定回覆模式。若回覆資料不足請如實說明。附原文引用。

## 常用類比與比喻風格

分析比喻來源領域、具體程度偏好、是否有重複使用的比喻、比喻長度。附原文引用。

## 幽默與機智風格

分析幽默類型（自嘲/乾式/反差/其他）、出現位置、頻率、是否使用 emoji 輔助。附原文引用。

## 自稱與稱呼讀者

分析如何自稱、如何稱呼讀者、何時用「我們」、是否有特定受眾群體的稱呼。附原文引用。

## 禁忌句式

分析明顯迴避的詞彙或句式、與風格完全不相容的表達方式（例：太書面、太諂媚、太 AI 味的固定句式）。

## 段落節奏微特徵

分析：第一句典型長度、開場段句數、中段展開方式、結尾段習慣、段落間的過渡方式、偏好段落數、單行段比例、節奏加速/減速模式。附原文引用。

## 留言回覆語氣特徵

分析回覆 vs 貼文的語調差異、回覆長度偏好、特色語言。若回覆資料不足請如實說明。附原文引用。

## 標誌性詞彙與句式清單

具體列出：高頻內容詞（附出現次數）、慣用開場句型、慣用收尾句型、口頭禪、標點符號習慣（驚嘆號/問號/省略號/emoji 使用模式）。

## 語言與語域

分析主要語言、語域混合比例（口語/書面/網路用語/業界術語）、是否有語言切換模式（中英混用規律）。附原文引用。

## 論證風格

分析如何建立可信度（經驗/數據/論斷）、如何處理不同意見、是否加保留語氣、用論點還是用故事說服。附原文引用。

## /draft 快速參考摘要

整理 8-12 條最關鍵的寫作特徵，分為「必須做到」和「絕對不能」兩個清單，供 /draft 快速對齊。

## 信心地圖

針對以上每個維度標注信心度：高信心 / 中信心 / 低信心，說明原因（資料量/一致性/模糊）。

---

${manualBlock}

---

只輸出 Markdown 文件本身，不要任何前言或額外說明。`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

// ─── Booster: Topics Recommendation ──────────────────────────────────────────

/**
 * Recommend 3–5 topics based on tracker post history, comment demand,
 * and historical performance. Returns structured JSON.
 */
export async function generateTopicsRecommendation(posts, styleGuide, conceptLibrary) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const usable = posts.filter(p => p.text).slice(0, 100)
  const totalPosts = usable.length

  let level = 'Directional'
  if (totalPosts >= 50) level = 'Deep'
  else if (totalPosts >= 20) level = 'Strong'
  else if (totalPosts >= 10) level = 'Usable'
  else if (totalPosts >= 5) level = 'Weak'

  const sorted = [...usable].sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
  const lastPostDate = sorted[0]?.created_at ?? null
  const daysSince = lastPostDate
    ? Math.floor((Date.now() - new Date(lastPostDate).getTime()) / 86400000)
    : null

  const postsBlock = usable.map((p, i) => {
    const m = p.metrics
    const metrics = m ? `[讚${m.likes ?? 0} 回覆${m.replies ?? 0} 轉發${m.reposts ?? 0}]` : ''
    const date = p.created_at ? new Date(p.created_at).toLocaleDateString('zh-TW') : ''
    const replyTag = p.is_reply_post ? '[回覆文]' : ''
    const comments = Array.isArray(p.comments) && p.comments.length > 0
      ? '\n  留言: ' + p.comments.slice(0, 5)
          .map(c => (typeof c === 'string' ? c : c?.text ?? '').slice(0, 80))
          .filter(Boolean).join(' | ')
      : ''
    return `--- 貼文 ${i + 1} ${replyTag} ${metrics} ${date}\n${p.text.slice(0, 300)}${comments}`
  }).join('\n\n')

  const styleBlock = styleGuide
    ? `\n## 風格指南（摘要）\n${styleGuide.slice(0, 1500)}\n`
    : ''
  const conceptBlock = conceptLibrary
    ? `\n## 概念庫（摘要）\n${conceptLibrary.slice(0, 1000)}\n`
    : ''
  const daysSinceNote = daysSince !== null ? `距離上一篇貼文：${daysSince} 天` : ''

  const prompt = `你是 AK-Threads-Booster 的選題顧問。根據以下 Threads 創作者的歷史貼文，推薦 3–5 個最值得下一篇發的主題。

分析原則：目標不是追熱門，而是找對這個帳號現在更值得發的題目。所有推薦必須有資料佐證。
資料信心度：${level}（共 ${totalPosts} 篇貼文）。${daysSinceNote}

---

## 貼文歷史資料
${postsBlock}
${styleBlock}${conceptBlock}

---

請依序完成：
1. 從留言中找出重複問題、痛點、情緒最強主題、創作者親自回覆的驗證需求
2. 分析哪些話題和內容類型觸發最多互動
3. 評估近期是否有語意重複風險
4. 推薦 3–5 個候選主題

輸出以下 JSON（繁體中文），freshness 固定為 "unverified"（外部未驗證），但 freshnessNote 填內部判斷：

{
  "commentInsights": {
    "topQuestions": ["問題1", "問題2"],
    "strongestEmotionalTopic": "觸發最強情緒反應的主題",
    "validatedDemand": ["高驗證需求主題"]
  },
  "topics": [
    {
      "name": "主題名稱",
      "source": "comment_demand | historical_performance | concept_extension | content_balance",
      "reasoning": "資料佐證的具體理由",
      "comparablePost": "最相近的歷史貼文首句（沒有則 null）",
      "freshness": "unverified",
      "freshnessNote": "內部新鮮度判斷（近期有沒有發過類似主題）",
      "selfRepetitionRisk": "none | recent | high",
      "selfRepetitionNote": "重複風險說明",
      "angles": ["角度1", "角度2"],
      "notes": "補充說明"
    }
  ],
  "reminders": {
    "daysSinceLastPost": ${daysSince ?? 0},
    "lastPostDate": "${lastPostDate ? lastPostDate.slice(0, 10) : '未知'}",
    "recentTopics": ["近期話題1", "話題2", "話題3"],
    "warnings": []
  },
  "dataConfidence": {
    "level": "${level}",
    "totalPosts": ${totalPosts},
    "message": "一句話說明資料信心度"
  }
}

只輸出 JSON，不要任何 markdown 包裝。`

  const result = await model.generateContent(prompt)
  return parseJson(result.response.text())
}

export async function normalizePostsWithGemini(rawText) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const prompt = `Extract individual Threads posts from the following text. The text may be a copy-paste from a profile, a spreadsheet, notes, or any unstructured format.

For each post you identify, extract:
- "text": the post content (required)
- "created_at": publication date/time in ISO 8601 format if detectable, otherwise null

Rules:
- Do NOT invent post content. Only extract what is clearly present.
- If a date/time cannot be reliably determined, set created_at to null.
- Ignore navigation UI text, follower counts, bio text, and non-post content.
- Each post is a distinct piece of content, not a reply to the same post.

Input:
"""
${rawText.slice(0, 8000)}
"""

Respond ONLY with a JSON array. Example:
[
  { "text": "Post content here", "created_at": "2024-03-15T10:00:00Z" },
  { "text": "Another post", "created_at": null }
]`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No post array in Gemini response')
  return JSON.parse(match[0])
}
