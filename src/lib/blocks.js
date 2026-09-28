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

// 独立成行时识别为固定栏目的名称（中英双语）
// 栏目名匹配（内部空白已压缩，兼容论文排版“摘  要”“参 考 文 献”）
const NAMED_UNNUMBERED_SQUEEZED = /^(摘要|内容摘要|文章摘要|中英文摘要|英文摘要|abstract|关键词|keywords|参考文献|references|bibliography|acknowledgements?|acknowledgments?|致谢|谢辞|目录|声明|附录[0-9A-Za-z两二三四五六七八九十]?|后记)$/i
const NAMED_NUMBERED_SQUEEZED = /^(引言|绪论|前言|结论|总结|结语|结尾|正文|方法|实验|结果|讨论|相关工作|研究背景|研究意义|技术路线)$/i

/** 栏目名匹配压缩内部空白，兼容论文排版“摘  要”“参 考 文 献” */
function matchNamedUnnumbered(s) {
  return NAMED_UNNUMBERED_SQUEEZED.test(String(s).replace(/\s+/g, ''))
}
function matchNamedNumbered(s) {
  return NAMED_NUMBERED_SQUEEZED.test(String(s).replace(/\s+/g, ''))
}

const CN_NUM = '一二三四五六七八九十'

const RE = {
  md: /^(#{1,6})\s+(.+?)\s*#*$/,
  chapter: /^第\s*([0-9一二三四五六七八九十百]+)\s*(章|部分)\s*(.*)$/,
  section: /^第\s*([0-9一二三四五六七八九十百]+)\s*节\s*(.*)$/,
  cnTop: /^([一二三四五六七八九十]{1,3})\s*[、.．]\s*(.+)$/,
  cnParen: /^[（(]([一二三四五六七八九十]{1,3})[)）]\s*[、.．]?\s*(.+)$/,
  dotted: /^(\d{1,2}(?:\.\d{1,3}){0,3})([.、．])?\s+([^\s].*)$/,
  parenNum: /^[（(](\d{1,3})[)）]\s*[、.．]?\s*(.+)$/,
  numParen: /^(\d{1,3})[)）]\s*[、.．]?\s*(.+)$/,
  latinParen: /^[（(]([a-zA-Z])[)）]\s*[、.．]?\s*(.+)$/,
  latinDot: /^([a-zA-Z])[.、．]\s+([^\s].*)$/,
  bullet: /^\s*[-•·▪◦*+>–—‣⁃✅❌✔✖☑☐➤→]\s+(.+)$/,
  ref: /^\[\d{1,3}\]\s*[、.．]?\s*(.+)$/,
  refLike: /^\s*\[\d{1,3}\]\s/,
  caption: /^(图|表|Figure|Fig\.?|Table)\s*(\d{1,3}(?:[-–]\d{1,3})?)\s*[：:.．]?\s*(.*)$/i,
  emphasis: /^\*\*(.+?)\*\*$/,
  formula: /^\$\$(.+)\$\$$/,
  algoCaption: /^(算法|Algorithm)\s*\d{1,3}\s*[:：.．]?\s*(.*)$/i,
  algoStep: /^\s*\d{1,3}:\s/,
  algoIO: /^\s*(输入|输出|Input|Output)\s*[:：]/i
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

  // 图表题注：图 1 xxx / 表 2 xxx / Figure 1 / Table 1（保留原文）。
  // 以句号收尾的是正文引用句（"Table 1 shows results…"），不是题注
  const cap = s.match(RE.caption)
  if (cap && cap[3].trim() && !/[。．！？]$|\.$/.test(cap[3].trim())) {
    return { level: -2, text: s, marker: 'caption' }
  }

  // 算法题注：算法 1: xxx / Algorithm 1（保留原文，居中）
  const algo = s.match(RE.algoCaption)
  if (algo && algo[2].trim()) {
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
    const rest = dotted[3].trim()
    const explicitListPunct = !!dotted[2] // "1." / "1、" 形式 = 列表标记，不受句末标点限制
    if (rest && (explicitListPunct || !ENDING_PUNCT.test(rest))) {
      const out = { level: dotted[1].split('.').length, text: rest, marker: 'dotted' }
      if (explicitListPunct) out.listish = true
      return out
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
  const anyMarker = lines.some((l) => parseMarker(l) || RE.formula.test(l.trim()))
  const anyNamed = lines.length === 1
    && (matchNamedUnnumbered(lines[0].trim()) || matchNamedNumbered(lines[0].trim()))
  const anyKeyword = lines.length === 1 && /^(关键词|key\s*words?)\s*[：:]/i.test(lines[0].trim())

  // 整组都没有编号/栏目标记 → 按分段模式整体决定
  if (!anyMarker && !anyNamed && !anyKeyword && lines.length >= 2) {
    if (splitMode === 'items' || splitMode === 'lines') {
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
      if (matchNamedUnnumbered(s)) {
        flush()
        units.push({ type: 'named', text: s, unnumbered: true })
        continue
      }
      if (matchNamedNumbered(s)) {
        flush()
        units.push({ type: 'named', text: s, unnumbered: false })
        continue
      }
      // 关键词：xxx / Key words: xxx → 普通段落
      if (/^(关键词|key\s*words?)\s*[：:]/i.test(s)) {
        para.push(line)
        continue
      }
    }
    const m = parseMarker(line)
    if (m) {
      flush()
      units.push({
        type: 'marked',
        text: m.text,
        level: m.level,
        marker: m.marker,
        raw: s,
        listish: !!m.listish
      })
      continue
    }
    // 独立公式行 $$…$$ → 居中公式块（不是标题）
    const formula = s.match(RE.formula)
    if (formula && formula[1].trim()) {
      flush()
      units.push({ type: 'formula', text: s })
      continue
    }
    if (single && !matchNamedUnnumbered(s) && (s.length <= 60
      || (!ENDING_PUNCT.test(s) && !/[.!?]$/.test(s)))) {
      // 单行成组：短行或无句末标点的长行（论文题目）进入 bare 分类
      units.push({ type: 'bare', text: s })
      continue
    }
    para.push(line)
  }
  flush()
  return units
}

/** 连续整句 bare 行的规模（含自身），用于区分平行列表与孤立句子 */
function bareSentenceRunSize(units, i) {
  let n = 0
  for (let k = i; k >= 0 && units[k].type === 'bare' && isCompleteSentenceLine(units[k].text); k -= 1) n += 1
  for (let k = i + 1; k < units.length && units[k].type === 'bare' && isCompleteSentenceLine(units[k].text); k += 1) n += 1
  return n
}

/** 常见 HTML 实体解码（网页复制残留） */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/<br\s*\/?>/gi, '\n')
}

