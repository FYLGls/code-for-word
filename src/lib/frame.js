/**
 * Accent frame around the listing.
 *  - bar: left vertical only (current default)
 *  - rails: left + right vertical; line numbers stay on the left
 *  - box: top + bottom + left + right around the pasted block
 * @typedef {'bar' | 'rails' | 'box'} FrameStyle
 */

/** @param {unknown} id @returns {FrameStyle} */
export function resolveFrameStyle(id) {
  if (id === 'rails' || id === 'box') return id
  return 'bar'
}

/**
 * RTF paragraph border controls for inside (non-table) mode.
 * @param {FrameStyle} frame
 * @param {number} colorIndex colortbl index for accent
 * @param {number} index line index
 * @param {number} total line count
 */
export function rtfParaBorders(frame, colorIndex, index, total) {
  const s = `\\brdrs\\brdrw40\\brdrcf${colorIndex}`
  if (frame === 'bar') return `\\brdrl${s}`
  if (frame === 'rails') return `\\brdrl${s}\\brdrr${s}`
  // box uses one multi-line paragraph with four borders — not per-line
  return ''
}

/**
 * CSS border shorthand pieces for preview / HTML fallback.
 * @param {FrameStyle} frame
 * @param {string} accent hex color
 */
export function cssFrameBorders(frame, accent) {
  const w = '2.25pt'
  const c = accent
  if (frame === 'bar') {
    return {
      border: 'none',
      borderLeft: `${w} solid ${c}`
    }
  }
  if (frame === 'rails') {
    return {
      border: 'none',
      borderLeft: `${w} solid ${c}`,
      borderRight: `${w} solid ${c}`
    }
  }
  return {
    border: `${w} solid ${c}`,
    borderLeft: `${w} solid ${c}`,
    borderRight: `${w} solid ${c}`,
    borderTop: `${w} solid ${c}`,
    borderBottom: `${w} solid ${c}`
  }
}

/**
 * @param {{ border?: string, borderLeft?: string, borderRight?: string, borderTop?: string, borderBottom?: string }} b
 */
export function cssBorderStyle(b) {
  return (
    `border:${b.border || 'none'};` +
    (b.borderTop ? `border-top:${b.borderTop};` : '') +
    (b.borderRight ? `border-right:${b.borderRight};` : '') +
    (b.borderBottom ? `border-bottom:${b.borderBottom};` : '') +
    (b.borderLeft ? `border-left:${b.borderLeft};` : '')
  )
}
