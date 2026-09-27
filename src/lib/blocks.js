/**
 * 块模型：把粘贴内容解析为 标题/段落/条目/代码 块序列，并按所选方案重新编号。
 * 纯函数，无 DOM 依赖。编号方案遵循：
 *  - academic：GB/T 7713.2 学术论文 1 / 1.1 / 1.1.1（顶格、编号后空一格、末尾无标点）
 *  - thesis  ：学位论文 第1章（居中）/ 1.1 / 1.1.1
 *  - official：公文/报告 一、（一）1.（1）a.
 *  - none    ：不加编号
 */

import { findFences, lineVote } from './detect.js'

/** @typedef {'heading'|'paragraph'|'item'|'code'|'caption'|'ref'} BlockKind */
/**
 * @typedef {object} Block
 * @property {BlockKind} kind
 * @property {string} text plain text (heading body without number; paragraph; item; empty for code)
 * @property {number} [level] heading level 1..5
 * @property {boolean} [unnumbered] heading exempt from renumbering (摘要/参考文献…)
 * @property {string} [number] assigned by renumberBlocks
 * @property {string} [code] code source (kind === 'code')
 * @property {string} [language] hljs language id or '' (kind === 'code')
 * @property {boolean} [fenced] came from an explicit ``` fence
 */

/** fence info-string → registered hljs language id */
export const LANG_ALIASES = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  'c++': 'cpp',
  cc: 'cpp',
  'c#': 'csharp',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  htm: 'html'
}

// 独立成行时识别为固定栏目的名称
const NAMED_UNNUMBERED = /^(摘要|内容摘要|文章摘要|中英文摘要|英文摘要|abstract|关键词|keywords|参考文献|致谢|谢辞|目录|声明|附录[0-9A-Za-z两二三四五六七八九十]?|后记)$/i
const NAMED_NUMBERED = /^(引言|绪论|前言|结论|总结|结语|结尾|正文|方法|实验|结果|讨论|相关工作|研究背景|研究意义|技术路线)$/i

const CN_NUM = '一二三四五六七八九十'

const RE = {
  md: /^(#{1,6})\s+(.+?)\s*#*$/,
  chapter: /^第\s*([0-9一二三四五六七八九十百]+)\s*(章|部分)\s*(.*)$/,
  section: /^第\s*([0-9一二三四五六七八九十百]+)\s*节\s*(.*)$/,
  cnTop: /^([一二三四五六七八九十]{1,3})\s*[、.．]\s*(.+)$/,
  cnParen: /^[（(]([一二三四五六七八九十]{1,3})[)）]\s*[、.．]?\s*(.+)$/,
  dotted: /^(\d{1,2}(?:\.\d{1,3}){0,3})[.、．]?\s+([^\s].*)$/,
  parenNum: /^[（(](\d{1,3})[)）]\s*[、.．]?\s*(.+)$/,
  numParen: /^(\d{1,3})[)）]\s*[、.．]?\s*(.+)$/,
  latinParen: /^[（(]([a-zA-Z])[)）]\s*[、.．]?\s*(.+)$/,
  latinDot: /^([a-zA-Z])[.、．]\s+([^\s].*)$/,
  bullet: /^[-•·▪◦*+>]\s+(.+)$/,
  ref: /^\[\d{1,3}\]\s*[、.．]?\s*(.+)$/,
  caption: /^(图|表|Figure|Fig\.?|Table)\s*(\d{1,3})\s*[：:.．]?\s*(.*)$/i,
  emphasis: /^\*\*(.+?)\*\*$/
}

const ENDING_PUNCT = /[。．！？；，、：…”』」）》]/

/**
 * 尝试解析行首编号标记。
 * @param {string} line
 * @returns {{ level: number, text: string, marker: string } | null}
 */
