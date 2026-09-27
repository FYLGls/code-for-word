/** RTF paragraphs Word recognizes: \\b / \\cf / \\f / \\fs — not a table. */

import {
  measureListingTwips,
  listingSideIndents,
  applyListingStyle,
  resolveCodeInsetTwips,
  codeInsetPrefix,
  codeInsetSuffix
} from './lines.js'
import { resolveFrameStyle, rtfParaBorders } from './frame.js'
import {
  shouldShowCaption,
  captionDisplayLines,
  resolveCaptionFont,
  resolveCaptionBackground,
  resolveCaptionColor,
  resolveCaptionBold,
  resolveCaptionItalic
} from './caption.js'
import { FONT_OPTIONS } from '../themes.js'

export {
  estimateListingTwips,
  measureListingTwips,
  trimTrailingEmptyLines,
  applyListingStyle,
  listingSideIndent,
  listingSideIndents,
  lineNumberGutterTwips
} from './lines.js'

/**
 * @param {string} hex
 */
export function hexToRtfRgb(hex) {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return {
    red: (n >> 16) & 255,
    green: (n >> 8) & 255,
    blue: n & 255
  }
}

function toSigned16(code) {
  return code <= 0x7fff ? code : code - 0x10000
}

/** @param {string} text */
export function escapeRtf(text) {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (ch === '\\') out += '\\\\'
    else if (ch === '{') out += '\\{'
    else if (ch === '}') out += '\\}'
    else if (ch === '\t') out += '\\tab '
    else if (code === 0xa0) out += '\\~'
    else if (code <= 0x7f) out += ch
    else if (code > 0xffff) {
      const h = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const l = ((code - 0x10000) % 0x400) + 0xdc00
      out += `\\u${toSigned16(h)}?\\u${toSigned16(l)}?`
    } else {
      out += `\\u${toSigned16(code)}?`
    }
  }
  return out
}

/** @param {string[]} colors */
export function buildColorTable(colors) {
  const unique = []
  const map = new Map()
  for (const color of colors) {
    const key = color.toUpperCase()
    if (map.has(key)) continue
    map.set(key, unique.length + 1)
    unique.push(color)
  }

  const body = unique
    .map((hex) => {
      const { red, green, blue } = hexToRtfRgb(hex)
      return `\\red${red}\\green${green}\\blue${blue};`
    })
    .join('')

  return {
    table: `{\\colortbl;${body}}`,
    indexOf(hex) {
      return map.get(hex.toUpperCase()) || 1
    }
  }
}

function resolveFont(fontName) {
  const hit = FONT_OPTIONS.find((f) => f.id === fontName)
  return {
    name: hit?.id || fontName || 'Consolas',
    charset: hit?.rtfCharset ?? 0
  }
}

/**
 * Caption row borders: underline every row; box also gets top on first row.
 * @param {import('./frame.js').FrameStyle} frame
 * @param {number} ac
 * @param {boolean} isFirst
 */
function captionBorders(frame, ac, isFirst) {
  const s = `\\brdrs\\brdrw40\\brdrcf${ac}`
  const under = `\\brdrb\\brdrs\\brdrw20\\brdrcf${ac}`
  if (frame === 'box') {
    const top = isFirst ? `\\brdrt${s}` : ''
    return `${top}\\brdrl${s}\\brdrr${s}${under}`
  }
  if (frame === 'rails') return `\\brdrl${s}\\brdrr${s}${under}`
  return `\\brdrl${s}${under}`
}

/**
 * @param {import('../themes.js').StyledRun[][]} lines
 * @param {{
 *  background: string,
 *  foreground: string,
 *  fontName?: string,
 *  fontSizePt?: number,
 *  lineNumbers?: boolean,
 *  lineNumberColor?: string,
 *  lineNumberSuffix?: string,
 *  accentLeft?: string,
 *  frameStyle?: import('./frame.js').FrameStyle,
 *  forceBold?: boolean,
 *  forceItalic?: boolean,
 *  sideMarginTwips?: number | null | { left?: number | null, right?: number | null },
 *  pageContentTwips?: number | null,
 *  codeInsetTwips?: number | null,
 *  noFill?: boolean,
 *  captionEnabled?: boolean,
 *  caption?: string,
 *  captionLines?: string[],
 *  captionFont?: string,
 *  captionBackground?: string,
 *  captionColor?: string,
 *  captionBold?: boolean,
 *  captionItalic?: boolean
 * }} options
 */
