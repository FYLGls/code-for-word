import { describe, expect, it } from 'vitest'
import { resolveFrameStyle, rtfParaBorders, cssFrameBorders } from './frame.js'

describe('frameStyle', () => {
  it('defaults unknown ids to bar', () => {
    expect(resolveFrameStyle(undefined)).toBe('bar')
    expect(resolveFrameStyle('nope')).toBe('bar')
    expect(resolveFrameStyle('rails')).toBe('rails')
    expect(resolveFrameStyle('box')).toBe('box')
  })

  it('bar is left border only', () => {
    const rtf = rtfParaBorders('bar', 4, 0, 3)
    expect(rtf).toContain('\\brdrl')
    expect(rtf).not.toContain('\\brdrr')
    expect(rtf).not.toContain('\\brdrt')
    expect(cssFrameBorders('bar', '#C00000').borderRight).toBeUndefined()
  })

  it('rails has left and right, no top/bottom', () => {
    const rtf = rtfParaBorders('rails', 4, 1, 3)
    expect(rtf).toMatch(/\\brdrl\\brdrs/)
    expect(rtf).toMatch(/\\brdrr\\brdrs/)
    expect(rtf).not.toContain('\\brdrt')
    expect(rtf).not.toContain('\\brdrb')
    const css = cssFrameBorders('rails', '#007ACC')
    expect(css.borderLeft).toContain('#007ACC')
    expect(css.borderRight).toContain('#007ACC')
  })

  it('box skips per-line paragraph borders (outer cell draws the frame)', () => {
    expect(rtfParaBorders('box', 4, 0, 3)).toBe('')
    expect(rtfParaBorders('box', 4, 2, 3)).toBe('')
    expect(cssFrameBorders('box', '#007ACC').border).toContain('solid')
  })
})