export function parseMarker(line) {
  let s = line.trim()
  if (!s) return null

  // **强调标题**：剥掉包裹再识别编号
  const emphasis = s.match(RE.emphasis)
  if (emphasis) s = emphasis[1].trim()
  if (!s) return null

  // 参考文献条目：[1] 作者. 标题… 保留原文（含编号），不参与重编号
  const ref = s.match(RE.ref)
  if (ref && ref[1].trim()) return { level: -1, text: s, marker: 'ref' }

  // 图表题注：图 1 xxx / 表 2 xxx / Figure 1 / Table 1（保留原文）
  const cap = s.match(RE.caption)
  if (cap && cap[3].trim() && !/[。．！？]$/.test(cap[3].trim())) {
    return { level: -2, text: s, marker: 'caption' }
  }

  const md = s.match(RE.md)
  if (md) return { level: Math.min(md[1].length, 3), text: md[2].trim(), marker: 'md' }

  const chapter = s.match(RE.chapter)
  if (chapter) return { level: 1, text: chapter[3].trim(), marker: 'chapter' }
  const section = s.match(RE.section)
  if (section) return { level: 2, text: section[2].trim(), marker: 'section' }

  const cnTop = s.match(RE.cnTop)
  if (cnTop) return { level: 1, text: cnTop[2].trim(), marker: 'cnTop' }
  const cnParen = s.match(RE.cnParen)
  if (cnParen) return { level: 2, text: cnParen[2].trim(), marker: 'cnParen' }

  const dotted = s.match(RE.dotted)
  if (dotted) {
    const rest = dotted[2].trim()
    // 标题不以句末标点收尾："1.5 小时即可完成训练。"是句子不是编号
    if (rest && !ENDING_PUNCT.test(rest)) {
      return { level: segsOf(dotted[1]).length, text: rest, marker: 'dotted' }
    }
  }

  const parenNum = s.match(RE.parenNum)
  if (parenNum) return { level: 3, text: parenNum[2].trim(), marker: 'parenNum' }
  const numParen = s.match(RE.numParen)
  if (numParen) return { level: 3, text: numParen[2].trim(), marker: 'numParen' }
  const latinParen = s.match(RE.latinParen)
  if (latinParen) return { level: 4, text: latinParen[2].trim(), marker: 'latinParen' }
  const latinDot = s.match(RE.latinDot)
  if (latinDot) return { level: 4, text: latinDot[2].trim(), marker: 'latinDot' }

  const bullet = s.match(RE.bullet)
  if (bullet) return { level: 0, text: bullet[1].trim(), marker: 'bullet' }

  return null
}

/** @param {string} dotted @returns {string[]} */
function segsOf(dotted) {
  return dotted.split('.')
}

/** 行是否像无标记标题/条目（短、无句末标点） */
function isBareShortLine(line) {
  const s = line.trim()
  if (!s || s.length > 40) return false
  if (ENDING_PUNCT.test(s) || /[.!?]$/.test(s)) return false
  return true
}

/** 行是否以完整句末标点收尾（句号/问号/叹号/省略号） */
function isCompleteSentenceLine(line) {
  const s = line.trim()
  return /[。．！？!?…]$/.test(s) || /\.$/.test(s)
}

/** 段内多行合并：中文边界不留空格，英文边界留一个空格 */
function joinLines(lines) {
  let out = ''
  for (const raw of lines) {
    const s = raw.trim()
    if (!s) continue
    if (!out) {
      out = s
      continue
    }
    const prevCjk = /[\u3400-\u9fff\u3040-\u30ff]$/.test(out)
    const nextCjk = /^[\u3400-\u9fff\u3040-\u30ff]/.test(s)
    out += prevCjk || nextCjk ? s : ` ${s}`
  }
  return out
}

/** @typedef {{ type: 'code', lines: string[] }
 *   | { type: 'named', text: string, unnumbered: boolean }
 *   | { type: 'marked', text: string, level: number, marker: string, raw: string }
 *   | { type: 'bare', text: string }
 *   | { type: 'para', text: string }} Unit */

