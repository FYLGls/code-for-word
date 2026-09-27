/**
 * Paste-content kind detection: code / text / mixed.
 * Pure heuristics only (no highlight.js) so the result is deterministic and testable.
 * Key signals: fenced ``` blocks, CJK ratio, code-symbol density, indentation,
 * statement keywords, sentence-final punctuation.
 */

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/
const CJK_PUNCT_END_RE = /[。．！？；，、：”』」）》]/
const CODE_SYMBOL_RE = /[{}()[\];=<>+\-*/%!&|^~?:\\@#$`'"_]/g
const KEYWORD_RE =
  /\b(def|class|return|import|from|as|function|const|let|var|public|private|static|void|new|async|await|try|catch|throw|if|else|elif|for|while|switch|case|break|continue|print|package|using|namespace|struct|enum|interface|impl|fn|func|select|insert|update|delete|where|elif|end|do|then|echo|export|require|module|type|yield|pass|self|this|null|nil|true|false|None|True|False)\b/
const FENCE_RE = /^\s{0,3}(```|~~~)\s*(\S*)\s*$/
// Case-sensitive line-start keywords: prose sentences capitalize ("From …"), code does not.
const CODE_START_RE =
  /^\s*(import|from|def|class|function|const|let|var|return|print|package|using|namespace|public|private|protected|static|final|export|require|module|select|insert|update|delete|echo|fn|func|async|type|struct|enum|interface|end|elif|pass|throw|new)\b/

/** @param {string} text */
function countCjk(text) {
  let n = 0
  for (const ch of text) {
    if (CJK_RE.test(ch)) n += 1
  }
  return n
}

/** @param {string} text */
function countMatches(text, re) {
  const m = text.match(re)
  return m ? m.length : 0
}

/**
 * One line's vote: 'code' | 'text' | '' (abstain).
 * 代码结构信号（括号/引号/关键字/注释头等）优先于中文占比——
 * 否则带中文注释或中文字符串的代码会被误判为文本。
 * @param {string} line
 * @returns {'code'|'text'|''}
 */
export function lineVote(line) {
  const trimmed = line.trim()
  if (!trimmed) return ''
  const nonspace = [...trimmed.replace(/\s/g, '')].length
  if (!nonspace) return ''

  // 参考文献条目（[1] 作者. 标题…）与 markdown 表格行不参与代码/文本投票
  if (/^\s*\[\d{1,3}\]\s/.test(line)) return 'text'
  if (/^\s*\|.*\|\s*$/.test(line)) return ''
  // markdown 标题行是文本（# 会被当成脚本注释投代码票）
  if (/^\s{0,3}#{1,6}\s+\S/.test(line)) return 'text'
  // markdown 链接 [文字](url) 属于网页复制文本，不因方括号投代码票
  if (/\[[^\]\n]*\]\([^)\n]+\)/.test(trimmed)) return 'text'

  const cjk = countCjk(trimmed)
  const symbols = countMatches(trimmed, CODE_SYMBOL_RE)
  const symbolRatio = symbols / nonspace
  const cjkRatio = cjk / nonspace
  const letters = countMatches(trimmed, /[A-Za-z]/g)
  const indent = line.match(/^\s+/)?.[0].replace(/\t/g, '    ').length ?? 0

  // 代码结构信号
  const hasBrackets = /[[\]{}()]/.test(trimmed)
  const hasQuote = /["'`]/.test(trimmed)
  const endsCodey = /[{};)\]]\s*$/.test(trimmed)
  const keywordish = CODE_START_RE.test(line) || (KEYWORD_RE.test(trimmed) && symbols > 0)
  const commentish = /^\s*(\/\/|#|\/\*|\*|--|;;|<!--)/.test(line)
  const tagish = /^\s*(<\/?[a-zA-Z][\w-]*|<!DOCTYPE)/.test(line)
  // 纯符号密度型代码信号（无括号/引号/关键字）对中文行不生效——
  // 否则 markdown 表格行/实体残留行会被误判为代码
  const symbolOnlyCode = (symbolRatio >= 0.15 || (indent >= 4 && symbolRatio >= 0.06)) && cjkRatio <= 0.15
  const structuralCode = hasBrackets || endsCodey || keywordish || commentish || tagish || symbolOnlyCode
  // 引号+符号密度也能说明代码，但中文占主导的普通引述句除外
  const quotedCode = hasQuote && symbolRatio >= 0.10 && cjkRatio <= 0.4

  if (structuralCode || quotedCode) return 'code'

  // 散文信号
  if (cjkRatio > 0.15) return 'text'
  if (CJK_PUNCT_END_RE.test(trimmed)) return 'text'
  if (letters / nonspace > 0.55 && symbolRatio < 0.05 && trimmed.length > 25) return 'text'

  if (symbolRatio >= 0.08) return 'code'
  return ''
}

