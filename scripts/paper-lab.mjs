// 论文解析实验台：node scripts/paper-lab.mjs <fixture.txt> [scheme]
// 输出：类型识别（含 hljs 信号）、原始块结构、按方案重编号结果
import fs from 'node:fs'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

import { detectKind } from '../src/lib/detect.js'
import { parseBlocks, renumberBlocks } from '../src/lib/blocks.js'

for (const [id, lang] of [
  ['bash', bash], ['c', c], ['cpp', cpp], ['csharp', csharp], ['css', css],
  ['go', go], ['java', java], ['javascript', javascript], ['json', json],
  ['kotlin', kotlin], ['php', php], ['python', python], ['rust', rust],
  ['sql', sql], ['typescript', typescript], ['xml', xml], ['yaml', yaml]
]) {
  hljs.registerLanguage(id, lang)
}
hljs.registerLanguage('html', xml)
hljs.registerLanguage('shell', bash)

const file = process.argv[2]
const scheme = process.argv[3] || 'academic'
const text = fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')

const auto = (src) => {
  try {
    const r = hljs.highlightAuto(src)
    return { language: r.language, relevance: r.relevance }
  } catch {
    return null
  }
}

const detection = detectKind(text, { autoDetect: auto })
console.log('== detectKind ==')
console.log(JSON.stringify(detection), '| hljs:', JSON.stringify(auto(text)))

console.log('== parseBlocks (raw) ==')
const raw = parseBlocks(text, { splitMode: 'auto' })
raw.forEach((b, i) => {
  const desc = b.kind === 'code'
    ? `code ${b.fenced ? '(fenced)' : '(implicit)'} lang="${b.language}" lines=${(b.code || '').split('\n').length}`
    : b.kind === 'heading'
      ? `H${b.level}${b.unnumbered ? '*' : ''} "${b.text.slice(0, 36)}"`
      : `${b.kind} "${(b.text || '').slice(0, 36).replace(/\n/g, '⏎')}"`
  console.log(`${String(i).padStart(2)} ${desc}`)
})

console.log(`== renumbered (${scheme}) ==`)
renumberBlocks(raw, scheme).forEach((b, i) => {
  const desc = b.kind === 'code'
    ? 'code'
    : b.kind === 'heading'
      ? `H${b.level}${b.unnumbered ? '*' : ''} "${b.number ? b.number + ' ' : ''}${b.text.slice(0, 36)}"`
      : `${b.kind}${b.number ? ` "${b.number} ${b.text.slice(0, 30)}"` : ` "${(b.text || '').slice(0, 30)}"`}`
  console.log(`${String(i).padStart(2)} ${desc}`)
})
