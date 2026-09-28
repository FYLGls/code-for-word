/**
 * Shared line prep for RTF / DOCX / preview.
 * @param {import('../themes.js').StyledRun[][]} lines
 */
export function trimTrailingEmptyLines(lines) {
  const out = lines.slice()
  while (out.length > 1) {
    const last = out[out.length - 1]
    const empty = !last.length || last.every((run) => !run.text)
    if (!empty) break
    out.pop()
  }
  return out.length ? out : [[]]
}

/**
 * @param {import('../themes.js').StyledRun[][]} lines
 * @param {{ forceBold?: boolean, forceItalic?: boolean }} options
 */
export function applyListingStyle(lines, options) {
  const rows = trimTrailingEmptyLines(lines)
  const forceBold = !!options.forceBold
  const forceItalic = !!options.forceItalic
  if (!forceBold && !forceItalic) return rows
  return rows.map((row) =>
    row.map((run) => ({
      text: run.text,
      color: run.color,
      bold: forceBold || !!run.bold,
      italic: forceItalic || !!run.italic
    }))
  )
}

/** @param {string} text */
export function visualWidth(text) {
  let w = 0
  for (const ch of text) {
    w += ch.codePointAt(0) > 0xff ? 2 : 1
  }
  return w
}

/** Default A4-ish content width (legacy / tests). Prefer options.pageContentTwips. */
export const PAGE_CONTENT_TWIPS = 9000

/** Worst-case content width when paper is unknown (≈ A5) — used only to clamp fixed margins. */
export const SAFE_FIT_PAGE_TWIPS = 6950

/** Keep at least this much width for code so side margins never crush lines. */
const MIN_CONTENT_TWIPS = 2400

/** @deprecated kept for callers; 默认边距 is now 0 */
export const FIT_SIDE_PAD_TWIPS = 0

/**
 * Resolve page content width used for clamping (twips).
 * @param {number | null | undefined} pageContentTwips
 */
export function resolvePageBudgetTwips(pageContentTwips) {
  if (pageContentTwips === null) return SAFE_FIT_PAGE_TWIPS
  if (Number.isFinite(pageContentTwips) && pageContentTwips > 0) return pageContentTwips
  return PAGE_CONTENT_TWIPS
}

/**
 * Side margins + code inset that always fit the page budget.
 * Priority: keep MIN_CONTENT_TWIPS, then honor inset, then side margins.
 * @param {{ left?: number | null, right?: number | null } | number | null | undefined} sideMarginTwips
 * @param {number | null | undefined} codeInsetTwips
 * @param {number | null | undefined} pageContentTwips
 * @returns {{ left: number, right: number, inset: number, page: number }}
 */
export function resolveListingGeometry(sideMarginTwips, codeInsetTwips, pageContentTwips) {
  const page = resolvePageBudgetTwips(pageContentTwips)
  let { left, right } = listingSideIndents(0, sideMarginTwips, pageContentTwips)
  let inset = (codeInsetTwips != null && Number.isFinite(codeInsetTwips) && codeInsetTwips > 0)
    ? Math.round(codeInsetTwips)
    : 0

  const room = () => page - left - right - inset * 2
  if (room() >= MIN_CONTENT_TWIPS) {
    return { left, right, inset, page }
  }

  // Shrink inset first (keep at least ~30% of request when possible), then margins.
  const maxInsetPair = Math.max(0, page - MIN_CONTENT_TWIPS - left - right)
  inset = Math.min(inset, Math.floor(maxInsetPair / 2))
  if (room() >= MIN_CONTENT_TWIPS) {
    return { left, right, inset, page }
  }

  const maxSidePair = Math.max(0, page - MIN_CONTENT_TWIPS - inset * 2)
  if (left + right > maxSidePair && left + right > 0) {
    const scale = maxSidePair / (left + right)
    left = Math.floor(left * scale)
    right = Math.floor(right * scale)
  }
  // Final clamp on inset if still tight
  const maxInsetPair2 = Math.max(0, page - MIN_CONTENT_TWIPS - left - right)
  inset = Math.min(inset, Math.floor(maxInsetPair2 / 2))
  return { left, right, inset, page }
}

/**
 * Per-side code↔marker pad in twips (symmetric left/right).
 * null/undefined/≤0 → 0; clamped so L+R pads + side margins still leave MIN_CONTENT_TWIPS.
 * @param {number | null | undefined} userTwips
 * @param {number | null | undefined} pageContentTwips
 * @param {{ left?: number | null, right?: number | null } | number | null | undefined} sideMarginTwips
 */
export function resolveCodeInsetTwips(userTwips, pageContentTwips, sideMarginTwips) {
  return resolveListingGeometry(sideMarginTwips, userTwips, pageContentTwips).inset
}

/**
 * How many monospace spaces approximate `insetTwips` at `fontSizePt`.
 * @param {number} insetTwips
 * @param {number} [fontSizePt]
 */
export function codeInsetSpaceCount(insetTwips, fontSizePt = 10) {
  if (!insetTwips || insetTwips <= 0) return 0
  // Consolas/Courier half-em ≈ 0.5em; pt*10 twips is closer than pt*12 for Word.
  const charTwips = Math.max(60, Math.round((fontSizePt || 10) * 10))
  return Math.max(1, Math.round(insetTwips / charTwips))
}

/**
 * Left pad string between frame marker / gutter and code.
 * @param {{ fontSizePt?: number }} options
 * @param {number} insetTwips
 */
