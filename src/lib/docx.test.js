import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { linesToDocxBlob } from './docx.js'

async function docXml(blob) {
  const buf = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml').async('string')
}

describe('DOCX exporter', () => {
  it('box+caption uses table borders (continuous outer + insideH divider)', async () => {
    const blob = await linesToDocxBlob(
      [[{ text: 'def x():', color: '#0000FF' }], [{ text: '    pass', color: '#000000' }]],
      {
        background: '#FFFFFF',
        foreground: '#000000',
        captionEnabled: true,
        captionLines: ['代码示例'],
        accentLeft: '#C00000',
        frameStyle: 'box',
        lineNumbers: true,
        fontName: 'Times New Roman',
        fontSizePt: 10
      }
    )
    const xml = await docXml(blob)
    expect(xml).toContain('w:tbl')
    expect(xml).toContain('代码示例')
    expect(xml).toContain('def x():')
    // Table-level borders, not per-paragraph side rails
    expect(xml).toMatch(/w:tblBorders/)
    expect(xml).toMatch(/w:insideH[^>]*w:val="single"/)
    expect(xml).toMatch(/w:left[^>]*w:val="single"[^>]*w:sz="24"/)
    // No paragraph border left on caption (would cause hairlines)
    const afterCap = xml.split('代码示例')[1] || ''
    expect(afterCap.slice(0, 800)).not.toMatch(/w:pBdr[\s\S]{0,200}w:left[^>]*w:val="single"/)
  })

  it('applies UI page margins to Word section pgMar (not table indent)', async () => {
    const blob = await linesToDocxBlob(
      [[{ text: 'x', color: '#000000' }]],
      {
        background: '#FFFFFF',
        foreground: '#000000',
        sideMarginTwips: { left: 1134, right: 1134 },
        paperId: 'a4',
        pageContentTwips: 9026,
        frameStyle: 'box'
      }
    )
    const xml = await docXml(blob)
    expect(xml).toMatch(/w:pgMar[^>]*w:left="1134"/)
    expect(xml).toMatch(/w:pgMar[^>]*w:right="1134"/)
    expect(xml).toMatch(/w:pgSz[^>]*w:w="11906"/)
  })
})