/** OCR 残留清理：全角数字/字母/句点/〔〕/％→半角（１．１→1.1、ＢＥＲＴ→BERT） */
function normalizeFullWidth(s) {
  return s
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/％/g, '%')
    .replace(/〔/g, '[')
    .replace(/〕/g, ']')
}

/** OCR 字间空格清理：只对"OCR 行"生效——该行 CJK 字间空格密度 ≥ 0.25
 * （如"基 于 深 度 学 习"）才整行清理；正常"第X章 标题"的排版空格保留。
 * 换行不动，英文词间空格保留。另清理 "95 . 2"（数字句点间）与 "[ 1 ]"（括号内侧）。 */
function squeezeCjkSpaces(s) {
  const isOcrLine = (line) => {
    const cjkCount = (line.match(/[\u3400-\u9fff\u3040-\u30ff]/g) || []).length
    if (cjkCount < 4) return false
    // 仅统计空格（含全角空格）；制表符是 TSV/缩进的结构字符，不算 OCR 字距
    const gaps = (line.match(/[\u3400-\u9fff\u3040-\u30ff][ \u3000]+(?=[\u3400-\u9fff\u3040-\u30ff])/g) || []).length
    return gaps / cjkCount >= 0.25
  }
  const squeezeLine = (line) => line
    .replace(/([\u3400-\u9fff\u3040-\u30ff，。；：、])[ \u3000]+(?=[\u3400-\u9fff\u3040-\u30ff，。；：、])/g, '$1')
  return s
    .split('\n')
    .map((line) => (isOcrLine(line) ? squeezeLine(line) : line))
    .join('\n')
    .replace(/(\d)[ \t]+(?=[.\d%])/g, '$1')
    .replace(/\.[ \t]+(?=\d)/g, '.')
    .replace(/\[[ \t]+(?=[\w\]])/g, '[')
    .replace(/[ \t]+(?=\])/g, '')
}

