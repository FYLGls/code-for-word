/** Clean Word paste HTML — NO multi-cell grid (Word turns that into dashed borders). */

import {
  applyListingStyle,
  measureListingTwips,
  listingSideIndents,
  PAGE_CONTENT_TWIPS,
  resolveCodeInsetTwips,
  codeInsetPrefix,
  codeInsetSuffix
} from './lines.js'
import { resolveFrameStyle, cssFrameBorders, cssBorderStyle } from './frame.js'
import {
  shouldShowCaption,
  captionDisplayLines,
  resolveCaptionLines,
  resolveCaptionFont,
  resolveCaptionBackground,
  resolveCaptionColor,
  resolveCaptionBold,
  resolveCaptionItalic,
  normalizeCaption
} from './caption.js'

/**
 * @param {string} text
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Keep CF_HTML builder for tests / native hosts only.
 * Never put this string into browser text/html clipboard — Word will paste the headers.
 * @param {string} fragmentHtml
 */
export function buildCfHtml(fragmentHtml) {
  const startFragMark = '<!--StartFragment-->'
  const endFragMark = '<!--EndFragment-->'
  const header =
    'Version:0.9\r\n' +
    'StartHTML:0000000000\r\n' +
    'EndHTML:0000000000\r\n' +
    'StartFragment:0000000000\r\n' +
    'EndFragment:0000000000\r\n'
  const body =
    '<!DOCTYPE html>\r\n<html>\r\n<head><meta charset="utf-8"></head>\r\n<body>\r\n' +
    startFragMark +
    fragmentHtml +
    endFragMark +
    '\r\n</body>\r\n</html>'

  const encoder = new TextEncoder()
  const headerBytes = encoder.encode(header).length
  const beforeFrag = encoder.encode(header + body.slice(0, body.indexOf(startFragMark))).length
  const beforeEndFrag = encoder.encode(header + body.slice(0, body.indexOf(endFragMark))).length
  const endHtml = encoder.encode(header + body).length
  const pad = (n) => String(n).padStart(10, '0')

  return (
    'Version:0.9\r\n' +
    `StartHTML:${pad(headerBytes)}\r\n` +
    `EndHTML:${pad(endHtml)}\r\n` +
    `StartFragment:${pad(beforeFrag)}\r\n` +
    `EndFragment:${pad(beforeEndFrag)}\r\n` +
    body
  )
}

/**
 * @param {import('../themes.js').StyledRun} run
 * @param {string} fallback
 */
function runToSpan(run, fallback) {
  const color = run.color || fallback
  const weight = run.bold ? 'font-weight:bold;' : 'font-weight:normal;'
  const italic = run.italic ? 'font-style:italic;' : ''
  return `<span style="color:${color};${weight}${italic}">${escapeHtml(run.text)}</span>`
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
 *  preview?: boolean,
 *  captionEnabled?: boolean,
 *  caption?: string,
 *  captionLines?: string[],
 *  captionPlaceholder?: string,
 *  captionFont?: string,
 *  captionBackground?: string,
 *  captionColor?: string,
 *  captionBold?: boolean,
 *  captionItalic?: boolean
 * }} options
 */
