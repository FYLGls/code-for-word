import { describe, expect, it } from 'vitest'
import {
  listingSideIndent,
  listingSideIndents,
  PAGE_CONTENT_TWIPS,
  estimateListingTwips,
  resolveCodeInsetTwips,
  codeInsetSpaceCount,
  codeInsetPrefix
} from './lines.js'
import { cmToTwips } from '../themes.js'

describe('listingSideIndent', () => {
  it('default (null) uses zero side indent', () => {
    expect(listingSideIndent(3000, null, 9000)).toBe(0)
    expect(listingSideIndent(PAGE_CONTENT_TWIPS - 100, null, PAGE_CONTENT_TWIPS)).toBe(0)
    expect(listingSideIndent(3000, null, null)).toBe(0)
    expect(listingSideIndent(8000, null, null)).toBe(0)
  })

  it('honors Word-style custom left/right in cm-converted twips', () => {
    const { left, right } = listingSideIndents(2000, { left: 567, right: 1134 }, 9000)
    expect(left).toBe(567)
    expect(right).toBe(1134)
  })

  it('scales custom margins only when L+R alone exceed the page', () => {
    const { left, right } = listingSideIndents(4000, { left: 3000, right: 3000 }, 9000)
    expect(left + right).toBeLessThanOrEqual(9000 - 2400)
    expect(left).toBeGreaterThan(0)
  })

  it('keeps thesis margins even when the code line measures wider than the page', () => {
    const wide = estimateListingTwips(
      [[{ text: 'a'.repeat(80), color: '#000' }]],
      { fontSizePt: 18, lineNumbers: true }
    )
    const side = listingSideIndent(wide, 1134, 9000)
    expect(side).toBe(1134)
  })

  it('fit mode still applies custom margins when they fit', () => {
    const { left, right } = listingSideIndents(2000, { left: 720, right: 720 }, null)
    expect(left).toBe(720)
    expect(right).toBe(720)
  })
})

describe('code inset (code↔marker gap)', () => {
  it('default / null is zero extra gap', () => {
    expect(resolveCodeInsetTwips(null, 9000, null)).toBe(0)
    expect(resolveCodeInsetTwips(undefined, 9000, { left: 1134, right: 1134 })).toBe(0)
    expect(codeInsetPrefix({ fontSizePt: 9 }, 0)).toBe('')
  })

  it('honors thesis-style cm inset', () => {
    const half = cmToTwips(0.5)
    expect(resolveCodeInsetTwips(half, 9000, null)).toBe(half)
    expect(codeInsetSpaceCount(half, 9)).toBeGreaterThanOrEqual(1)
    expect(codeInsetPrefix({ fontSizePt: 9 }, half).length).toBe(codeInsetSpaceCount(half, 9))
  })

  it('clamps per-side inset so left+right pads + side margins still fit', () => {
    const huge = cmToTwips(5)
    const a5 = 6950
    const sides = { left: cmToTwips(2.5), right: cmToTwips(2.5) }
    const inset = resolveCodeInsetTwips(huge, a5, sides)
    expect(inset).toBeLessThan(huge)
    expect(inset * 2 + sides.left + sides.right).toBeLessThanOrEqual(a5 - 2400 + 1)
  })
})