/**
 * 组内拆分：每行 → named / marked / bare；剩余行合并为段落。
 * @param {string[]} lines
 * @param {'auto'|'items'|'merge'} [splitMode] 分段模式
 * @param {boolean} [proseContext] 紧跟标题/无编号栏目之后的组：
 *   折行散文概率高，自动模式不按整句行分条
 * @returns {Unit[]}
 */
function splitGroupToUnits(lines, splitMode = 'auto', proseContext = false, listHint = false) {
  const anyMarker = lines.some((l) => parseMarker(l))
  const anyNamed = lines.length === 1
    && (NAMED_UNNUMBERED.test(lines[0].trim()) || NAMED_NUMBERED.test(lines[0].trim()))
  const anyKeyword = lines.length === 1 && /^(关键词|keywords?)\s*[：:]/i.test(lines[0].trim())

  // 整组都没有编号/栏目标记 → 按分段模式整体决定
  if (!anyMarker && !anyNamed && !anyKeyword && lines.length >= 2) {
    if (splitMode === 'items') {
      return lines.map((l) => ({ type: 'bare', text: l.trim() }))
    }
    if (splitMode === 'merge') {
      const text = joinLines(lines)
      return text ? [{ type: 'para', text }] : []
    }
    // auto：整句行组 → 每行一条。冒号引导句之后（列表）放宽到 2 行；
    // 标题/栏目之后的折行散文合并；行尾逗号/冒号说明折行 → 合并
    if (lines.length >= 2 && lines.every((l) => isCompleteSentenceLine(l))
      && (listHint || (!proseContext && lines.length >= 3))) {
      return lines.map((l) => ({ type: 'bare', text: l.trim() }))
    }
    // 全部短行且无标点 → 每行一条
    if (lines.every((l) => isBareShortLine(l))) {
      return lines.map((l) => ({ type: 'bare', text: l.trim() }))
    }
    // 其余视为折行散文 → 合并
    const text = joinLines(lines)
    return text ? [{ type: 'para', text }] : []
  }

  /** @type {Unit[]} */
  const units = []
  /** @type {string[]} */
  let para = []
  const flush = () => {
    if (para.length) {
      const text = joinLines(para)
      if (text) units.push({ type: 'para', text })
      para = []
    }
  }
  const single = lines.length === 1
  for (const line of lines) {
    const s = line.trim()
    if (single) {
      const namedU = s.match(NAMED_UNNUMBERED)
      if (namedU) {
        flush()
        units.push({ type: 'named', text: namedU[1], unnumbered: true })
        continue
      }
      const namedN = s.match(NAMED_NUMBERED)
      if (namedN) {
        flush()
        units.push({ type: 'named', text: namedN[1], unnumbered: false })
        continue
      }
      // 关键词：xxx / Keywords: xxx → 普通段落
      if (/^(关键词|keywords?)\s*[：:]/i.test(s)) {
        para.push(line)
        continue
      }
    }
    const m = parseMarker(line)
    if (m) {
      flush()
      units.push({ type: 'marked', text: m.text, level: m.level, marker: m.marker, raw: s })
      continue
    }
    if (single && !NAMED_UNNUMBERED.test(s) && s.length <= 60) {
      // 单行成组：短行（允许句末标点）进入 bare 分类，由上下文决定条目/标题/段落
      units.push({ type: 'bare', text: s })
      continue
    }
    para.push(line)
  }
  flush()
  return units
}

/**
 * 解析无围栏区域为块。
 * @param {string[]} lines
 * @param {'auto'|'items'|'merge'} [splitMode]
 * @returns {Block[]}
 */
