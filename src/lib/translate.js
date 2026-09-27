/**
 * 翻译：双引擎。
 *  - free：MyMemory 公共接口（免 Key，浏览器可直调；单次 ≤500 字符 → 按句切分，
 *          匿名 5000 字/天，带邮箱 5 万/天）
 *  - ai  ：OpenAI 兼容 chat/completions（用户自己的 Key；桌面端可经 IPC 代理绕过跨域）
 * 纯逻辑 + 注入 fetch，便于单测。
 */

const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get'
/** MyMemory 单请求上限 500 字符，留余量 */
const FREE_CHUNK_LIMIT = 420
const FREE_CONCURRENCY = 4
const AI_TIMEOUT_MS = 120000

/** @param {string} text @returns {'zh'|'en'} */
export function detectTextLang(text) {
  const s = String(text ?? '')
  const cjk = s.match(/[\u3400-\u9fff\u3040-\u30ff]/g)?.length ?? 0
  const letters = s.match(/[A-Za-z]/g)?.length ?? 0
  if (cjk === 0 && letters === 0) return 'zh'
  return cjk >= letters ? 'zh' : 'en'
}

/**
 * 按句切分并打包成 ≤ maxLen 的块（保留句末标点，中英文句号/问号/叹号/分号/换行）。
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitSentences(text, maxLen = FREE_CHUNK_LIMIT) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  if (normalized.length <= maxLen) return [normalized]

  // 先按句子边界切
  const sentences = normalized.match(/[^。．！？!?；;]+[。．！？!?；;]?/g) || [normalized]
  /** @type {string[]} */
  const chunks = []
  /** @type {string[]} */
  let pending = []
  let pendingLen = 0
  for (const sentence of sentences) {
    let s = sentence
    // 单句超长 → 按逗号/顿号再切；仍超长 → 硬切
    const pieces = []
    while (s.length > maxLen) {
      let cut = Math.max(s.lastIndexOf('，', maxLen), s.lastIndexOf('、', maxLen), s.lastIndexOf(', ', maxLen), s.lastIndexOf(' ', maxLen))
      if (cut < Math.floor(maxLen / 2)) cut = maxLen
      pieces.push(s.slice(0, cut))
      s = s.slice(cut)
    }
    pieces.push(s)
    for (const piece of pieces) {
      if (pendingLen + piece.length > maxLen && pending.length) {
        chunks.push(pending.join(''))
        pending = []
        pendingLen = 0
      }
      pending.push(piece)
      pendingLen += piece.length
    }
  }
  if (pending.length) chunks.push(pending.join(''))
  return chunks.filter(Boolean)
}

/**
 * @param {string} baseUrl
 * @returns {string} 规范化 chat/completions 完整 URL
 */
export function normalizeAiBaseUrl(baseUrl) {
  let s = String(baseUrl ?? '').trim().replace(/\/+$/, '')
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  if (/\/chat\/completions$/i.test(s)) return s
  return `${s}/chat/completions`
}

/**
 * @typedef {object} TranslateOptions
 * @property {'free'|'ai'} provider
 * @property {'auto'|'en2zh'|'zh2en'} [direction] 翻译方向（默认 auto：互译）
 * @property {{ baseUrl: string, apiKey: string, model?: string }} [ai]
 * @property {typeof fetch} [fetchImpl]
 * @property {(done: number, total: number) => void} [onProgress]
 * @property {number} [concurrency]
 */

/**
 * 解析翻译语言对。
 * @param {string[]} texts
 * @param {'auto'|'en2zh'|'zh2en'|undefined} direction
 */
export function resolveLanguagePair(texts, direction) {
  if (direction === 'en2zh') return { source: 'en', target: 'zh' }
  if (direction === 'zh2en') return { source: 'zh', target: 'en' }
  const source = detectTextLang(texts.join('\n'))
  return { source, target: source === 'zh' ? 'en' : 'zh' }
}

/**
 * @param {string[]} texts
 * @param {TranslateOptions} options
 * @returns {Promise<{ translations: string[], error: string | null }>}
 */
export function translateTexts(texts, options) {
  if (!Array.isArray(texts) || !texts.length) return { translations: [], error: null }
  if (options.provider === 'ai') return translateViaAI(texts, options)
  return translateViaFree(texts, options)
}

// ————————————————— 免费：MyMemory —————————————————

/**
 * @param {string[]} texts
 * @param {TranslateOptions} options
 */
