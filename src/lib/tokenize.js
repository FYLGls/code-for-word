/**
 * Convert highlight.js HTML into styled runs using an explicit theme map.
 * This avoids getComputedStyle so Word/RTF/DOCX colors stay deterministic.
 */

import { getTheme } from '../themes.js'
import { trimTrailingEmptyLines } from './lines.js'

/**
 * @param {string} className
 * @param {import('../themes.js').Theme} theme
 */
function colorFromClass(className, theme) {
  if (!className) return theme.foreground
  const parts = className
    .split(/\s+/)
    .filter((c) => c.startsWith('hljs-'))
    .map((c) => c.slice(5))

  const normalized = parts.map((part) => part.replace(/_+$/, '').replace(/_/g, '.'))

  // highlight.js often emits: class="hljs-title function_"
  if (normalized.includes('title') && normalized.some((p) => p.startsWith('function'))) {
    if (theme.classes['title.function']) return theme.classes['title.function']
  }
  if (normalized.includes('meta') && normalized.includes('keyword')) {
    if (theme.classes['meta.keyword']) return theme.classes['meta.keyword']
  }

  for (const part of normalized) {
    if (theme.classes[part]) return theme.classes[part]
  }
  for (const part of normalized) {
    const head = part.split('.')[0]
    if (theme.classes[head]) return theme.classes[head]
  }
  return theme.foreground
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * @param {string} html
 * @param {import('../themes.js').Theme} theme
 * @returns {import('../themes.js').StyledRun[][]}
 */
export function htmlToStyledLines(html, theme) {
  /** @type {import('../themes.js').StyledRun[][]} */
  const lines = [[]]
  const stack = [{ color: theme.foreground, bold: false, italic: false }]

  const tokenRe = /([^<]+)|<span\s+class="([^"]*)">|<\/span>|<br\s*\/?>/gi
  let match
  while ((match = tokenRe.exec(html))) {
    if (match[1]) {
      const text = decodeEntities(match[1])
      const chunks = text.split('\n')
      for (let i = 0; i < chunks.length; i += 1) {
        if (i > 0) lines.push([])
        if (!chunks[i]) continue
        const style = stack[stack.length - 1]
        const row = lines[lines.length - 1]
        const last = row[row.length - 1]
        if (last && last.color === style.color && !!last.bold === !!style.bold && !!last.italic === !!style.italic) {
          last.text += chunks[i]
        } else {
          row.push({ text: chunks[i], color: style.color, bold: style.bold, italic: style.italic })
        }
      }
      continue
    }
    if (match[2] != null) {
      const parent = stack[stack.length - 1]
      stack.push({
        color: colorFromClass(match[2], theme),
        bold: parent.bold || /\bhljs-strong\b/.test(match[2]),
        italic: parent.italic || /\bhljs-emphasis\b/.test(match[2])
      })
      continue
    }
    // closing span or br
    if (/^<br/i.test(match[0])) {
      lines.push([])
      continue
    }
    if (stack.length > 1) stack.pop()
  }

  // Ensure empty source still yields one empty line
  if (lines.length === 0) return [[]]
  return lines
}

/**
 * @param {string} code
 * @param {string} language
 * @param {string} themeId
 * @param {{ highlight: (code: string, opts: { language: string, ignoreIllegals?: boolean }) => { value: string, language?: string }, highlightAuto: (code: string) => { value: string, language?: string } }} hljs
 */
export function codeToStyledLines(code, language, themeId, hljs) {
  const theme = getTheme(themeId)
  if (!code) return { lines: [[]], language: 'plaintext', theme }

  // Drop trailing newlines so paste does not grow an empty final paragraph
  const source = code.replace(/\n+$/, '')
  if (!source) return { lines: [[]], language: 'plaintext', theme }

  let value
  let lang = language
  if (!language || language === 'auto') {
    const result = hljs.highlightAuto(source)
    value = result.value
    lang = result.language || 'plaintext'
  } else {
    try {
      value = hljs.highlight(source, { language, ignoreIllegals: true }).value
      lang = language
    } catch {
      const result = hljs.highlightAuto(source)
      value = result.value
      lang = result.language || 'plaintext'
    }
  }

  return { lines: trimTrailingEmptyLines(htmlToStyledLines(value, theme)), language: lang, theme }
}
