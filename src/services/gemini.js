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
async function generateDraft({ angle, platform, persona, identity, postTone, product, practices, limits, visualDescriptors, language }) {
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
${toneBlock}${visualBlock}
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
export async function regenerateDraft({ angle, account, product, identity, postTone, practices, limits, visualDescriptors, language }) {
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
  })
  return draft
}
