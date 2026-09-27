import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  VerticalAlign
} from 'docx'
import {
  applyListingStyle,
  listingSideIndents,
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

const NIL_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto', space: 0 }

/** DOCX page sizes (twips). Web download can set real page setup; RTF paste cannot. */
const PAPER_SIZES = {
  a4: { width: 11906, height: 16838 },
  letter: { width: 12240, height: 15840 },
  b5: { width: 10319, height: 14570 },
  '16k': { width: 10473, height: 14742 },
  a5: { width: 8391, height: 11906 },
  fit: { width: 11906, height: 16838 }
}

/**
 * Map UI 页边距 / 纸张 into real Word section page setup for DOCX download.
 * (Clipboard HTML/RTF cannot change page margins of an existing document.)
 * @param {{
 *  paperId?: string,
 *  sideMarginTwips?: number | null | { left?: number | null, right?: number | null },
 *  pageContentTwips?: number | null
 * }} options
 */
export function resolveDocxPageSetup(options) {
  const id = typeof options?.paperId === 'string' ? options.paperId : 'fit'
  const size = PAPER_SIZES[id] || PAPER_SIZES.a4
  const custom = listingSideIndents(0, options?.sideMarginTwips, options?.pageContentTwips)

  let left
  let right
  if (custom.left > 0 || custom.right > 0) {
    left = custom.left || custom.right
    right = custom.right || custom.left
  } else if (Number.isFinite(options?.pageContentTwips) && options.pageContentTwips > 0) {
    const pair = Math.max(0, size.width - options.pageContentTwips)
    left = right = Math.max(720, Math.floor(pair / 2))
  } else {
    left = right = 1440
  }

  const maxPair = Math.max(0, size.width - 2400)
  if (left + right > maxPair && left + right > 0) {
    const scale = maxPair / (left + right)
    left = Math.floor(left * scale)
    right = Math.floor(right * scale)
  }

  return {
    size,
    margin: { top: 1440, bottom: 1440, left, right },
    contentWidth: Math.max(1200, size.width - left - right)
  }
}

/** @param {string} accentHex */
function frameEdge(accentHex) {
  // space:0 is required — Word "border space" opens hairline gaps at row seams.
  return { style: BorderStyle.SINGLE, size: 24, color: accentHex, space: 0 }
}

/** Thinner underline between caption rows / caption→code. */
function underEdge(accentHex) {
  return { style: BorderStyle.SINGLE, size: 12, color: accentHex, space: 0 }
}

/**
 * Table-level borders: continuous outer stroke + insideH divider.
 * Avoids per-paragraph side borders that Word draws as broken rails.
 * @param {import('./frame.js').FrameStyle} frame
 * @param {string} accentHex
 * @param {boolean} hasCaption
 */
function tableBorders(frame, accentHex, hasCaption) {
  const f = frameEdge(accentHex)
  const under = underEdge(accentHex)
  const insideH = hasCaption ? under : NIL_BORDER
  if (frame === 'box') {
    return {
      top: f,
      bottom: f,
      left: f,
      right: f,
      insideHorizontal: insideH,
      insideVertical: NIL_BORDER
    }
  }
  if (frame === 'rails') {
    return {
      top: NIL_BORDER,
      bottom: NIL_BORDER,
      left: f,
      right: f,
      insideHorizontal: insideH,
      insideVertical: NIL_BORDER
    }
  }
  return {
    top: NIL_BORDER,
    bottom: NIL_BORDER,
    left: f,
    right: NIL_BORDER,
    insideHorizontal: insideH,
    insideVertical: NIL_BORDER
  }
}

const CELL_NO_BORDERS = {
  top: NIL_BORDER,
  bottom: NIL_BORDER,
  left: NIL_BORDER,
  right: NIL_BORDER
}

// 导出给论文排版管线（paper-export.js）复用；原调用不变
export { NIL_BORDER, CELL_NO_BORDERS, tableBorders }

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
 *  paperId?: string,
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
  const pageSetup = resolveDocxPageSetup(options)
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
  const captionParas = capLines.map((text) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: capSpacing,
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
  // One paragraph per line (hard Enter). Soft breaks show as ↓ in Word.
  const codeParas = (rows.length ? rows : [[]]).map((row, i) => {
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
      spacing,
      shading,
      children: runs.length
        ? runs
        : [new TextRun({ text: ' ', font: fontName, size: fontSize, noProof: true })]
    })
  })

  const page = pageSetup
  const tableWidth = page.contentWidth

  /** @param {InstanceType<typeof Paragraph>[]} paras */
  function cell(paras, pad) {
    return new TableCell({
      borders: CELL_NO_BORDERS,
      width: { size: tableWidth, type: WidthType.DXA },
      margins: {
        top: pad.top,
        bottom: pad.bottom,
        left: pad.left,
        right: pad.right
      },
      verticalAlign: VerticalAlign.CENTER,
      children: paras
    })
  }

  /** @type {InstanceType<typeof TableRow>[]} */
  const tableRows = [
    ...captionParas.map((p) => new TableRow({
      children: [cell([p], { top: 40, bottom: 40, left: 100, right: 100 })]
    })),
    new TableRow({
      children: [cell(codeParas, { top: 60, bottom: 60, left: 40, right: 140 })]
    })
  ]

  const listingTable = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [tableWidth],
    rows: tableRows,
    borders: tableBorders(frame, accentHex, !!capLines.length)
  })

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: page.size,
          margin: page.margin
        }
      },
      children: [listingTable]
    }]
  })

  return Packer.toBlob(doc)
}