function parseTextRegion(lines, splitMode = 'auto') {
  // 空行分组
  /** @type {string[][]} */
  const groups = []
  let cur = []
  for (const line of lines) {
    if (line.trim()) cur.push(line)
    else if (cur.length) {
      groups.push(cur)
      cur = []
    }
  }
  if (cur.length) groups.push(cur)
  if (!groups.length) return []

  // 展开成单元：整组代码 / 组内单元
  /** @type {Unit[]} */
  const units = []
  let proseContext = false
  let listHint = false
  for (const g of groups) {
    const votes = g.map((l) => lineVote(l))
    const hasCjk = g.some((l) => /[\u3400-\u9fff]/.test(l))
    const looksCode = g.length >= 2
      && !hasCjk
      && votes.every((v) => v === 'code' || v === '')
      && votes.some((v) => v === 'code')
    if (looksCode) {
      units.push({ type: 'code', lines: g })
      proseContext = false
      listHint = false
    } else {
      const groupUnits = splitGroupToUnits(g, splitMode, proseContext, listHint)
      units.push(...groupUnits)
      const last = groupUnits.length === 1 ? groupUnits[0] : null
      proseContext = !!(last && (last.type === 'named' || last.type === 'marked'))
      listHint = !!(last && (last.type === 'para' || last.type === 'bare') && /[:：]$/.test(last.text))
    }
  }

  // 公文体检测：出现 一、/（一） 且其后跟着裸 "N." 时，"N." 视为第 3 级。
  // 但若全篇有"1 引言/2 结论"式学术栏目名，判定为学术文档族，不降级。
  const namedAcademic = units.some((u) => u.type === 'marked' && u.marker === 'dotted'
    && u.level === 1 && NAMED_NUMBERED.test(u.text))
  let firstCnIndex = -1
  units.forEach((u, idx) => {
    if (firstCnIndex === -1 && u.type === 'marked' && (u.marker === 'cnTop' || u.marker === 'cnParen')) {
      firstCnIndex = idx
    }
  })
  const demoteDottedL1 = !namedAcademic && firstCnIndex !== -1
    && units.some((u, idx) => u.type === 'marked' && u.marker === 'dotted' && u.level === 1 && idx > firstCnIndex)
  // 列表型标记：连续出现时归为条目；大纲型标记（1. 一、 # …）保持标题以保留层级
  const LIST_MARKERS = new Set(['bullet', 'numParen', 'latinDot', 'parenNum'])

  /** @type {Block[]} */
  const blocks = []
  for (let i = 0; i < units.length; i += 1) {
    const u = units[i]
    const next = units[i + 1]

    if (u.type === 'code') {
      blocks.push({ kind: 'code', text: '', code: u.lines.join('\n'), language: '', fenced: false })
      continue
    }
    if (u.type === 'para') {
      blocks.push({ kind: 'paragraph', text: u.text })
      continue
    }
    if (u.type === 'named') {
      blocks.push({ kind: 'heading', level: 1, text: u.text, unnumbered: u.unnumbered })
      continue
    }

    if (u.type === 'bare') {
      // 冒号/半角冒号收尾 = 引导句（“…包括：”），不是标题
      if (/[:：]$/.test(u.text)) {
        blocks.push({ kind: 'paragraph', text: u.text })
        continue
      }
      const punct = isCompleteSentenceLine(u.text)
      const prevBare = i > 0 && units[i - 1].type === 'bare'
        ? { punct: isCompleteSentenceLine(units[i - 1].text) }
        : null
      const nextBare = next && next.type === 'bare'
        ? { punct: isCompleteSentenceLine(next.text) }
        : null
      let kind = 'item'
      if (punct) {
        // 完整句：连排成条目；跟段落/代码/列表时是引导句；孤立时是段落
        if (prevBare?.punct || nextBare?.punct) kind = 'item'
        else if (next && (next.type === 'para' || next.type === 'code' || next.type === 'marked')) kind = 'paragraph'
        else if (!prevBare && !nextBare) kind = 'paragraph'
        else if (next == null) kind = 'paragraph'
        else kind = 'item'
      } else if (/[:：]$/.test(u.text) && next && next.type === 'marked') {
        // 冒号引导句 + 列表 → 段落
        kind = 'paragraph'
      } else if (next && (next.type === 'para' || next.type === 'code')) {
        kind = 'heading'
      } else if (nextBare && !nextBare.punct) {
        kind = 'item'
      } else if (nextBare && nextBare.punct) {
        kind = 'heading'
      } else if (next && next.type === 'marked') {
        kind = 'heading'
      } else if (next == null && units.length === 1) {
        kind = 'heading'
      } else if (next == null) {
        kind = 'item'
      }
      if (kind === 'heading') {
        blocks.push({ kind: 'heading', level: 1, text: u.text })
      } else {
        blocks.push({ kind, text: u.text })
      }
      continue
    }

    // marked：参考文献条目 / 图表题注保留原文，不参与编号与层级
    if (u.marker === 'ref') {
      blocks.push({ kind: 'ref', text: u.text })
      continue
    }
    if (u.marker === 'caption') {
      blocks.push({ kind: 'caption', text: u.text })
      continue
    }

    // marked
    if (u.level === 0) {
      blocks.push({ kind: 'item', text: u.text })
      continue
    }
    let level = u.level
    if (demoteDottedL1 && u.marker === 'dotted' && level === 1) level = 3

    const nextIsContent = next && (next.type === 'para' || next.type === 'code')
    const nextIsSameMarker = next && next.type === 'marked' && next.marker === u.marker && u.marker !== 'chapter'
    const markerIsListType = LIST_MARKERS.has(u.marker)

    if (ENDING_PUNCT.test(u.text) && nextIsSameMarker && !nextIsContent) {
      // 带句末标点且同类标记连续 → 是列项句而非标题，保留原行文本
      blocks.push({ kind: 'paragraph', text: u.raw })
      continue
    }
    if (markerIsListType && nextIsSameMarker && !nextIsContent) {
      blocks.push({ kind: 'item', text: u.text, level })
      continue
    }
    blocks.push({ kind: 'heading', level, text: u.text })
  }
  return blocks
}

