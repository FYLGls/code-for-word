import { describe, expect, it } from 'vitest'
import {
  resolveFrameStyle,
  rtfParaBorders,
  cssFrameBorders,
  cssCaptionBorders,
  cssCodeBorders
} from './frame.js'

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

  it('caption+code CSS borders keep continuous sides without outer wrapper', () => {
    const cap = cssCaptionBorders('box', '#007ACC', true)
    expect(cap.borderTop).toContain('#007ACC')
    expect(cap.borderBottom).toContain('1pt')
    expect(cap.borderLeft).toContain('#007ACC')
    const code = cssCodeBorders('box', '#007ACC', true)
    expect(code.borderTop).toBe('none')
    expect(code.borderBottom).toContain('#007ACC')
    expect(code.borderLeft).toContain('#007ACC')
    expect(cssCodeBorders('bar', '#007ACC', false).border).toBe('none')
  })
})