export function codeInsetPrefix(options, insetTwips) {
  const n = codeInsetSpaceCount(insetTwips, options?.fontSizePt)
  return n ? ' '.repeat(n) : ''
}

/**
 * Right pad string (same width as prefix — bilateral inset).
 * @param {{ fontSizePt?: number }} options
 * @param {number} insetTwips
 */
export function codeInsetSuffix(options, insetTwips) {
  return codeInsetPrefix(options, insetTwips)
}

/**
 * Width reserved for "1.  "… line-number gutter.
 * @param {number} lineCount
 * @param {{ fontSizePt?: number, lineNumberSuffix?: string }} options
 */
export function lineNumberGutterTwips(lineCount, options) {
  const suffix = options.lineNumberSuffix ?? '.'
  const pt = options.fontSizePt || 10
  const digits = String(Math.max(1, lineCount)).length
  const sample = `${'9'.repeat(digits)}${suffix}  `
  return Math.max(240, visualWidth(sample) * Math.ceil(pt * 12))
}

/**
 * @param {import('../themes.js').StyledRun[][]} lines
 * @param {{ fontSizePt?: number, lineNumbers?: boolean, lineNumberSuffix?: string, fontName?: string }} options
 */
export function estimateListingTwips(lines, options) {
  const suffix = options.lineNumberSuffix ?? '.'
  const pt = options.fontSizePt || 10
  // Left + right code↔marker pads (symmetric).
  const insetSpaces = codeInsetSpaceCount(
    resolveCodeInsetTwips(options.codeInsetTwips, options.pageContentTwips, options.sideMarginTwips),
    pt
  ) * 2
  let max = 1
  lines.forEach((row, i) => {
    let w = insetSpaces
    if (options.lineNumbers) w += visualWidth(`${i + 1}${suffix}  `)
    for (const run of row) w += visualWidth(run.text)
    if (w > max) max = w
  })
  const charTwips = Math.ceil(pt * 12)
  const pad = 360 + Math.round(pt * 16)
  return Math.max(1200, max * charTwips + pad)
}

/**
 * @param {import('../themes.js').StyledRun[][]} lines
 * @param {{ fontSizePt?: number, lineNumbers?: boolean, lineNumberSuffix?: string, fontName?: string }} options
 */
export function measureListingTwips(lines, options) {
  const suffix = options.lineNumberSuffix ?? '.'
  const pt = options.fontSizePt || 10
  const fontName = options.fontName || 'Consolas'
  const insetPad = codeInsetPrefix(options, resolveCodeInsetTwips(
    options.codeInsetTwips,
    options.pageContentTwips,
    options.sideMarginTwips
  ))

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.font = `${pt}pt "${fontName}", "Courier New", monospace`
        let maxPx = 0
        lines.forEach((row, i) => {
          let text = ''
          if (options.lineNumbers) text += `${i + 1}${suffix}  `
          text += insetPad
          for (const run of row) text += run.text
          text += insetPad
          maxPx = Math.max(maxPx, ctx.measureText(text || ' ').width)
        })
        return Math.max(1200, Math.ceil(maxPx * 15) + 360 + Math.round(pt * 20))
      }
    } catch {
      /* fall through */
    }
  }
  return estimateListingTwips(lines, options)
}

/**
 * Resolve left/right paragraph indents (Word \\li / \\ri), in twips.
 * null/undefined user = 默认 — no side indent (full content width).
 * Custom thesis margins are honored as-is (only scaled if L+R alone exceed the page).
 * @param {number} blockTwips
 * @param {{ left?: number | null, right?: number | null } | number | null | undefined} user
 *   null/undefined = default (0); number = symmetric custom; object = Word-style L/R
 * @param {number | null | undefined} pageContentTwips
 *   null = 适应纸张; undefined = legacy A4 default
 * @returns {{ left: number, right: number }}
 */
export function listingSideIndents(blockTwips, user, pageContentTwips) {
  const fit = pageContentTwips === null
  const page = fit
    ? SAFE_FIT_PAGE_TWIPS
    : (Number.isFinite(pageContentTwips) && pageContentTwips > 0
      ? pageContentTwips
      : PAGE_CONTENT_TWIPS)

  let left = null
  let right = null
  if (typeof user === 'number' && Number.isFinite(user)) {
    left = right = user
  } else if (user && typeof user === 'object') {
    if (user.left != null && Number.isFinite(user.left)) left = user.left
    if (user.right != null && Number.isFinite(user.right)) right = user.right
  }

  const custom = left != null || right != null
  if (!custom) {
    // 默认：无额外左右边距（预览/粘贴都贴内容区边缘）
    return { left: 0, right: 0 }
  }

  // Thesis / Word presets must stick — do not shrink because a long code line
  // measured wider than the page (that used to collapse 2cm → ~1mm).
  let L = Math.max(0, Math.round(left ?? 0))
  let R = Math.max(0, Math.round(right ?? 0))
  const maxPair = Math.max(0, page - MIN_CONTENT_TWIPS)
  if (L + R > maxPair && L + R > 0) {
    const scale = maxPair / (L + R)
    L = Math.floor(L * scale)
    R = Math.floor(R * scale)
  }
  return { left: L, right: R }
}

/**
 * Symmetric helper (tests / legacy).
 * @param {number} blockTwips
 * @param {number | null | undefined} userSideTwips
 * @param {number | null | undefined} pageContentTwips
 */
export function listingSideIndent(blockTwips, userSideTwips, pageContentTwips) {
  return listingSideIndents(blockTwips, userSideTwips, pageContentTwips).left
}