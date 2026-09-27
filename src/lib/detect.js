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
 * @param {string} line
 * @returns {'code'|'text'|''}
 */
export function lineVote(line) {
  const trimmed = line.trim()
  if (!trimmed) return ''
  const nonspace = [...trimmed.replace(/\s/g, '')].length
  if (!nonspace) return ''
  const cjk = countCjk(trimmed)
  const symbols = countMatches(trimmed, CODE_SYMBOL_RE)

  // Strong prose signals
  if (cjk / nonspace > 0.15) return 'text'
  if (CJK_PUNCT_END_RE.test(trimmed)) return 'text'

  // English prose: mostly letters, almost no code punctuation, reasonably long
  const letters = countMatches(trimmed, /[A-Za-z]/g)
  if (letters / nonspace > 0.55 && symbols / nonspace < 0.05 && trimmed.length > 25) return 'text'

  // Strong code signals
  const indent = line.match(/^\s+/)?.[0].replace(/\t/g, '    ').length ?? 0
  if (indent >= 4 && symbols / nonspace > 0.06) return 'code'
  if (symbols / nonspace > 0.15) return 'code'
  if (CODE_START_RE.test(line)) return 'code'
  if (KEYWORD_RE.test(trimmed) && symbols > 0) return 'code'
  if (/^\s*(\/\/|#|\/\*|\*|--|;;|<!--)/.test(line)) return 'code'
  if (/[{};]\s*$/.test(trimmed)) return 'code'
  if (/^\s*(<\/?[a-zA-Z][\w-]*|<!DOCTYPE)/.test(line)) return 'code'

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
 * @returns {{ kind: 'code'|'text'|'mixed', codeVotes: number, textVotes: number, fenceCount: number }}
 */
export function detectKind(text) {
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
  const totalVotes = codeVotes + textVotes
  const codeShare = codeVotes / totalVotes
  let kind = 'text'
  if (codeShare >= 0.6) kind = 'code'
  return { kind, codeVotes, textVotes, fenceCount: 0 }
}