/**
 * 粘贴内容 → 块序列。支持 ``` 围栏代码与隐式代码段。
 * @param {string} text
 * @param {{ splitMode?: 'auto' | 'items' | 'merge' }} [options]
 * @returns {Block[]}
 */
export function parseBlocks(text, options = {}) {
  const splitMode = options.splitMode === 'items' || options.splitMode === 'merge' ? options.splitMode : 'auto'
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+$/, '')
  if (!normalized.trim()) return []
  const lines = normalized.split('\n')
  const fences = findFences(lines)

  /** @type {Block[]} */
  const blocks = []
  let cursor = 0
  for (const fence of fences) {
    if (fence.start > cursor) {
      blocks.push(...parseTextRegion(lines.slice(cursor, fence.start), splitMode))
    }
    const inner = fence.closed
      ? lines.slice(fence.start + 1, Math.max(fence.start + 1, fence.end - 1))
      : lines.slice(fence.start + 1, fence.end)
    if (inner.length && inner.join('').trim()) {
      blocks.push({
        kind: 'code',
        text: '',
        code: inner.join('\n'),
        language: LANG_ALIASES[fence.language.toLowerCase()] ?? fence.language.toLowerCase(),
        fenced: true
      })
    }
    cursor = fence.end
  }
  if (cursor < lines.length) {
    blocks.push(...parseTextRegion(lines.slice(cursor), splitMode))
  }
  return blocks
}

// ————————————————— 编号方案 —————————————————

/** @param {number} n @returns {string} */
function toCnNum(n) {
  if (n <= 0) return String(n)
  if (n <= 10) return CN_NUM[n - 1]
  if (n < 20) return `十${n % 10 === 0 ? '' : CN_NUM[n % 10 - 1]}`
  if (n < 100) {
    const t = Math.floor(n / 10)
    const o = n % 10
    return `${t === 1 ? '' : CN_NUM[t - 1]}十${o === 0 ? '' : CN_NUM[o - 1]}`
  }
  return String(n)
}

/** @param {number} n @returns {string} a..z aa..az */
function toLatin(n) {
  let s = ''
  let v = n
  while (v > 0) {
    const r = (v - 1) % 26
    s = String.fromCharCode(97 + r) + s
    v = Math.floor((v - 1) / 26)
  }
  return s
}