/**
 * @typedef {object} FenceRegion
 * @property {number} start line index (inclusive, fence line)
 * @property {number} end line index (exclusive, line after closing fence or EOF)
 * @property {string} language info string after ``` (may be '')
 * @property {boolean} closed whether an explicit closing fence was found
 */

/**
 * Locate ``` / ~~~ fenced regions.
 * @param {string[]} lines
 * @returns {FenceRegion[]}
 */
export function findFences(lines) {
  /** @type {FenceRegion[]} */
  const fences = []
  let i = 0
  while (i < lines.length) {
    const open = lines[i].match(FENCE_RE)
    if (open) {
      let j = i + 1
      let closed = false
      while (j < lines.length) {
        if (FENCE_RE.test(lines[j])) {
          closed = true
          j += 1
          break
        }
        j += 1
      }
      fences.push({ start: i, end: j, language: open[2] || '', closed })
      i = j
    } else {
      i += 1
    }
  }
  return fences
}

/**
 * @param {string} text
 * @param {{ autoDetect?: (code: string) => { language?: string, relevance?: number } | null }} [signal]
 *   可选 highlight.js 自动检测信号：结构识别不受中文注释/字符串干扰，
 *   相关度足够高时作为"代码"的加权依据。
 * @returns {{ kind: 'code'|'text'|'mixed', codeVotes: number, textVotes: number, fenceCount: number }}
 */
export function detectKind(text, signal) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const fences = findFences(lines)

  let codeVotes = 0
  let textVotes = 0
  lines.forEach((line) => {
    const v = lineVote(line)
    if (v === 'code') codeVotes += 1
    else if (v === 'text') textVotes += 1
  })

  if (fences.length) {
    const total = lines.length
    const inFence = fences.reduce((n, f) => n + (f.end - f.start), 0)
    const outside = total - inFence
    const outsideText = lines
      .filter((_, i) => !fences.some((f) => i >= f.start && i < f.end))
      .filter((l) => l.trim()).length
    if (outsideText === 0 || outside <= 1) return { kind: 'code', codeVotes, textVotes, fenceCount: fences.length }
    return { kind: 'mixed', codeVotes, textVotes, fenceCount: fences.length }
  }

  if (codeVotes + textVotes === 0) {
    return { kind: 'text', codeVotes, textVotes, fenceCount: 0 }
  }
  let kind = 'text'
  const codeShare = codeVotes / (codeVotes + textVotes)
  if (codeShare >= 0.6) kind = 'code'

  // hljs 结构信号兜底：短片段或中文注释/字符串密集的代码投票接近时，交给语法识别。
  // 门槛要高——hljs 对 markdown/散文也会给出低相关度的语言猜测（如 csharp relevance 8）
  if (kind !== 'code' && signal?.autoDetect) {
    try {
      const r = signal.autoDetect(normalized)
      if (r && r.language && r.language !== 'plaintext' && (r.relevance ?? 0) >= 15 && codeShare >= 0.5) {
        kind = 'code'
      }
    } catch {
      /* ignore */
    }
  }
  return { kind, codeVotes, textVotes, fenceCount: 0 }
}
