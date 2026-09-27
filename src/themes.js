/** @typedef {{ text: string, color: string, bold?: boolean, italic?: boolean }} StyledRun */
/** @typedef {{
 *  id: string,
 *  label: string,
 *  mode: 'dark' | 'light',
 *  background: string,
 *  foreground: string,
 *  lineNumber: string,
 *  accentLeft?: string,
 *  classes: Record<string, string>
 * }} Theme */
/** @typedef {{ pt: number, cn: string | null }} FontSizeOption */
/** @typedef {{ id: string, labelKey: string, color: string | null }} BackgroundOption */
/** @typedef {{ id: string, label?: string, labelKey?: string, rtfCharset?: number }} FontOption */

/**
 * Colors aligned with Visual Studio Code Dark+ / Light+ defaults.
 * @type {Record<string, Theme>}
 */
export const THEMES = {
  'vscode-dark': {
    id: 'vscode-dark',
    label: 'VS Code Dark+',
    mode: 'dark',
    background: '#1E1E1E',
    foreground: '#D4D4D4',
    lineNumber: '#858585',
    accentLeft: '#007ACC',
    classes: {
      keyword: '#569CD6',
      'keyword.control': '#C586C0',
      built_in: '#4EC9B0',
      type: '#4EC9B0',
      literal: '#569CD6',
      number: '#B5CEA8',
      string: '#CE9178',
      subst: '#D4D4D4',
      symbol: '#D4D4D4',
      regexp: '#D16969',
      'title.function': '#DCDCAA',
      title: '#DCDCAA',
      params: '#9CDCFE',
      comment: '#6A9955',
      doctag: '#608B4E',
      meta: '#9B9B9B',
      'meta.keyword': '#569CD6',
      name: '#4EC9B0',
      attr: '#9CDCFE',
      attribute: '#9CDCFE',
      variable: '#9CDCFE',
      'variable.language': '#569CD6',
      'variable.constant': '#4FC1FF',
      property: '#9CDCFE',
      selector: '#D7BA7D',
      tag: '#569CD6',
      addition: '#B5CEA8',
      deletion: '#CE9178'
    }
  },
  'vscode-light': {
    id: 'vscode-light',
    label: 'VS Code Light+',
    mode: 'light',
    background: '#F5F5F5',
    foreground: '#000000',
    lineNumber: '#237893',
    accentLeft: '#007ACC',
    classes: {
      keyword: '#0000FF',
      'keyword.control': '#AF00DB',
      built_in: '#267F99',
      type: '#267F99',
      literal: '#0000FF',
      number: '#098658',
      string: '#A31515',
      subst: '#000000',
      symbol: '#000000',
      regexp: '#811F3F',
      'title.function': '#795E26',
      title: '#795E26',
      params: '#001080',
      comment: '#008000',
      doctag: '#008000',
      meta: '#808080',
      'meta.keyword': '#0000FF',
      name: '#800000',
      attr: '#E50000',
      attribute: '#E50000',
      variable: '#001080',
      'variable.language': '#0000FF',
      'variable.constant': '#0070C1',
      property: '#001080',
      selector: '#800000',
      tag: '#800000'
    }
  }
}

/** @param {string} id */
export function getTheme(id) {
  return THEMES[id] || THEMES['vscode-light']
}

export function listThemes() {
  return Object.values(THEMES)
}

/**
 * Word 常用字体（含中文与等宽）。
 * @type {FontOption[]}
 */
/**
 * Word-safe faces. `id` is the face name written to RTF/DOCX;
 * `labelKey` localizes CJK names for non-Chinese UI.
 */
