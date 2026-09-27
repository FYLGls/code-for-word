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
  resolveListingGeometry,
  lineNumberGutterTwips
} from './lines.js'
import { cmToTwips } from '../themes.js'
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
  const geo = resolveListingGeometry(
    options?.sideMarginTwips,
    options?.codeInsetTwips,
    options?.pageContentTwips
  )

  let left
  let right
  if (geo.left > 0 || geo.right > 0) {
    // Explicit UI 页边距 → real Word page margins (honor 0 on one side)
    left = Math.max(0, geo.left)
    right = Math.max(0, geo.right)
  } else if (Number.isFinite(options?.pageContentTwips) && options.pageContentTwips > 0) {
    // Paper chosen, margin "默认" → derive from paper's content width
    const pair = Math.max(0, size.width - options.pageContentTwips)
    left = right = Math.max(720, Math.floor(pair / 2))
  } else {
    // 适应纸张 + 默认：2cm (preview is flush; DOCX still needs printable margins)
    left = right = cmToTwips(2)
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
    contentWidth: Math.max(1200, size.width - left - right),
    codeInset: geo.inset
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
  const codeInset = pageSetup.codeInset || 0
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
  function codeTextRuns(row) {
    /** @type {InstanceType<typeof TextRun>[]} */
    const runs = []
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

  const page = pageSetup
  const tableWidth = page.contentWidth
  const workRows = rows.length ? rows : [[]]

  // Exact code inset via cell margins (not font-dependent spaces).
  // Outer frame cell already has a small pad; keep gutter+code columns = tableWidth.
  const gutterW = options.lineNumbers
    ? Math.max(480, lineNumberGutterTwips(workRows.length, options))
    : 0
  const codeColW = options.lineNumbers
    ? Math.max(600, tableWidth - gutterW)
    : tableWidth
  const colWidths = options.lineNumbers ? [gutterW, codeColW] : [codeColW]

  /** @type {InstanceType<typeof TableRow>[]} */
  const innerCodeRows = workRows.map((row, i) => {
    /** @type {InstanceType<typeof TableCell>[]} */
    const cells = []
    if (options.lineNumbers) {
      cells.push(new TableCell({
        borders: CELL_NO_BORDERS,
        width: { size: gutterW, type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing,
            shading,
            children: [
              new TextRun({
                text: `${i + 1}${suffix}  `,
                font: fontName,
                size: fontSize,
                color: lnColor,
                bold: !!options.forceBold,
                italics: !!options.forceItalic,
                noProof: true
              })
            ]
          })
        ]
      }))
    }
    cells.push(new TableCell({
      borders: CELL_NO_BORDERS,
      width: { size: codeColW, type: WidthType.DXA },
      margins: {
        top: 0,
        bottom: 0,
        left: codeInset,
        right: codeInset
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing,
          shading,
          children: codeTextRuns(row)
        })
      ]
    }))
    return new TableRow({ children: cells })
  })

  const innerCodeTable = new Table({
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: colWidths,
    rows: innerCodeRows,
    borders: {
      top: NIL_BORDER,
      bottom: NIL_BORDER,
      left: NIL_BORDER,
      right: NIL_BORDER,
      insideHorizontal: NIL_BORDER,
      insideVertical: NIL_BORDER
    }
  })

  /** @param {(InstanceType<typeof Paragraph>|InstanceType<typeof Table>)[]} children */
  function cell(children, pad) {
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
      children
    })
  }

  // Tiny frame pad only — code↔marker gap lives on the code cell (codeInset).
  const framePad = { top: 40, bottom: 40, left: 40, right: 40 }

  /** @type {InstanceType<typeof TableRow>[]} */
  const tableRows = [
    ...captionParas.map((p) => new TableRow({
      children: [cell([p], { top: 40, bottom: 40, left: 80, right: 80 })]
    })),
    new TableRow({
      children: [cell([innerCodeTable], framePad)]
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
