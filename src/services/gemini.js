import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI = null
let cachedModelName = null

const STORAGE_KEY = 'socialamp_apikey'

export function getStoredApiKey() {
  return localStorage.getItem(STORAGE_KEY) || null
}

export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEY, key)
  initGemini(key)
}

export function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY)
  genAI = null
  cachedModelName = null
}

export function initGemini(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey)
  cachedModelName = null
}

export function isGeminiInitialized() {
  return genAI !== null
}

// ─── Model Discovery ──────────────────────────────────────────────────────────

async function findAvailableModel() {
  if (cachedModelName) return cachedModelName

  const apiKey = getStoredApiKey()
  if (!apiKey) throw new Error('No API key available')

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
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
  let jsonText = text
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1]
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')
  return JSON.parse(jsonMatch[0])
}

// ─── Trend Brief ──────────────────────────────────────────────────────────────

/**
 * Fetch a lightweight trend brief for a product category.
 * Returns { topics, angles, competitors, fetchedAt }
 */
export async function getTrendBrief({ name, problemStatement, targetPersona }) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')

  const modelName = await findAvailableModel()
  const isV2 = /gemini-2/i.test(modelName)
  const searchTool = isV2
    ? { googleSearch: {} }
    : { googleSearchRetrieval: { dynamicRetrievalConfig: { mode: 'MODE_DYNAMIC' } } }

  const prompt = `You are a social media trend analyst. A team is validating a new product idea.

Product: "${name}"
Problem it solves: "${problemStatement}"
Target persona: "${targetPersona}"

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

// ─── Draft generation ─────────────────────────────────────────────────────────

const TONE_PRESET_INSTRUCTIONS = {
  educator: 'Write in a long-form, highly informative, semi-formal tone. Prioritize educational value. Include actionable insights. Suitable for LinkedIn or Reddit.',
  puncher: 'Write short, punchy, and opinionated. Be direct and bold. Low helpfulness framing, conversational, casual. Good for X or Threads.',
  helper: 'Write in a friendly, helpful, community-oriented tone. Medium length. Casual. Focus on solving a problem for the reader. Good for Instagram or Facebook.',
  jester: 'Write short and funny. Lean into humor, wit, or absurdity. Very casual, meme-aware. Good for Threads or viral posts.',
  closer: 'Write short and persuasive. Drive action. Semi-formal. Every sentence earns its place. Good for launch week or preorder pushes.',
  storyteller: 'Write in a long-form, narrative, personal tone. Tell a story. Casual and engaging. Good for Instagram captions or founder posts.',
  neutral: 'Write in a clear, natural tone appropriate to the platform. No specific stylistic constraints.',
}

/**
 * Generate a single post draft for one account.
 */
async function generateDraft({ angle, platform, persona, tonePreset, product }) {
  if (!genAI) throw new Error('Gemini API not initialized.')

  const modelName = await findAvailableModel()
  const model = genAI.getGenerativeModel({ model: modelName })

  const voiceInstruction = persona
    ? `Write in the voice of this account persona: "${persona}"`
    : TONE_PRESET_INSTRUCTIONS[tonePreset] || TONE_PRESET_INSTRUCTIONS.neutral

  const prompt = `You are writing a social media post for a product validation campaign.

Product: "${product.name}"
What it does: "${product.problemStatement}"
Target audience: "${product.targetPersona}"
Platform: ${platform}
Post angle / hook concept: "${angle}"

Voice instruction: ${voiceInstruction}

Write ONE post draft that:
- Feels native to ${platform} (format, length, tone)
- Leads with the angle or hook
- Mentions the product naturally — never as an ad
- Ends with a subtle call to action or conversation starter

Respond ONLY with the post text. No labels, no quotes, no explanation.`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

/**
 * Generate drafts for multiple accounts in parallel.
 * accounts: Array of { id, handle, platform, persona, tonePreset }
 * Returns Array of { accountId, draft, error }
 */
export async function generateMultiAccountDrafts({ angle, accounts, product }) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')

  const results = await Promise.allSettled(
    accounts.map(account =>
      generateDraft({
        angle,
        platform: account.platform,
        persona: account.persona || null,
        tonePreset: account.tonePreset || 'neutral',
        product,
      }).then(draft => ({ accountId: account.id, draft, error: null }))
    )
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    return { accountId: accounts[i].id, draft: null, error: result.reason?.message || 'Generation failed' }
  })
}

/**
 * Regenerate a single account's draft.
 */
export async function regenerateDraft({ angle, account, product }) {
  if (!genAI) throw new Error('Gemini API not initialized. Please set your API key.')
  const draft = await generateDraft({
    angle,
    platform: account.platform,
    persona: account.persona || null,
    tonePreset: account.tonePreset || 'neutral',
    product,
  })
  return draft
}