/** @param {number[]} counters c[1..5] @param {number} level */
function dottedNumber(counters, level) {
  const parts = []
  for (let i = 1; i <= level; i += 1) parts.push(String(counters[i] || 1))
  return parts.join('.')
}

/**
 * 编号方案格式器。cjk 为 true 时括号用全角。
 * @param {string} schemeId
 * @param {boolean} [cjk]
 */
export function schemeFormatter(schemeId, cjk = false) {
  const lp = cjk ? '（' : '('
  const rp = cjk ? '）' : ')'
  if (schemeId === 'thesis') {
    return {
      heading(level, c) {
        if (level <= 1) return `第${c[1]}章`
        return dottedNumber(c, Math.min(level, 3))
      },
      item: (n) => `${n})`
    }
  }
  if (schemeId === 'official') {
    return {
      heading(level, c) {
        if (level <= 1) return `${toCnNum(c[1])}、`
        if (level === 2) return `${lp}${toCnNum(c[2])}${rp}`
        if (level === 3) return `${c[3]}.`
        if (level === 4) return `${lp}${c[4]}${rp}`
        return `${toLatin(c[5])}.`
      },
      item: (n) => `${lp}${n}${rp}`
    }
  }
  // academic（默认）
  return {
    heading(level, c) {
      return dottedNumber(c, Math.min(level, 3))
    },
    item: (n) => `${n})`
  }
}

export const NUMBERING_SCHEME_IDS = ['academic', 'thesis', 'official', 'none']

/** @param {unknown} id */
export function resolveSchemeId(id) {
  return NUMBERING_SCHEME_IDS.includes(/** @type {string} */ (id)) ? /** @type {string} */ (id) : 'academic'
}

/**
 * 是否含 CJK（决定全/半角括号）。
 * @param {Block[]} blocks
 */
function blocksHaveCjk(blocks) {
  return blocks.some((b) => /[\u3400-\u9fff]/.test(b.text || ''))
}

/**
 * 按方案给标题/条目重编号（返回新数组，编号写入 block.number）。
 * @param {Block[]} blocks
 * @param {string} schemeId academic | thesis | official | none
 */
export function renumberBlocks(blocks, schemeId) {
  const scheme = resolveSchemeId(schemeId)
  const fmt = schemeFormatter(scheme, blocksHaveCjk(blocks))
  /** @type {number[]} */
  const counters = [0, 0, 0, 0, 0, 0]
  let itemCount = 0
  const maxLevel = scheme === 'official' ? 5 : 3
  return blocks.map((b) => {
    if (b.kind === 'heading') {
      itemCount = 0
      if (scheme === 'none' || b.unnumbered) return { ...b, number: undefined }
      let level = Math.max(1, Math.min(b.level ?? 1, maxLevel))
      while (level > 1 && counters[level - 1] === 0) level -= 1
      counters[level] = (counters[level] || 0) + 1
      for (let i = level + 1; i < counters.length; i += 1) counters[i] = 0
      return { ...b, level, number: fmt.heading(level, counters) }
    }
    if (b.kind === 'item') {
      if (scheme === 'none') return { ...b, number: undefined }
      itemCount += 1
      return { ...b, number: fmt.item(itemCount) }
    }
    return { ...b }
  })
}

/**
 * 块序列 → 纯文本（剪贴板纯文本与统计用）。
 * @param {Block[]} blocks
 */
export function blocksToPlainText(blocks) {
  /** @type {string[]} */
  const parts = []
  let prevKind = ''
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph' || b.kind === 'code' || b.kind === 'caption' || b.kind === 'ref') {
      parts.push(b.kind === 'code' ? (b.code || '') : (b.number ? `${b.number} ${b.text}` : b.text))
      prevKind = b.kind
    } else if (b.kind === 'item') {
      const line = b.number ? `${b.number} ${b.text}` : b.text
      if (prevKind === 'item' && parts.length) {
        parts[parts.length - 1] += `\n${line}`
      } else {
        parts.push(line)
      }
      prevKind = 'item'
    }
  }
  return parts.join('\n\n')
}