export function linesToWordHtml(lines, options) {
  const rows = applyListingStyle(lines, options)
  const fontName = options.fontName || 'Consolas'
  const fontSizePt = options.fontSizePt || 9
  const lnColor = options.lineNumberColor || '#7A7A7A'
  const suffix = options.lineNumberSuffix ?? '.'
  const accent = options.accentLeft || '#007ACC'
  const frame = resolveFrameStyle(options.frameStyle)
  const noFill = !!options.noFill || options.background === 'none'
  const bg = noFill ? 'transparent' : (options.background || '#F5F5F5')
  const lnWeight = options.forceBold ? 'font-weight:bold;' : ''
  const lnItalic = options.forceItalic ? 'font-style:italic;' : ''
  const block = measureListingTwips(rows, options)
  const { left, right } = listingSideIndents(block, options.sideMarginTwips, options.pageContentTwips)
  const codeInset = resolveCodeInsetTwips(options.codeInsetTwips, options.pageContentTwips, options.sideMarginTwips)
  const insetLeft = codeInsetPrefix(options, codeInset)
  const insetRight = codeInsetSuffix(options, codeInset)
  const preview = !!options.preview
  const borders = cssFrameBorders(frame, accent)
  const borderCss = cssBorderStyle(borders)

  const fontStack = `${fontName},'Courier New',monospace`
  const preBase =
    `margin:0;padding:0;border:none;background:transparent;` +
    `font-family:${fontStack};font-size:${fontSizePt}pt;` +
    `line-height:1.35;white-space:pre;text-align:left;mso-no-proof:yes;`

  const widthCss = preview
    ? 'width:100%;max-width:100%;'
    : 'width:max-content;max-width:none;'

  const body = rows.map((row, i) => {
    const code = row.length
      ? row.map((run) => runToSpan(run, options.foreground)).join('')
      : '&nbsp;'
    const ln = options.lineNumbers
      ? `<span style="color:${lnColor};${lnWeight}${lnItalic}">${i + 1}${suffix}&nbsp;&nbsp;</span>`
      : ''
    // Left/right pads around code only — never before the line-number gutter.
    const gapL = insetLeft ? escapeHtml(insetLeft) : ''
    const gapR = insetRight ? escapeHtml(insetRight) : ''
    return `${ln}${gapL}${code}${gapR}`
  }).join('<br>\r\n')

  let captionHtml = ''
  if (shouldShowCaption(options)) {
    const raw = resolveCaptionLines(options)
    const display = captionDisplayLines(options)
    const capFont = resolveCaptionFont(options)
    const capBg = resolveCaptionBackground(options)
    const capColor = resolveCaptionColor(options)
    const capBold = resolveCaptionBold(options)
    const capItalic = resolveCaptionItalic(options)
    const capFs = Math.max(10, fontSizePt + 1)
    const rowsHtml = display.map((text, i) => {
      const filled = !!normalizeCaption(raw[i] ?? text)
      const color = !filled && preview ? '#8a93a0' : capColor
      const phClass = !filled && preview ? ' is-placeholder' : ''
      const weight = capBold ? 'bold' : '400'
      const style = capItalic ? 'italic' : 'normal'
      return (
        `<div class="listing-caption-row${phClass}" style="` +
        `display:block;margin:0;padding:4pt 10pt;` +
        `border:none;border-bottom:1pt solid ${accent};` +
        `box-sizing:border-box;` +
        `font-family:${capFont},'SimSun','Songti SC',serif;` +
        `font-size:${capFs}pt;font-weight:${weight};font-style:${style};line-height:1.45;` +
        `color:${color};text-align:left;">` +
        `${escapeHtml(text || '\u00a0')}</div>`
      )
    }).join('')
    captionHtml =
      `<div class="listing-caption" style="` +
      `display:block;margin:0;padding:0;` +
      `background:${capBg};` +
      `border:none;` +
      `box-sizing:border-box;">` +
      `${rowsHtml}</div>`
  }

  const listing =
    `<div class="listing-block listing-inside" data-frame="${frame}" style="` +
    `display:block;box-sizing:border-box;` +
    widthCss +
    borderCss +
    `background:${bg};` +
    `padding:0;` +
    `font-family:${fontStack};` +
    `font-size:${fontSizePt}pt;` +
    `line-height:1.35;` +
    `color:${options.foreground};` +
    `text-align:left;` +
    `mso-no-proof:yes;` +
    `overflow-x:auto;` +
    `">` +
    `${captionHtml}` +
    `<div class="listing-code" style="padding:6pt 14pt 6pt 4pt;background:${bg};">` +
    `<pre style="${preBase}">${body}</pre>` +
    `</div>` +
    `</div>`

  if (preview) {
    const flush = left === 0 && right === 0
    const contentTwips = options.pageContentTwips == null
      ? PAGE_CONTENT_TWIPS
      : options.pageContentTwips
    const total = Math.max(contentTwips + left + right, 1)
    const padL = flush ? '12px' : `${((left / total) * 100).toFixed(2)}%`
    const padR = flush ? '12px' : `${((right / total) * 100).toFixed(2)}%`
    return (
      `<div class="listing-outer preview-page${flush ? ' is-flush' : ''}" style="` +
      `display:block;width:100%;box-sizing:border-box;text-align:left;` +
      `padding:12px ${padR} 12px ${padL};">` +
      `${listing}</div>`
    )
  }

  const leftPt = (left / 20).toFixed(1)
  const rightPt = (right / 20).toFixed(1)
  return (
    `<div class="listing-outer" style="display:block;margin:0 ${rightPt}pt 0 ${leftPt}pt;text-align:left;">` +
    `${listing}</div>`
  )
}

/** @deprecated use linesToWordHtml — kept for API stability */
export function linesToGenericHtml(lines, options) {
  return linesToWordHtml(lines, options)
}

/** @deprecated zebra removed for journal look */
export function rowBackground(index, options) {
  return options.background
}
