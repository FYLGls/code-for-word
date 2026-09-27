/**
 * Optional in-box listing caption rows (代码框说明).
 * Rows sit inside the frame, above code, and never receive line numbers.
 */

export const CAPTION_MIN_ROWS = 1
export const CAPTION_MAX_ROWS = 6
export const DEFAULT_CAPTION_FONT = '宋体'
/** Light grey fill matching thesis-style code-box headers. */
export const DEFAULT_CAPTION_BG = '#D9D9D9'
export const DEFAULT_CAPTION_COLOR = '#000000'

/** Caption paper fills (independent from code background). */
export const CAPTION_BACKGROUND_OPTIONS = [
  { id: 'grey', labelKey: 'captionBgGrey', color: '#D9D9D9' },
  { id: 'mist', labelKey: 'captionBgMist', color: '#EEF1F4' },
  { id: 'soft', labelKey: 'captionBgSoft', color: '#E8F0F6' },
  { id: 'white', labelKey: 'captionBgWhite', color: '#FFFFFF' },
  { id: 'ivory', labelKey: 'captionBgIvory', color: '#FAF8F4' }
]

/** Caption text colors. */
export const CAPTION_COLOR_OPTIONS = [
  { id: 'black', labelKey: 'captionColorBlack', color: '#000000' },
  { id: 'gray', labelKey: 'captionColorGray', color: '#5A6573' },
  { id: 'blue', labelKey: 'captionColorBlue', color: '#007ACC' },
  { id: 'teal', labelKey: 'captionColorTeal', color: '#0B6E99' },
  { id: 'green', labelKey: 'captionColorGreen', color: '#2E7D32' },
  { id: 'orange', labelKey: 'captionColorOrange', color: '#C45911' },
  { id: 'red', labelKey: 'captionColorRed', color: '#C00000' },
  { id: 'purple', labelKey: 'captionColorPurple', color: '#5B2C6F' }
]

/**
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeCaption(text) {
  if (typeof text !== 'string') return ''
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

/**
 * Normalize a caption row list. Keeps empty slots (UI row count).
 * Accepts legacy `caption` string via options in {@link resolveCaptionLines}.
 * @param {unknown} lines
 * @returns {string[]}
 */
export function normalizeCaptionLines(lines) {
  if (!Array.isArray(lines)) return ['']
  const out = lines.map((line) => (typeof line === 'string' ? line.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : ''))
  if (!out.length) return ['']
  return out.slice(0, CAPTION_MAX_ROWS)
}

/**
 * Clamp row count for add/remove UI.
 * @param {number} n
 */
export function clampCaptionRowCount(n) {
  const v = Math.floor(Number(n) || CAPTION_MIN_ROWS)
  return Math.min(CAPTION_MAX_ROWS, Math.max(CAPTION_MIN_ROWS, v))
}

/**
 * Resolve caption lines from options (supports legacy single `caption`).
 * @param {{ captionEnabled?: boolean, caption?: string, captionLines?: string[] }} options
 * @returns {string[]}
 */
export function resolveCaptionLines(options) {
  if (Array.isArray(options?.captionLines)) return normalizeCaptionLines(options.captionLines)
  if (typeof options?.caption === 'string') return normalizeCaptionLines([options.caption])
  return ['']
}

/**
 * Whether the listing should emit a caption block.
 * @param {{ captionEnabled?: boolean, caption?: string, captionLines?: string[], preview?: boolean }} options
 */
export function shouldShowCaption(options) {
  if (!options?.captionEnabled) return false
  if (options.preview) return true
  return resolveCaptionLines(options).some((line) => !!normalizeCaption(line))
}

/**
 * Lines to render. Preview keeps all UI rows (placeholder for empties);
 * export drops trailing empties but keeps internal structure of filled rows only.
 * @param {{
 *  caption?: string,
 *  captionLines?: string[],
 *  captionPlaceholder?: string,
 *  preview?: boolean
 * }} options
 * @returns {string[]}
 */
export function captionDisplayLines(options) {
  const lines = resolveCaptionLines(options)
  if (options.preview) {
    const ph = options.captionPlaceholder || ''
    return lines.map((line, i) => {
      const t = line.trim()
      if (t) return t
      return i === 0 ? ph : ph
    })
  }
  return lines.map((line) => normalizeCaption(line)).filter(Boolean)
}

/**
 * @deprecated use captionDisplayLines — single-line helper for older call sites
 * @param {{ caption?: string, captionLines?: string[], captionPlaceholder?: string, preview?: boolean }} options
 */
export function captionDisplayText(options) {
  return captionDisplayLines(options).join('\n')
}

/**
 * @param {{ captionFont?: string }} options
 */
export function resolveCaptionFont(options) {
  const name = typeof options?.captionFont === 'string' ? options.captionFont.trim() : ''
  return name || DEFAULT_CAPTION_FONT
}

/**
 * @param {string} hex
 */
function expandHex(hex) {
  const h = hex.trim()
  if (/^#([0-9a-fA-F]{3})$/.test(h)) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`.toUpperCase()
  }
  if (/^#([0-9a-fA-F]{6})$/.test(h)) return h.toUpperCase()
  return ''
}

/**
 * @param {{ captionBackground?: string }} options
 */
export function resolveCaptionBackground(options) {
  const raw = typeof options?.captionBackground === 'string' ? options.captionBackground.trim() : ''
  const hex = expandHex(raw)
  if (hex) return hex
  const hit = CAPTION_BACKGROUND_OPTIONS.find((o) => o.id === raw || o.color.toUpperCase() === raw.toUpperCase())
  return (hit?.color || DEFAULT_CAPTION_BG).toUpperCase()
}

/**
 * @param {{ captionColor?: string, foreground?: string }} options
 */
export function resolveCaptionColor(options) {
  const raw = typeof options?.captionColor === 'string' ? options.captionColor.trim() : ''
  const hex = expandHex(raw)
  if (hex) return hex
  const hit = CAPTION_COLOR_OPTIONS.find((o) => o.id === raw || o.color.toUpperCase() === raw.toUpperCase())
  if (hit) return hit.color.toUpperCase()
  const fg = expandHex(options?.foreground || '')
  return fg || DEFAULT_CAPTION_COLOR
}

/**
 * @param {{ captionBold?: boolean }} options
 */
export function resolveCaptionBold(options) {
  return !!options?.captionBold
}

/**
 * @param {{ captionItalic?: boolean }} options
 */
export function resolveCaptionItalic(options) {
  return !!options?.captionItalic
}