export const FONT_OPTIONS = [
  // Mono / code
  { id: 'Consolas', rtfCharset: 0 },
  { id: 'Courier New', rtfCharset: 0 },
  { id: 'Cascadia Mono', rtfCharset: 0 },
  { id: 'Lucida Console', rtfCharset: 0 },
  { id: 'Cascadia Code', rtfCharset: 0 },
  // Latin body — common in Word worldwide
  { id: 'Calibri', rtfCharset: 0 },
  { id: 'Calibri Light', rtfCharset: 0 },
  { id: 'Cambria', rtfCharset: 0 },
  { id: 'Cambria Math', rtfCharset: 0 },
  { id: 'Georgia', rtfCharset: 0 },
  { id: 'Garamond', rtfCharset: 0 },
  { id: 'Palatino Linotype', rtfCharset: 0 },
  { id: 'Book Antiqua', rtfCharset: 0 },
  { id: 'Century', rtfCharset: 0 },
  { id: 'Century Schoolbook', rtfCharset: 0 },
  { id: 'Century Gothic', rtfCharset: 0 },
  { id: 'Times New Roman', rtfCharset: 0 },
  { id: 'Arial', rtfCharset: 0 },
  { id: 'Arial Narrow', rtfCharset: 0 },
  { id: 'Arial Unicode MS', rtfCharset: 0 },
  { id: 'Verdana', rtfCharset: 0 },
  { id: 'Tahoma', rtfCharset: 0 },
  { id: 'Trebuchet MS', rtfCharset: 0 },
  { id: 'Segoe UI', rtfCharset: 0 },
  { id: 'Helvetica', rtfCharset: 0 },
  // CJK — keep Chinese face names for Word CN; labels translated via i18n
  { id: '宋体', labelKey: 'fontSimSun', rtfCharset: 134 },
  { id: '黑体', labelKey: 'fontSimHei', rtfCharset: 134 },
  { id: '微软雅黑', labelKey: 'fontYaHei', rtfCharset: 134 },
  { id: '仿宋', labelKey: 'fontFangSong', rtfCharset: 134 },
  { id: '楷体', labelKey: 'fontKaiTi', rtfCharset: 134 },
  { id: '等线', labelKey: 'fontDengXian', rtfCharset: 134 },
  { id: '华文宋体', labelKey: 'fontStSong', rtfCharset: 134 },
  { id: '华文楷体', labelKey: 'fontStKaiti', rtfCharset: 134 },
  { id: '华文仿宋', labelKey: 'fontStFangsong', rtfCharset: 134 },
  { id: '华文中宋', labelKey: 'fontStZhongsong', rtfCharset: 134 }
]

/**
 * Display label for a font option (CJK names follow UI locale).
 * @param {FontOption} font
 * @param {(key: string) => string} translate
 */
export function formatFontLabel(font, translate) {
  if (font.labelKey && typeof translate === 'function') {
    const s = translate(font.labelKey)
    if (s && s !== font.labelKey) return s
  }
  return font.label || font.id
}

/**
 * Word Chinese 字号 + common coding pt sizes.
 * @type {FontSizeOption[]}
 */
/** Practical Word code sizes only — drop 八号/七号 and 二号+ (too small / too large). */
export const FONT_SIZE_OPTIONS = [
  { pt: 7.5, cn: '六号' },
  { pt: 8, cn: null },
  { pt: 9, cn: '小五' },
  { pt: 10, cn: null },
  { pt: 10.5, cn: '五号' },
  { pt: 11, cn: null },
  { pt: 12, cn: '小四' },
  { pt: 14, cn: '四号' },
  { pt: 15, cn: '小三' },
  { pt: 16, cn: '三号' },
  { pt: 18, cn: '小二' }
]

/** @deprecated use FONT_SIZE_OPTIONS */
export const FONT_SIZES = FONT_SIZE_OPTIONS.map((o) => o.pt)

/**
 * Locale-aware size label: Chinese 字号 only for zh; others use pt.
 * @param {{ pt: number, cn: string | null }} opt
 * @param {string} [locale]
 */
export function formatFontSizeLabel(opt, locale = 'zh') {
  if (locale === 'zh' && opt.cn) return `${opt.cn}（${opt.pt} pt）`
  return `${opt.pt} pt`
}

/** Listing paper fill — independent from highlight theme tokens. */
/** color: null = follow theme; 'none' = no fill; else hex */
export const BACKGROUND_OPTIONS = [
  { id: 'theme', labelKey: 'bgTheme', color: null },
  { id: 'none', labelKey: 'bgNone', color: 'none' },
  { id: 'paper', labelKey: 'bgPaper', color: '#F5F5F5' },
  { id: 'mist', labelKey: 'bgMist', color: '#EEF1F4' },
  { id: 'soft', labelKey: 'bgSoft', color: '#E8F0F6' },
  { id: 'white', labelKey: 'bgWhite', color: '#FFFFFF' },
  { id: 'ivory', labelKey: 'bgIvory', color: '#FAF8F4' }
]

