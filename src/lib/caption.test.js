import { describe, expect, it } from 'vitest'
import {
  normalizeCaption,
  normalizeCaptionLines,
  shouldShowCaption,
  captionDisplayText,
  captionDisplayLines,
  resolveCaptionLines,
  resolveCaptionFont,
  resolveCaptionBackground,
  resolveCaptionColor,
  resolveCaptionBold,
  resolveCaptionItalic,
  clampCaptionRowCount,
  CAPTION_MIN_ROWS,
  DEFAULT_CAPTION_FONT,
  DEFAULT_CAPTION_BG,
  DEFAULT_CAPTION_COLOR
} from './caption.js'

describe('caption', () => {
  it('normalizes whitespace', () => {
    expect(normalizeCaption('  hello \r\n ')).toBe('hello')
    expect(normalizeCaption(null)).toBe('')
  })

  it('keeps multi-row slots and clamps max', () => {
    expect(normalizeCaptionLines(['附录 4', '代码 4'])).toEqual(['附录 4', '代码 4'])
    expect(normalizeCaptionLines([])).toEqual([''])
    expect(normalizeCaptionLines(null)).toEqual([''])
    expect(clampCaptionRowCount(0)).toBe(CAPTION_MIN_ROWS)
    expect(clampCaptionRowCount(99)).toBe(6)
  })

  it('resolves legacy caption string as one row', () => {
    expect(resolveCaptionLines({ caption: '图 1' })).toEqual(['图 1'])
    expect(resolveCaptionLines({ captionLines: ['a', 'b'] })).toEqual(['a', 'b'])
  })

  it('shows in preview when enabled even if empty', () => {
    expect(shouldShowCaption({ captionEnabled: true, preview: true, caption: '' })).toBe(true)
    expect(shouldShowCaption({ captionEnabled: true, caption: '' })).toBe(false)
    expect(shouldShowCaption({ captionEnabled: true, captionLines: ['', ''] })).toBe(false)
    expect(shouldShowCaption({ captionEnabled: true, captionLines: ['图 1', ''] })).toBe(true)
    expect(shouldShowCaption({ captionEnabled: false, caption: 'x' })).toBe(false)
  })

  it('uses placeholder only for preview display; export drops empties', () => {
    expect(captionDisplayText({ caption: '', preview: true, captionPlaceholder: '说明…' })).toBe('说明…')
    expect(captionDisplayText({ caption: '真实', preview: true, captionPlaceholder: '说明…' })).toBe('真实')
    expect(captionDisplayText({ caption: '', preview: false, captionPlaceholder: '说明…' })).toBe('')
    expect(captionDisplayLines({
      captionLines: ['附录 4', '', '代码 4'],
      preview: false
    })).toEqual(['附录 4', '代码 4'])
    expect(captionDisplayLines({
      captionLines: ['', ''],
      preview: true,
      captionPlaceholder: '说明…'
    })).toEqual(['说明…', '说明…'])
  })

  it('resolves caption font, background, color, bold, italic', () => {
    expect(resolveCaptionFont({})).toBe(DEFAULT_CAPTION_FONT)
    expect(resolveCaptionFont({ captionFont: '黑体' })).toBe('黑体')
    expect(resolveCaptionBackground({})).toBe(DEFAULT_CAPTION_BG.toUpperCase())
    expect(resolveCaptionBackground({ captionBackground: 'grey' })).toBe('#D9D9D9')
    expect(resolveCaptionBackground({ captionBackground: '#eef1f4' })).toBe('#EEF1F4')
    expect(resolveCaptionColor({})).toBe(DEFAULT_CAPTION_COLOR)
    expect(resolveCaptionColor({ captionColor: 'red' })).toBe('#C00000')
    expect(resolveCaptionBold({ captionBold: true })).toBe(true)
    expect(resolveCaptionItalic({})).toBe(false)
    expect(resolveCaptionItalic({ captionItalic: true })).toBe(true)
  })
})
