import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { normalizeLocale, shellStrings, SHELL } = require('../electron/shell-i18n.cjs')

describe('shell-i18n', () => {
  it('normalizes unknown locales to en', () => {
    expect(normalizeLocale('de')).toBe('en')
    expect(normalizeLocale('zh-CN')).toBe('zh')
  })

  it('exposes matching menu keys for every locale', () => {
    const keys = Object.keys(SHELL.en).sort()
    for (const locale of Object.keys(SHELL)) {
      expect(Object.keys(shellStrings(locale)).sort()).toEqual(keys)
    }
  })

  it('returns English File menu for en', () => {
    expect(shellStrings('en').file).toBe('File')
    expect(shellStrings('en').showMain).toBe('Show Main Window')
  })

  it('returns Chinese File menu for zh', () => {
    expect(shellStrings('zh').file).toBe('文件')
    expect(shellStrings('zh').showMain).toBe('显示主窗口')
  })
})