/** 任务清单勾选标记 [x]/[ ]/[] → ☑/☐（保留状态便于 Word 中查看） */
function decorateCheckbox(s) {
  return s.replace(/^\[( |x|X)?\]\s*/, (full, mark) => ((mark || '').trim() ? '☑ ' : '☐ '))
}

/** markdown 管道表格行 */
function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line)
}

/** | a | b | → ['a','b'] */
function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

/** 表格分隔线 |---|---| */
function isTableDivider(line) {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))
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
    // Excel/TSV 粘贴：≥2 行含制表符且列数一致、单元格都较短 → 表格（首行作表头）
    if (g.length >= 2) {
      const tsvRows = g.map((l) => l.split('\t'))
      const tsvish = g.filter((l) => l.includes('\t')).length * 2 >= g.length
        && tsvRows.every((cells) => cells.length === tsvRows[0].length && cells.length >= 2)
        && tsvRows.every((cells) => cells.every((c) => [...c.trim()].length <= 15))
      if (tsvish) {
        const header = tsvRows.shift()
        units.push({ type: 'table', header, rows: tsvRows })
        proseContext = false
        listHint = false
        continue
      }
    }
    // markdown 管道表格组 → 表格单元（| a | b | 连续行，可有 |---| 分隔线）
    if (g.length >= 2 && g.every((l) => isTableRow(l))) {
      const dataRows = g.filter((l) => !isTableDivider(l)).map(splitTableRow)
      const hasDivider = g.some((l) => isTableDivider(l))
      const header = hasDivider && dataRows.length ? dataRows.shift() : []
      units.push({ type: 'table', header, rows: dataRows })
      proseContext = false
      listHint = false
      continue
    }
    // 算法伪代码：`1: xxx` 步骤行组 / `输入:` `输出:` 组 → 代码单元
    const stepCount = g.filter((l) => RE.algoStep.test(l)).length
    const allIO = g.length >= 1
      && g.length <= 3
      && g.every((l) => RE.algoIO.test(l) && !ENDING_PUNCT.test(l.trim()))
    if (g.length >= 2 && stepCount * 2 >= g.length && stepCount >= 2) {
      units.push({ type: 'code', lines: g })
      proseContext = false
      listHint = false
      continue
    }
    if (allIO) {
      units.push({ type: 'code', lines: g })
      proseContext = false
      listHint = false
      continue
    }
    const votes = g.map((l) => lineVote(l))
    const hasCjk = g.some((l) => /[\u3400-\u9fff]/.test(l))
    const refLikeCount = g.filter((l) => RE.refLike.test(l)).length
    const looksCode = g.length >= 2
      && !hasCjk
      && refLikeCount * 2 < g.length
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
    && u.level === 1 && matchNamedNumbered(u.text))
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
  let colonLead = false // 前一单元是冒号引导句（或其延续的条目行）
  for (let i = 0; i < units.length; i += 1) {
    const u = units[i]
    const next = units[i + 1]
    // 冒号引导上下文：colon-bare 开启；条目行/列表行延续；其他单元关闭
    if (i > 0) {
      const p = units[i - 1]
      if (p.type === 'bare' && /[:：]$/.test(p.text)) colonLead = true
      else if (p.type === 'bare' && isCompleteSentenceLine(p.text)) { /* 延续 */ }
      else if (p.type === 'marked' && (LIST_MARKERS.has(p.marker) || p.listish)) { /* 延续 */ }
      else colonLead = false
    }

    if (u.type === 'table') {
      blocks.push({ kind: 'table', text: '', header: u.header || [], rows: u.rows || [] })
      continue
    }

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
    if (u.type === 'formula') {
      blocks.push({ kind: 'formula', text: u.text })
      continue
    }

    if (u.type === 'bare') {
      // 逐行成段模式：每行独立段落（诗歌/逐行原文，不编号不分条）
      if (splitMode === 'lines') {
        blocks.push({ kind: 'paragraph', text: u.text, raw: u.text })
        continue
      }
      // 冒号/半角冒号收尾 = 引导句（“…包括：”/“各部门：”），不是标题
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
      // 整句行连排规模：≥3 行的平行句组才是列表，两行孤立句视为段落
      const runSize = bareSentenceRunSize(units, i)
      let kind = 'item'
      if (punct) {
        const itemishRun = (runSize >= 3 || (colonLead && runSize >= 2))
          && (prevBare?.punct || nextBare?.punct)
        if (itemishRun) kind = 'item'
        else if (next && (next.type === 'para' || next.type === 'code' || next.type === 'marked')) kind = 'paragraph'
        else if (!prevBare && !nextBare) kind = 'paragraph'
        else if (next == null) kind = 'paragraph'
        else kind = 'paragraph'
      } else if (next && next.type === 'bare' && /[:：]$/.test(next.text)) {
        // 无标点标题 + 冒号受文/引导行（公文开头形态）
        kind = 'heading'
      } else if (next && (next.type === 'para' || next.type === 'code' || next.type === 'named')) {
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
        blocks.push({ kind: 'heading', level: 1, text: u.text, bareOrigin: true, raw: u.text })
      } else {
        blocks.push({ kind, text: u.text, raw: u.text })
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
      blocks.push({ kind: 'item', text: u.text, raw: u.raw || u.text })
      continue
    }
    let level = u.level
    if (demoteDottedL1 && u.marker === 'dotted' && level === 1) level = 3

    const nextIsContent = next && (next.type === 'para' || next.type === 'code')
    const nextIsSameMarker = next && next.type === 'marked' && next.marker === u.marker && u.marker !== 'chapter'
    const prevIsSameMarker = i > 0 && units[i - 1].type === 'marked' && units[i - 1].marker === u.marker
    const cnMarker = u.marker === 'cnTop' || u.marker === 'cnParen'
    // 中文序号连续出现且各自很短 → 大纲式条目（无正文的并列小项）
    const cnShortRun = cnMarker && (nextIsSameMarker || prevIsSameMarker) && [...u.text].length <= 16
    const markerIsListType = LIST_MARKERS.has(u.marker) || u.listish || cnShortRun
    // 公文三级标题形态（"1. 首页布局"）需要上级是 一、/（一）标题（可隔着兄弟标题）
    let prevCnHeading = false
    for (let k = blocks.length - 1; k >= 0; k -= 1) {
      const pb = blocks[k]
      if (pb.kind !== 'heading') break
      if (pb.cnOrigin) {
        prevCnHeading = true
        break
      }
    }

    // 列表型标记与相邻同标记：
    //   中文序号连排短行 → 条目；"1." 式且上级为公文标题且短 → 三级标题；其余 → 条目
    if (markerIsListType && (nextIsSameMarker || prevIsSameMarker) && !nextIsContent) {
      const adj = nextIsSameMarker
        ? next
        : (prevIsSameMarker ? units[i - 1] : null)
      const shortTitleish = u.listish
        && prevCnHeading
        && /[\u3400-\u9fff]/.test(u.text)
        && [...u.text].length <= 16
        && !ENDING_PUNCT.test(u.text)
        && !!adj && [...adj.text].length <= 16 && !ENDING_PUNCT.test(adj.text)
      if (shortTitleish) {
        blocks.push({ kind: 'heading', level, text: u.text, raw: u.raw || u.text })
      } else {
        blocks.push({ kind: 'item', text: u.text, level, raw: u.raw || u.text })
      }
      continue
    }
    // 列表型标记的完整句（句末标点收尾）是条目内容：
    // 后面跟正文/代码时 nextIsContent 会否决上面的条目分支，这里兜底，
    // 否则 "（2）xxx。" 会因为跟着代码块被当成大纲标题（1.1）
    if (markerIsListType && ENDING_PUNCT.test(u.text)) {
      blocks.push({ kind: 'item', text: u.text, level, raw: u.raw || u.text })
      continue
    }
    if (/[:：]$/.test(u.text) && nextIsSameMarker && !nextIsContent) {
      // 冒号收尾的同标记引导句 → 段落，保留原行文本
      blocks.push({ kind: 'paragraph', text: u.raw })
      continue
    }
    blocks.push({ kind: 'heading', level, text: u.text, cnOrigin: cnMarker, raw: u.raw || u.text })
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
  const splitMode = ['items', 'merge', 'lines'].includes(options.splitMode)
    ? options.splitMode
    : 'auto'
  const normalized = squeezeCjkSpaces(normalizeFullWidth(decodeEntities(String(text ?? ''))))
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

  // 相邻隐式代码块合并（如算法的 输入/输出 与步骤行被空行分割）
  for (let k = blocks.length - 1; k > 0; k -= 1) {
    const cur = blocks[k]
    const prev = blocks[k - 1]
    if (cur.kind === 'code' && !cur.fenced && prev.kind === 'code' && !prev.fenced) {
      prev.code = `${prev.code}\n${cur.code}`
      blocks.splice(k, 1)
    }
  }

  // 任务清单勾选标记 → ☑/☐（会议纪要/待办列表常见形态）
  for (const b of blocks) {
    if (b.kind === 'item') {
      b.text = decorateCheckbox(b.text)
      if (b.raw) b.raw = decorateCheckbox(b.raw)
    }
  }

  // 文档题目：首个块来自无标记单行、足够长、无句末标点，且后文存在其他标题
  const first = blocks[0]
  if (first && first.kind === 'heading' && first.bareOrigin
    && [...first.text].length >= 10 && !ENDING_PUNCT.test(first.text)
    && blocks.slice(1).some((b) => b.kind === 'heading')) {
    first.kind = 'title'
  }

  // 落款：文末日期行（2026年3月15日 / March 15, 2026）及其前一短行机构 → 右对齐
  const dateRe = /^\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日$|^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}$/i
  for (let k = blocks.length - 1; k >= 0 && k >= blocks.length - 4; k -= 1) {
    const b = blocks[k]
    if ((b.kind === 'item' || b.kind === 'paragraph') && dateRe.test(b.text.trim())) {
      b.kind = 'signoff'
      const prevBlock = blocks[k - 1]
      if (prevBlock && (prevBlock.kind === 'item' || prevBlock.kind === 'paragraph')
        && [...prevBlock.text].length <= 20 && !isCompleteSentenceLine(prevBlock.text)) {
        prevBlock.kind = 'signoff'
      }
      break
    }
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
      // 不加编号 → 保留原文（含"第一条/一、/1.1"等原始标记，法律等文档依赖原编号引用）
      if (scheme === 'none' || b.unnumbered) {
        return { ...b, number: undefined, text: b.raw || b.text }
      }
      let level = Math.max(1, Math.min(b.level ?? 1, maxLevel))
      while (level > 1 && counters[level - 1] === 0) level -= 1
      counters[level] = (counters[level] || 0) + 1
      for (let i = level + 1; i < counters.length; i += 1) counters[i] = 0
      return { ...b, level, number: fmt.heading(level, counters) }
    }
    if (b.kind === 'item') {
      if (scheme === 'none') return { ...b, number: undefined, text: b.raw || b.text }
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
