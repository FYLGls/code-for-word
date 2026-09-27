import { describe, expect, it } from 'vitest'
import { parseBlocks, renumberBlocks } from './blocks.js'
import { buildPaperModel, parseInline, paperParasToPlainText, PAPER_DEFAULTS } from './paper-format.js'

const stubHighlight = (code) => code.split('\n').map((l) => [{ text: l, color: '#000000' }])

describe('parseInline', () => {
  it('parses bold and inline code markers', () => {
    expect(parseInline('普通**加粗**文本')).toEqual([
      { text: '普通' },
      { text: '加粗', bold: true },
      { text: '文本' }
    ])
    expect(parseInline('调用 `train()` 函数')).toEqual([
      { text: '调用 ' },
      { text: 'train()', fontName: 'Consolas' },
      { text: ' 函数' }
    ])
  })

  it('strips markdown links', () => {
    expect(parseInline('参见[官方文档](https://example.com)说明')).toEqual([
      { text: '参见' },
      { text: '官方文档' },
      { text: '说明' }
    ])
  })
})

describe('buildPaperModel', () => {
  it('formats headings per thesis presets', () => {
    const blocks = renumberBlocks(parseBlocks('1 引言\n\n正文内容。'), 'academic')
    const paras = buildPaperModel(blocks, { highlight: stubHighlight })
    expect(paras).toHaveLength(2)

    const h = paras[0]
    expect(h.kind).toBe('heading')
    expect(h.runs.map((r) => r.text).join('')).toBe('1 引言')
    expect(h.fontName).toBe(PAPER_DEFAULTS.headingFont)
    expect(h.fontSizePt).toBe(16)
    expect(h.align).toBe('left')
    expect(h.runs[0].bold).toBe(true)
    expect(h.beforeTwips).toBe(480) // 24pt
    expect(h.afterTwips).toBe(360) // 18pt

    const body = paras[1]
    expect(body.kind).toBe('body')
    expect(body.fontName).toBe('宋体')
    expect(body.fontSizePt).toBe(12)
    expect(body.align).toBe('justify')
    expect(body.firstLineTwips).toBe(480) // 2 字符 × 12pt × 20
    expect(body.lineMultiple).toBe(1.5)
  })

  it('centers thesis chapters and unnumbered sections', () => {
    const blocks = renumberBlocks(parseBlocks('第1章 绪论\n\n正文。\n\n参考文献'), 'thesis')
    const paras = buildPaperModel(blocks, { scheme: 'thesis', highlight: stubHighlight })
    expect(paras[0].align).toBe('center')
    expect(paras[0].runs.map((r) => r.text).join('')).toBe('第1章 绪论')
    expect(paras[2].align).toBe('center')
    expect(paras[2].runs.map((r) => r.text).join('')).toBe('参考文献')
  })

  it('builds code blocks with auto captions', () => {
    const src = ['说明文字。', '', '```python', 'x = 1', 'y = 2', '```'].join('\n')
    const paras = buildPaperModel(parseBlocks(src), { highlight: stubHighlight })
    const kinds = paras.map((p) => p.kind)
    expect(kinds).toEqual(['body', 'codeCaption', 'code', 'code'])
    expect(paras[1].runs[0].text).toBe('代码 1')
    expect(paras[1].align).toBe('center')
    expect(paras[2].groupId).toBe('code-1')
    expect(paras[2].lineMultiple).toBeNull()
    expect(paras[3].codeLast).toBe(true)
  })

  it('applies translated output mode', () => {
    const src = '1 Introduction\n\nDeep learning is powerful.'
    const blocks = renumberBlocks(parseBlocks(src), 'academic')
    const translations = new Map([[0, '引言'], [1, '深度学习非常强大。']])
    const paras = buildPaperModel(blocks, { translations, translateOutput: 'translated' })
    expect(paras[0].runs.map((r) => r.text).join('')).toBe('1 引言')
    expect(paras[1].runs.map((r) => r.text).join('')).toBe('深度学习非常强大。')
  })

  it('interleaves original and translation in bilingual mode', () => {
    const src = '正文第一段。'
    const blocks = renumberBlocks(parseBlocks(src), 'academic')
    const translations = new Map([[0, 'Body paragraph one.']])
    const paras = buildPaperModel(blocks, { translations, translateOutput: 'bilingual' })
    expect(paras).toHaveLength(2)
    expect(paras[0].runs.map((r) => r.text).join('')).toBe('正文第一段。')
    expect(paras[1].runs.map((r) => r.text).join('')).toBe('Body paragraph one.')
  })

  it('honors custom body options', () => {
    const blocks = renumberBlocks(parseBlocks('正文。'), 'academic')
    const paras = buildPaperModel(blocks, {
      bodyFont: '楷体',
      bodySizePt: 14,
      lineSpacing: 2,
      firstLineIndentChars: 0,
      justify: false
    })
    expect(paras[0].fontName).toBe('楷体')
    expect(paras[0].fontSizePt).toBe(14)
    expect(paras[0].lineMultiple).toBe(2)
    expect(paras[0].firstLineTwips).toBe(0)
    expect(paras[0].align).toBe('left')
  })
})

describe('paperParasToPlainText', () => {
  it('flattens paragraphs and keeps code lines together', () => {
    const src = ['1 引言', '', '正文。', '', '```js', 'let a = 1', 'let b = 2', '```'].join('\n')
    const paras = buildPaperModel(renumberBlocks(parseBlocks(src), 'academic'), { highlight: stubHighlight })
    const text = paperParasToPlainText(paras)
    expect(text).toBe('1 引言\n\n正文。\n\n代码 1\nlet a = 1\nlet b = 2')
  })
})
