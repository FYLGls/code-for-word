import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  TextRun
} from 'docx'
import {
  measureListingTwips,
  listingSideIndents,
  applyListingStyle,
  resolveCodeInsetTwips,
  codeInsetPrefix,
  codeInsetSuffix
} from './lines.js'
import { resolveFrameStyle } from './frame.js'
import {
  shouldShowCaption,
  captionDisplayLines,
  resolveCaptionFont,
  resolveCaptionBackground,
  resolveCaptionColor,
  resolveCaptionBold,
  resolveCaptionItalic
} from './caption.js'

const NIL_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' }

/** @param {string} accentHex @param {boolean} on */
function edge(accentHex, on) {
  return on
    ? { style: BorderStyle.SINGLE, size: 24, color: accentHex, space: 4 }
    : NIL_BORDER
}

/** Thinner underline between caption rows / caption→code. */
function underEdge(accentHex) {
  return { style: BorderStyle.SINGLE, size: 12, color: accentHex, space: 2 }
}

/**
 * @param {import('./frame.js').FrameStyle} frame
 * @param {string} accentHex
 * @param {boolean} hasCaption
 */
function codeParaBorders(frame, accentHex, hasCaption) {
  const bar = edge(accentHex, true)
  if (frame === 'bar') return { left: bar }
  if (frame === 'rails') return { left: bar, right: bar }
  if (frame === 'box') {
    return {
      top: hasCaption ? NIL_BORDER : bar,
      bottom: bar,
      left: bar,
      right: bar
    }
  }
  return {}
}

/**
 * @param {import('./frame.js').FrameStyle} frame
 * @param {string} accentHex
 * @param {boolean} isFirst
 */
function captionParaBorders(frame, accentHex, isFirst) {
  const bar = edge(accentHex, true)
  const under = underEdge(accentHex)
  if (frame === 'bar') return { left: bar, bottom: under }
  if (frame === 'rails') return { left: bar, right: bar, bottom: under }
  if (frame === 'box') {
    return {
      top: isFirst ? bar : NIL_BORDER,
      bottom: under,
      left: bar,
      right: bar
    }
  }
  return { bottom: under }
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
export async function linesToDocxBlob(lines, options) {
  const rows = applyListingStyle(lines, options)
  const fontName = options.fontName || 'Consolas'
  const pt = options.fontSizePt || 9
  const fontSize = Math.round(pt * 2)
  const lnColor = (options.lineNumberColor || '#7A7A7A').replace('#', '')
  const fg = options.foreground.replace('#', '')
  const noFill = !!options.noFill || options.background === 'none'
  const fill = noFill ? 'auto' : (options.background || '#F5F5F5').replace('#', '')
  const suffix = options.lineNumberSuffix ?? '.'
  const accentHex = (options.accentLeft || '#007ACC').replace('#', '')
  const frame = resolveFrameStyle(options.frameStyle)
  const block = measureListingTwips(rows, options)
  const { left, right } = listingSideIndents(block, options.sideMarginTwips, options.pageContentTwips)
  const codeInset = resolveCodeInsetTwips(options.codeInsetTwips, options.pageContentTwips, options.sideMarginTwips)
  const insetLeft = codeInsetPrefix(options, codeInset)
  const insetRight = codeInsetSuffix(options, codeInset)
  const useExact = pt < 16
  const line = Math.max(240, Math.round(pt * 20 * 1.35))
  const spacing = useExact
    ? { before: 0, after: 0, line, lineRule: LineRuleType.EXACT }
    : { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO }
  const shading = noFill ? undefined : { type: ShadingType.CLEAR, fill }

  const showCap = shouldShowCaption(options)
  const capLines = showCap ? captionDisplayLines(options) : []
  const capFont = resolveCaptionFont(options)
  const capFill = resolveCaptionBackground(options).replace('#', '')
  const capColor = resolveCaptionColor(options).replace('#', '')
  const capBold = resolveCaptionBold(options)
  const capItalic = resolveCaptionItalic(options)
  const capSize = Math.max(20, fontSize + 2)
  const capShading = { type: ShadingType.CLEAR, fill: capFill }
  const capSpacing = { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO }

  /** @param {import('../themes.js').StyledRun[]} row */
  function codeRuns(row) {
    /** @type {InstanceType<typeof TextRun>[]} */
    const runs = []
    if (insetLeft) {
      runs.push(new TextRun({
        text: insetLeft,
        font: fontName,
        size: fontSize,
        color: fg,
        noProof: true
      }))
    }
    if (!row.length) {
      runs.push(new TextRun({
        text: ' ',
        font: fontName,
        size: fontSize,
        color: fg,
        bold: !!options.forceBold,
        italics: !!options.forceItalic,
        noProof: true
      }))
    } else {
      for (const run of row) {
        runs.push(new TextRun({
          text: run.text,
          font: fontName,
          size: fontSize,
          color: (run.color || options.foreground).replace('#', ''),
          bold: !!run.bold,
          italics: !!run.italic,
          noProof: true
        }))
      }
    }
    if (insetRight) {
      runs.push(new TextRun({
        text: insetRight,
        font: fontName,
        size: fontSize,
        color: fg,
        noProof: true
      }))
    }
    return runs
  }

  /** @type {InstanceType<typeof Paragraph>[]} */
  const captionParas = capLines.map((text, i) => new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left, right },
    spacing: capSpacing,
    border: captionParaBorders(frame, accentHex, i === 0),
    shading: capShading,
    children: [
      new TextRun({
        text,
        font: capFont,
        size: capSize,
        color: capColor,
        bold: capBold,
        italics: capItalic,
        noProof: true
      })
    ]
  }))

  /** @type {InstanceType<typeof Paragraph>[]} */
  let codeChildren
  if (frame === 'box') {
    /** @type {InstanceType<typeof TextRun>[]} */
    const boxRuns = []
    rows.forEach((row, i) => {
      if (i > 0) boxRuns.push(new TextRun({ break: 1 }))
      if (options.lineNumbers) {
        boxRuns.push(new TextRun({
          text: `${i + 1}${suffix}  `,
          font: fontName,
          size: fontSize,
          color: lnColor,
          bold: !!options.forceBold,
          italics: !!options.forceItalic,
          noProof: true
        }))
      }
      boxRuns.push(...codeRuns(row))
    })
    codeChildren = [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: { left, right },
        spacing,
        border: codeParaBorders(frame, accentHex, !!capLines.length),
        shading,
        children: boxRuns.length
          ? boxRuns
          : [new TextRun({ text: ' ', font: fontName, size: fontSize, noProof: true })]
      })
    ]
  } else {
    codeChildren = rows.map((row, i) => {
      /** @type {InstanceType<typeof TextRun>[]} */
      const runs = []
      if (options.lineNumbers) {
        runs.push(new TextRun({
          text: `${i + 1}${suffix}  `,
          font: fontName,
          size: fontSize,
          color: lnColor,
          bold: !!options.forceBold,
          italics: !!options.forceItalic,
          noProof: true
        }))
      }
      runs.push(...codeRuns(row))
      return new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: { left, right },
        spacing,
        border: codeParaBorders(frame, accentHex, false),
        shading,
        children: runs
      })
    })
  }

  const children = [...captionParas, ...codeChildren]

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 }
        }
      },
      children
    }]
  })

  return Packer.toBlob(doc)
}
