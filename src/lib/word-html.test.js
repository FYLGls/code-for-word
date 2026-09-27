import { describe, expect, it } from 'vitest'
import { buildCfHtml, linesToWordHtml } from './word-html.js'

describe('Word HTML exporter', () => {
  it('builds CF_HTML offsets (for native hosts only)', () => {
    const payload = buildCfHtml('<b>hi</b>')
    expect(payload).toContain('Version:0.9')
    expect(payload).toContain('<!--StartFragment-->')
    const startHtml = Number(payload.match(/StartHTML:(\d+)/)[1])
    const bytes = new TextEncoder().encode(payload)
    expect(String.fromCharCode(bytes[startHtml])).toBe('<')
  })

  it('emits a single-block listing without table grid', () => {
    const html = linesToWordHtml(
      [
        [
          { text: 'import ', color: '#AF00DB' },
          { text: 'pandas', color: '#1A1A1A' }
        ]
      ],
      {
        background: '#F5F5F5',
        foreground: '#1A1A1A',
        fontName: 'Consolas',
        fontSizePt: 9,
        lineNumbers: true,
        lineNumberSuffix: '.',
        accentLeft: '#70AD47'
      }
    )

    expect(html).toContain('<pre')
    expect(html).not.toContain('<table')
    expect(html).toContain('border-left:2.25pt solid #70AD47')
    expect(html).toContain('display:block')
    expect(html).toContain('width:max-content')
    expect(html).toContain('text-align:left')
    expect(html).toContain('mso-no-proof:yes')
    expect(html).toContain('1.')
    expect(html).toContain('color:#AF00DB')
  })

  it('rails and box frames change CSS borders', () => {
    const rails = linesToWordHtml(
      [[{ text: 'x', color: '#000000' }]],
      {
        background: '#F5F5F5',
        foreground: '#000000',
        frameStyle: 'rails',
        accentLeft: '#007ACC'
      }
    )
    expect(rails).toContain('data-frame="rails"')
    expect(rails).toContain('border-right:2.25pt solid #007ACC')
    const box = linesToWordHtml(
      [[{ text: 'x', color: '#000000' }]],
      {
        background: '#F5F5F5',
        foreground: '#000000',
        frameStyle: 'box',
        accentLeft: '#007ACC'
      }
    )
    expect(box).toContain('data-frame="box"')
    expect(box).toContain('border:2.25pt solid #007ACC')
  })

  it('preview maps side margins to page padding, not listing offset', () => {
    const html = linesToWordHtml(
      [[{ text: 'x', color: '#000000' }]],
      {
        background: '#F5F5F5',
        foreground: '#000000',
        lineNumbers: false,
        sideMarginTwips: { left: 1134, right: 1134 },
        pageContentTwips: 9000,
        preview: true
      }
    )
    expect(html).toContain('preview-page')
    expect(html).toMatch(/padding:12px [\d.]+% 12px [\d.]+%/)
    expect(html).not.toMatch(/margin:0 [\d.]+pt 0 [\d.]+pt/)
  })

  it('preview shows in-box caption rows with underline, font, and fill', () => {
    const html = linesToWordHtml(
      [[{ text: 'clc;clear;', color: '#000000' }]],
      {
        background: '#FFFFFF',
        foreground: '#000000',
        captionEnabled: true,
        captionLines: ['附录 4', '代码 4：问题四求解'],
        captionFont: '宋体',
        captionBackground: '#D9D9D9',
        captionColor: '#C00000',
        captionBold: true,
        captionItalic: true,
        forceItalic: true,
        accentLeft: '#1A1A1A',
        lineNumbers: true,
        preview: true
      }
    )
    expect(html).toContain('listing-caption')
    expect(html).toContain('listing-caption-row')
    expect(html).toContain('background:#D9D9D9')
    expect(html).toContain("font-family:宋体")
    expect(html).toContain('font-weight:bold')
    expect(html).toContain('font-style:italic')
    expect(html).toContain('color:#C00000')
    expect(html).toContain('border-bottom:1pt solid #1A1A1A')
    expect(html).toContain('附录 4')
    expect(html).toContain('代码 4：问题四求解')

    // caption is inside the listing frame, before code
    const block = html.indexOf('listing-block')
    const cap = html.indexOf('listing-caption')
    const code = html.indexOf('listing-code')
    expect(cap).toBeGreaterThan(block)
    expect(cap).toBeLessThan(code)
    // line numbers start at 1 for code only — caption text has no "1." prefix before 附录
    expect(html).toMatch(/1\.\s*&nbsp;.*clc/)
    expect(html).not.toMatch(/listing-caption-row[^>]*>1\./)
  })

  it('code inset pads both sides of code; gutter stays flush left', () => {
    const html = linesToWordHtml(
      [[{ text: 'abc', color: '#000000' }]],
      {
        background: '#F5F5F5',
        foreground: '#000000',
        fontSizePt: 9,
        lineNumbers: true,
        codeInsetTwips: 567,
        pageContentTwips: 9000,
        preview: true
      }
    )
    const ln = html.indexOf('1.')
    const code = html.indexOf('abc')
    expect(ln).toBeGreaterThan(-1)
    expect(code).toBeGreaterThan(ln)
    expect(html.slice(ln, code)).toMatch(/&nbsp;&nbsp;<\/span> +/)
    expect(html.slice(code)).toMatch(/abc<\/span> +/)
  })

  it('preview default margins flush-fill the paper', () => {
    const html = linesToWordHtml(
      [[{ text: 'x', color: '#000000' }]],
      {
        background: '#F5F5F5',
        foreground: '#000000',
        lineNumbers: false,
        sideMarginTwips: null,
        pageContentTwips: 9000,
        preview: true
      }
    )
    expect(html).toContain('is-flush')
    expect(html).toContain('width:100%')
    expect(html).toMatch(/padding:12px 12px 12px 12px/)
  })
})
