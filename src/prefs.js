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
