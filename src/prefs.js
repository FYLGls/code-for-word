const KEY = 'codepaste-prefs'

/**
 * @typedef {object} Prefs
 * @property {string} [language]
 * @property {string} [fontFamily]
 * @property {string} [fontSize]
 * @property {string} [background]
 * @property {string} [paper]
 * @property {string} [sideMargin]
 * @property {string} [codeInset]
 * @property {string} [accent]
 * @property {boolean} [forceBold]
 * @property {boolean} [forceItalic]
 * @property {boolean} [lineNumbers]
 * @property {string} [frameStyle]
 * @property {boolean} [captionEnabled]
 * @property {string} [captionFont]
 * @property {string} [captionColor]
 * @property {string} [captionBg]
 * @property {boolean} [captionBold]
 * @property {boolean} [captionItalic]
 * @property {string[]} [captionLines]
 * @property {string} [mode] auto | code | text
 * @property {string} [textScheme] academic | thesis | official | none
 * @property {string} [textSplit] auto | items | merge
 * @property {string} [textBodyFont]
 * @property {string} [textBodySize]
 * @property {string} [textHeadingFont]
 * @property {string} [textLineSpacing]
 * @property {string} [textIndentChars] '2' | '4' | '0'
 * @property {string} [textAlign] justify | left
 * @property {string} [textBodyAfter] '0' | '6' | '12'（磅）
 * @property {boolean} [textIndent] 旧版布尔首行缩进（兼容读取）
 * @property {string} [translateProvider] none | free | ai
 * @property {string} [translateDirection] auto | en2zh | zh2en
 * @property {string} [translateOutput] original | translated | bilingual
 * @property {boolean} [autoTranslate]
 * @property {string} [aiBaseUrl]
 * @property {string} [aiModel]
 * @property {string} [aiApiKey]
 */

/** @returns {Prefs} */
export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** @param {Prefs} prefs */
export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota */
  }
}