/** 1 cm in twips (Word). */
export const TWIPS_PER_CM = 567

/** @param {number} cm */
export function cmToTwips(cm) {
  return Math.round(Number(cm) * TWIPS_PER_CM)
}

/**
 * Left/right listing inset presets. null = 默认 (no extra indent).
 * Distance of the marker/frame from Word page content edges.
 * Includes thesis-common values; smaller pads first so paste doesn't look oversized.
 */
export const SIDE_MARGIN_OPTIONS = [
  { id: 'auto', labelKey: 'marginAuto', twips: null },
  { id: 'cm10', labelKey: 'marginCm10', twips: cmToTwips(1) },
  { id: 'cm15', labelKey: 'marginCm15', twips: cmToTwips(1.5) },
  { id: 'cm20', labelKey: 'marginCm20', twips: cmToTwips(2) },
  { id: 'cm25', labelKey: 'marginCm25', twips: cmToTwips(2.5) },
  { id: 'cm254', labelKey: 'marginCm254', twips: cmToTwips(2.54) },
  { id: 'cm30', labelKey: 'marginCm30', twips: cmToTwips(3) },
  { id: 'cm317', labelKey: 'marginCm317', twips: cmToTwips(3.17) }
]

/**
 * Gap between marker/frame and code text (not line numbers).
 * Thesis-common pads; null = 默认 (no extra gap beyond "1.  " suffix spaces).
 */
export const CODE_INSET_OPTIONS = [
  { id: 'auto', labelKey: 'codeInsetAuto', twips: null },
  { id: 'cm05', labelKey: 'codeInsetCm05', twips: cmToTwips(0.5) },
  { id: 'cm075', labelKey: 'codeInsetCm075', twips: cmToTwips(0.75) },
  { id: 'cm10', labelKey: 'codeInsetCm10', twips: cmToTwips(1) },
  { id: 'cm15', labelKey: 'codeInsetCm15', twips: cmToTwips(1.5) },
  { id: 'cm20', labelKey: 'codeInsetCm20', twips: cmToTwips(2) }
]

/**
 * Page content width (between Word left/right margins), in twips.
 * null = 适应纸张 — no assumed size; paste uses a small pad and works on any page.
 */
export const PAPER_OPTIONS = [
  { id: 'fit', labelKey: 'paperFit', contentTwips: null },
  { id: 'a4', labelKey: 'paperA4', contentTwips: 9026 },
  { id: 'letter', labelKey: 'paperLetter', contentTwips: 9360 },
  { id: 'b5', labelKey: 'paperB5', contentTwips: 8050 },
  { id: '16k', labelKey: 'paper16k', contentTwips: 8140 },
  { id: 'a5', labelKey: 'paperA5', contentTwips: 6950 }
]

/** Accent / blue bar colors (Word-safe solids). */
export const ACCENT_OPTIONS = [
  { id: 'blue', labelKey: 'accentBlue', color: '#007ACC' },
  { id: 'teal', labelKey: 'accentTeal', color: '#0B6E99' },
  { id: 'green', labelKey: 'accentGreen', color: '#70AD47' },
  { id: 'orange', labelKey: 'accentOrange', color: '#C45911' },
  { id: 'red', labelKey: 'accentRed', color: '#C00000' },
  { id: 'purple', labelKey: 'accentPurple', color: '#5B2C6F' },
  { id: 'gray', labelKey: 'accentGray', color: '#5A6573' },
  { id: 'black', labelKey: 'accentBlack', color: '#1A1A1A' }
]

/** Accent frame geometry around the listing. */
export const FRAME_STYLE_OPTIONS = [
  { id: 'bar', labelKey: 'frameBar' },
  { id: 'rails', labelKey: 'frameRails' },
  { id: 'box', labelKey: 'frameBox' }
]

