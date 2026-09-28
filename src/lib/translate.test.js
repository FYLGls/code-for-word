import { describe, expect, it } from 'vitest'
import {
  detectTextLang,
  splitSentences,
  normalizeAiBaseUrl,
  translateTexts,
  parseAiTranslations,
  resolveLanguagePair
} from './translate.js'

describe('resolveLanguagePair', () => {
  it('honors explicit direction', () => {
    expect(resolveLanguagePair(['中文内容'], 'en2zh')).toEqual({ source: 'en', target: 'zh' })
    expect(resolveLanguagePair(['English'], 'zh2en')).toEqual({ source: 'zh', target: 'en' })
  })

  it('auto-detects mutually', () => {
    expect(resolveLanguagePair(['你好世界'], undefined)).toEqual({ source: 'zh', target: 'en' })
    expect(resolveLanguagePair(['hello world'], undefined)).toEqual({ source: 'en', target: 'zh' })
  })
})

describe('detectTextLang', () => {
  it('detects chinese and english', () => {
    expect(detectTextLang('这是一段中文文本。')).toBe('zh')
    expect(detectTextLang('This is an English sentence.')).toBe('en')
    expect(detectTextLang('混合 Chinese 为主。的文本')).toBe('zh')
  })
})

describe('splitSentences', () => {
  it('keeps short text as one chunk', () => {
    expect(splitSentences('全文很短。')).toEqual(['全文很短。'])
  })

  it('splits long text into chunks under the limit', () => {
    const text = `${'这是第一个句子的内容，包含很多字。'.repeat(20)}${'这是第二个句子。'.repeat(20)}`
    const chunks = splitSentences(text, 100)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100)
    expect(chunks.join('')).toBe(text.replace(/\s+/g, ' ').trim())
  })
})

describe('normalizeAiBaseUrl', () => {
  it('appends chat/completions once', () => {
    expect(normalizeAiBaseUrl('https://open.bigmodel.cn/api/paas/v4'))
      .toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    expect(normalizeAiBaseUrl('https://api.deepseek.com/v1/'))
      .toBe('https://api.deepseek.com/v1/chat/completions')
    expect(normalizeAiBaseUrl('https://x.com/v1/chat/completions'))
      .toBe('https://x.com/v1/chat/completions')
    expect(normalizeAiBaseUrl('')).toBe('')
  })
})

describe('parseAiTranslations', () => {
  it('parses id/text object arrays', () => {
    const out = parseAiTranslations('```json\n[{"id":1,"text":"甲"},{"id":2,"text":"乙"}]\n```', 2)
    expect(out).toEqual(['甲', '乙'])
  })

  it('rejects incomplete or malformed replies', () => {
    expect(parseAiTranslations('[{"id":1,"text":"甲"}]', 2)).toBeNull()
    expect(parseAiTranslations('no json here', 1)).toBeNull()
    expect(parseAiTranslations(null, 1)).toBeNull()
  })
})

describe('translateTexts (free)', () => {
  it('translates each text and joins sentence chunks', async () => {
    /** @type {string[]} */
    const queries = []
    const fetchImpl = /** @type {any} */ (async (url) => {
      const u = new URL(url)
      queries.push(u.searchParams.get('q') || '')
      return {
        ok: true,
        json: async () => ({ responseData: { translatedText: `T:${u.searchParams.get('q')}` } })
      }
    })
    const { translations, error } = await translateTexts(['第一段。', '第二段。'], {
      provider: 'free',
      target: 'en',
      fetchImpl
    })
    expect(error).toBeNull()
    expect(translations).toEqual(['T:第一段。', 'T:第二段。'])
    expect(queries).toEqual(['第一段。', '第二段。'])
  })

  it('joins multi-chunk translations in task order despite concurrent completion', async () => {
    // 长段 >420 字符 → 切成两块；让第一块故意晚完成，拼接顺序必须仍是任务序
    const long = '这是第一块的内容，长度足够被切分成两个块。'.repeat(30)
    let calls = 0
    const fetchImpl = /** @type {any} */ (async () => {
      calls += 1
      const tag = `T${calls}`
      if (calls === 1) {
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => ({ responseData: { translatedText: tag } }) }), 40))
      }
      return { ok: true, json: async () => ({ responseData: { translatedText: tag } }) }
    })
    const { translations, error } = await translateTexts([long], { provider: 'free', fetchImpl })
    expect(error).toBeNull()
    expect(calls).toBe(2)
    expect(translations[0]).toBe('T1T2')
  })

  it('keeps original text for failed chunks and reports error when all fail', async () => {
    const fetchImpl = /** @type {any} */ (async () => ({
      ok: true,
      json: async () => ({ responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } })
    }))
    const { translations, error } = await translateTexts(['原文一。'], {
      provider: 'free',
      fetchImpl
    })
    expect(error).toBe('free-all-failed')
    expect(translations).toEqual(['原文一。'])
  })

  it('retries once before giving up on a chunk', async () => {
    let calls = 0
    const fetchImpl = /** @type {any} */ (async () => {
      calls += 1
      if (calls === 1) throw new Error('network glitch')
      return { ok: true, json: async () => ({ responseData: { translatedText: 'OK' } }) }
    })
    const { translations, error } = await translateTexts(['内容'], { provider: 'free', fetchImpl })
    expect(error).toBeNull()
    expect(translations).toEqual(['OK'])
    expect(calls).toBe(2)
  })
})

describe('translateTexts (ai)', () => {
  it('posts to chat/completions and maps ids back', async () => {
    /** @type {{url: string, init: any}} */
    let captured
    const fetchImpl = /** @type {any} */ (async (url, init) => {
      captured = { url, init }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[{"id":2,"text":"B"},{"id":1,"text":"A"}]' } }]
        })
      }
    })
    const { translations, error } = await translateTexts(['一', '二'], {
      provider: 'ai',
      ai: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'sk-test', model: 'glm-4-flash' },
      fetchImpl
    })
    expect(error).toBeNull()
    expect(translations).toEqual(['A', 'B'])
    expect(captured.url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    const body = JSON.parse(captured.init.body)
    expect(body.model).toBe('glm-4-flash')
    expect(captured.init.headers.Authorization).toBe('Bearer sk-test')
  })

  it('reports missing configuration without calling the API', async () => {
    let called = false
    const fetchImpl = /** @type {any} */ (async () => {
      called = true
      return { ok: true, json: async () => ({}) }
    })
    const { error } = await translateTexts(['x'], { provider: 'ai', ai: { baseUrl: '', apiKey: '' }, fetchImpl })
    expect(error).toBe('ai-not-configured')
    expect(called).toBe(false)
  })

  it('surfaces http errors', async () => {
    const fetchImpl = /** @type {any} */ (async () => ({ ok: false, status: 401 }))
    const { error } = await translateTexts(['x'], {
      provider: 'ai',
      ai: { baseUrl: 'https://x.example/v4', apiKey: 'k' },
      fetchImpl
    })
    expect(error).toBe('ai-http-401')
  })
})
