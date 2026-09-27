import { describe, expect, it } from 'vitest'
import { localeFromNsisLanguage, resolveStartLocale } from './locale-preference.js'

describe('resolveStartLocale', () => {
  it('uses a pinned UI language first', () => {
    expect(resolveStartLocale({ saved: 'fr', installLocale: 'en' })).toBe('fr')
  })

  it('uses installer language when the user has not pinned one', () => {
    expect(resolveStartLocale({ saved: 'auto', installLocale: 'en' })).toBe('en')
    expect(resolveStartLocale({ saved: null, installLocale: 'zh' })).toBe('zh')
  })

  it('falls back to system follow when neither is set', () => {
    expect(resolveStartLocale({ saved: 'auto', installLocale: null })).toBe('auto')
  })
})

describe('localeFromNsisLanguage', () => {
  it('maps common installer LANGIDs and defaults to English', () => {
    expect(localeFromNsisLanguage(1033)).toBe('en')
    expect(localeFromNsisLanguage(2052)).toBe('zh')
    expect(localeFromNsisLanguage(1036)).toBe('fr')
    expect(localeFromNsisLanguage(9999)).toBe('en')
  })
})