export function linesToRtf(lines, options) {
  const rows = applyListingStyle(lines, options)
  const font = resolveFont(options.fontName || 'Consolas')
  const capFont = resolveFont(resolveCaptionFont(options))
  const pt = options.fontSizePt || 10
  const fontSizeHalfPoints = Math.round(pt * 2)
  const capFs = Math.max(20, fontSizeHalfPoints + 2)
  const lineNumberColor = options.lineNumberColor || '#7A7A7A'
  const suffix = options.lineNumberSuffix ?? '.'
  const accent = options.accentLeft || '#007ACC'
  const frame = resolveFrameStyle(options.frameStyle)
  const noFill = !!options.noFill || options.background === 'none'
  const fillHex = noFill ? '#FFFFFF' : (options.background || '#F5F5F5')
  const capBgHex = resolveCaptionBackground(options)
  const capColorHex = resolveCaptionColor(options)
  const capBold = resolveCaptionBold(options)
  const capItalic = resolveCaptionItalic(options)
  const block = measureListingTwips(rows, options)
  const { left, right } = listingSideIndents(block, options.sideMarginTwips, options.pageContentTwips)
  const codeInset = resolveCodeInsetTwips(options.codeInsetTwips, options.pageContentTwips, options.sideMarginTwips)
  const insetLeft = codeInsetPrefix(options, codeInset)
  const insetRight = codeInsetSuffix(options, codeInset)
  const linePart = pt >= 16
    ? '\\sl276\\slmult1 '
    : `\\sl${Math.max(240, Math.round(pt * 20 * 1.35))}\\slmult0 `

  const showCap = shouldShowCaption(options)
  const capLines = showCap ? captionDisplayLines(options) : []

  /** @type {string[]} */
  const colors = [options.foreground || '#000000', fillHex, lineNumberColor, accent, capBgHex, capColorHex]
  for (const row of rows) {
    for (const run of row) colors.push(run.color || options.foreground)
  }
  const { table, indexOf } = buildColorTable(colors)
  const fg = indexOf(options.foreground || '#000000')
  const ln = indexOf(lineNumberColor)
  const bg = indexOf(fillHex)
  const ac = indexOf(accent)
  const capBg = indexOf(capBgHex)
  const capCf = indexOf(capColorHex)

  const shade = noFill ? '' : `\\cbpat${bg}`
  const capShade = `\\cbpat${capBg}`
  const lnBold = options.forceBold ? '\\b' : '\\b0'
  const lnItalic = options.forceItalic ? '\\i' : '\\i0'
  const capB = capBold ? '\\b' : '\\b0'
  const capI = capItalic ? '\\i' : '\\i0'

  /** @param {import('../themes.js').StyledRun[]} row */
  function codeRuns(row) {
    if (!row.length) return `{\\noproof\\f0\\cf${fg}\\~}`
    let out = ''
    for (const run of row) {
      const cf = indexOf(run.color || options.foreground)
      const bold = run.bold ? '\\b' : '\\b0'
      const italic = run.italic ? '\\i' : '\\i0'
      out += `{\\noproof\\f0\\cf${cf}${bold}${italic} ${escapeRtf(run.text)}}`
    }
    return out
  }

  /** @param {import('../themes.js').StyledRun[]} row @param {number} i */
  function lineContent(row, i) {
    let content = ''
    // Line numbers stay flush to the left marker; pads sit around the code only.
    if (options.lineNumbers) {
      content += `{\\noproof\\f0\\cf${ln}${lnBold}${lnItalic} ${escapeRtf(`${i + 1}${suffix}  `)}}`
    }
    if (insetLeft) {
      content += `{\\noproof\\f0\\cf${fg}\\b0\\i0 ${escapeRtf(insetLeft)}}`
    }
    content += codeRuns(row)
    if (insetRight) {
      content += `{\\noproof\\f0\\cf${fg}\\b0\\i0 ${escapeRtf(insetRight)}}`
    }
    return content
  }

  let captionPart = ''
  if (capLines.length) {
    captionPart = capLines.map((text, i) => {
      const borders = captionBorders(frame, ac, i === 0)
      return (
        `\\pard\\plain\\ql\\f1\\fs${capFs}\\cf${capCf}${capB}${capI}${capShade}${borders}` +
        `\\hyphpar0\\nowidctlpar` +
        `\\li${left}\\ri${right}\\sa0\\sb0 ` +
        `${escapeRtf(text)}\\par\n`
      )
    }).join('')
  }

  let body = rows.map((row, i) => {
    const borders = rtfParaBorders(frame, ac, i, rows.length, !!capLines.length)
    const content =
      `\\pard\\plain\\ql\\f0\\fs${fontSizeHalfPoints}` +
      `${shade}\\cf${fg}` +
      borders +
      `\\hyphpar0\\nowidctlpar\\noproof` +
      `\\li${left}\\ri${right}\\sa0\\sb0${linePart}` +
      lineContent(row, i)
    return `${content}\\par`
  }).join('\n')

  return [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\uc1',
    `{\\fonttbl{\\f0\\fnil\\fcharset${font.charset} ${font.name};}{\\f1\\fnil\\fcharset${capFont.charset} ${capFont.name};}}`,
    table,
    '{\\*\\generator CodePaste;}',
    captionPart + body,
    '}'
  ].join('\n')
}