async function translateViaFree(texts, options) {
  const fetchImpl = options.fetchImpl || ((...args) => fetch(...args))
  const { source, target } = resolveLanguagePair(texts, options.direction)
  const srcCode = source === 'zh' ? 'zh-CN' : 'en'
  const dstCode = target === 'zh' ? 'zh-CN' : 'en'
  const langpair = `${srcCode}|${dstCode}`

  // 展开为块任务
  /** @type {{ textIndex: number, chunk: string }[]} */
  const tasks = []
  texts.forEach((text, i) => {
    for (const chunk of splitSentences(text)) {
      tasks.push({ textIndex: i, chunk })
    }
  })
  if (!tasks.length) return { translations: texts.slice(), error: null }

  /** @type {Map<number, string[]>} */
  const collected = new Map()
  let done = 0
  let firstError = null
  let failures = 0

  const concurrency = Math.max(1, Math.min(options.concurrency ?? FREE_CONCURRENCY, 8))
  let cursor = 0
  /** @type {Promise<void>[]} */
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor]
      cursor += 1
      const translated = await fetchMyMemory(fetchImpl, task.chunk, langpair, options.email)
      done += 1
      options.onProgress?.(done, tasks.length)
      if (translated == null) {
        failures += 1
        if (!firstError) firstError = 'free-failed'
        collected.set(task.textIndex, collected.get(task.textIndex) || [])
        // 失败的块保留原文，保证段落对齐
        collected.get(task.textIndex).push(task.chunk)
      } else {
        if (!collected.has(task.textIndex)) collected.set(task.textIndex, [])
        collected.get(task.textIndex).push(translated)
      }
    }
  })
  await Promise.all(workers)

  const translations = texts.map((text, i) => {
    const parts = collected.get(i)
    if (!parts || !parts.length) return text
    return parts.join('')
  })

  if (failures && done === failures) {
    return { translations, error: 'free-all-failed' }
  }
  return { translations, error: firstError }
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} q
 * @param {string} langpair
 * @param {string} [email]
 * @returns {Promise<string | null>}
 */
async function fetchMyMemory(fetchImpl, q, langpair, email) {
  const url = new URL(MYMEMORY_ENDPOINT)
  url.searchParams.set('q', q)
  url.searchParams.set('langpair', langpair)
  if (email) url.searchParams.set('de', email)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchImpl(url.toString())
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const text = data?.responseData?.translatedText
      if (typeof text !== 'string' || !text.trim()) throw new Error('empty')
      // 配额/参数错误以文本形式返回
      if (/MYMEMORY WARNING/i.test(text)) return null
      if (/QUERY LENGTH LIMIT/i.test(text)) return null
      if (/INVALID (SOURCE|TARGET|LANGUAGE)/i.test(text)) return null
      return text
    } catch {
      if (attempt === 1) return null
    }
  }
  return null
}

// ————————————————— AI：OpenAI 兼容 —————————————————

/**
 * @param {string[]} texts
 * @param {TranslateOptions} options
 */
async function translateViaAI(texts, options) {
  const fetchImpl = options.fetchImpl || ((...args) => fetch(...args))
  const ai = options.ai || { baseUrl: '', apiKey: '' }
  if (!ai.baseUrl || !ai.apiKey) {
    return { translations: texts.slice(), error: 'ai-not-configured' }
  }
  const { target } = resolveLanguagePair(texts, options.direction)
  const targetName = target === 'zh' ? '简体中文' : 'English'

  const url = normalizeAiBaseUrl(ai.baseUrl)
  const system = [
    `You are a professional academic translator. Translate each numbered text into ${targetName}.`,
    'Preserve paragraph correspondence: reply with a JSON array of objects {"id": <number>, "text": "<translation>"} covering every id exactly once.',
    'Keep technical terms, formulas, code identifiers and citations unchanged. Do not add explanations.'
  ].join(' ')
  const payload = {
    model: ai.model || 'glm-4-flash',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(texts.map((text, i) => ({ id: i + 1, text }))) }
    ]
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    })
    if (!res.ok) {
      return { translations: texts.slice(), error: `ai-http-${res.status}` }
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    const parsed = parseAiTranslations(content, texts.length)
    if (!parsed) return { translations: texts.slice(), error: 'ai-parse' }
    return { translations: parsed, error: null }
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return { translations: texts.slice(), error: aborted ? 'ai-timeout' : 'ai-network' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {unknown} content
 * @param {number} expected
 * @returns {string[] | null}
 */
export function parseAiTranslations(content, expected) {
  if (typeof content !== 'string') return null
  let s = content.trim()
  // 剥掉可能的 ```json 围栏
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // 截取第一个 [ 到最后一个 ]
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start === -1 || end <= start) return null
  let arr
  try {
    arr = JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
  if (!Array.isArray(arr) || arr.length !== expected) return null
  /** @type {string[]} */
  const out = new Array(expected)
  for (const item of arr) {
    if (typeof item === 'string') continue
    const id = Number(item?.id)
    const text = typeof item?.text === 'string' ? item.text : null
    if (Number.isInteger(id) && id >= 1 && id <= expected && text != null) {
      out[id - 1] = text
    }
  }
  if (out.some((x) => typeof x !== 'string')) return null
  return out
}
