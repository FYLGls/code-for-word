/** Decide UI locale: pinned user choice > installer choice > follow system. */

const KNOWN = new Set(['zh', 'en', 'fr', 'es', 'ru', 'auto'])

/**
 * @param {{ saved?: string | null, installLocale?: string | null }} input
 * @returns {string}
 */
export function resolveStartLocale({ saved, installLocale } = {}) {
  const pin = String(saved || '').trim()
  if (pin && pin !== 'auto' && KNOWN.has(pin)) return pin
  const installed = String(installLocale || '').trim().slice(0, 2).toLowerCase()
  if (installed && KNOWN.has(installed) && installed !== 'auto') return installed
  return 'auto'
}

/**
 * Map NSIS $LANGUAGE (Win32 LANGID) to app locale. Unknown → English.
 * @param {number | string} langId
 */
export function localeFromNsisLanguage(langId) {
  const id = Number(langId)
  const map = {
    2052: 'zh',
    1028: 'zh',
    1036: 'fr',
    1034: 'es',
    3082: 'es',
    1049: 'ru',
    1033: 'en'
  }
  return map[id] || 'en'
}
