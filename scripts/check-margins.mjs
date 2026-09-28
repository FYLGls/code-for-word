import { linesToRtf } from '../src/lib/rtf.js'
import { linesToDocxBlob, resolveDocxPageSetup } from '../src/lib/docx.js'
import { resolveCodeInsetTwips, listingSideIndents, codeInsetSpaceCount } from '../src/lib/lines.js'
import { cmToTwips as cm } from '../src/themes.js'
import fs from 'node:fs'
import JSZip from 'jszip'

const lines = [
  [{ text: 'def foo():', color: '#0000FF', bold: true }],
  [{ text: '    return 1', color: '#000000' }]
]

const cases = [
  {
    name: 'a4-margin2-inset1',
    sideMarginTwips: { left: cm(2), right: cm(2) },
    codeInsetTwips: cm(1),
    pageContentTwips: 9026,
    paperId: 'a4'
  },
  {
    name: 'a4-auto-auto',
    sideMarginTwips: null,
    codeInsetTwips: null,
    pageContentTwips: 9026,
    paperId: 'a4'
  },
  {
    name: 'fit-margin25-inset05',
    sideMarginTwips: { left: cm(2.5), right: cm(2.5) },
    codeInsetTwips: cm(0.5),
    pageContentTwips: null,
    paperId: 'fit'
  },
  {
    name: 'a5-margin3-inset2',
    sideMarginTwips: { left: cm(3), right: cm(3) },
    codeInsetTwips: cm(2),
    pageContentTwips: 6950,
    paperId: 'a5'
  }
]

for (const c of cases) {
  const sides = listingSideIndents(0, c.sideMarginTwips, c.pageContentTwips)
  const inset = resolveCodeInsetTwips(c.codeInsetTwips, c.pageContentTwips, c.sideMarginTwips)
  const spaces = codeInsetSpaceCount(inset, 9)
  const setup = resolveDocxPageSetup(c)
  const rtf = linesToRtf(lines, {
    ...c,
    background: '#F5F5F5',
    foreground: '#000000',
    frameStyle: 'bar',
    accentLeft: '#007ACC',
    lineNumbers: true,
    fontSizePt: 9
  })
  const li = [...rtf.matchAll(/\\li(\d+)/g)].map((m) => m[1])
  const ri = [...rtf.matchAll(/\\ri(\d+)/g)].map((m) => m[1])
  console.log(JSON.stringify({
    name: c.name,
    sides,
    insetTwips: inset,
    insetSpaces: spaces,
    docxMar: setup.margin,
    pageW: setup.size.width,
    contentW: setup.contentWidth,
    rtf_li: li[0] || null,
    rtf_ri: ri[0] || null
  }))
}

const opts = {
  ...cases[0],
  background: '#F5F5F5',
  foreground: '#000000',
  frameStyle: 'box',
  accentLeft: '#C00000',
  lineNumbers: true,
  fontSizePt: 9,
  captionEnabled: true,
  captionLines: ['代码示例']
}
const blob = await linesToDocxBlob(lines, opts)
const buf = Buffer.from(await blob.arrayBuffer())
fs.writeFileSync('C:/Users/Ibiza/AppData/Local/Temp/margin-test.docx', buf)
const zip = await JSZip.loadAsync(buf)
const xml = await zip.file('word/document.xml').async('string')
console.log('pgMar', xml.match(/w:pgMar[^/]*\/>/)?.[0])
console.log('pgSz', xml.match(/w:pgSz[^/]*\/>/)?.[0])
const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => JSON.stringify(m[1]))
console.log('textRuns', texts.join(' | '))

// Also write RTF for COM paste
const rtf = linesToRtf(lines, {
  ...opts,
  frameStyle: 'rails'
})
fs.writeFileSync('C:/Users/Ibiza/AppData/Local/Temp/margin-test.rtf', rtf)
console.log('wrote docx+rtf')
