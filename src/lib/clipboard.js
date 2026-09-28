/**
 * Clipboard client:
 * - Desktop / local http: prefer Windows RTF host
 * - Public https (GitHub Pages): browser clipboard only (never call localhost)
 *
 * Important: on the web path, do not await anything before clipboard writes —
 * even a resolved await can drop the click user-activation in Chromium.
 */

const HOST = `http://127.0.0.1:${import.meta.env?.VITE_CLIP_PORT || 5199}`

function canUseClipboardHost() {
  if (typeof window === 'undefined') return false
  if (window.codepasteDesktop?.isDesktop) return true
  const { protocol, hostname } = window.location
  if (protocol === 'http:' && (hostname === '127.0.0.1' || hostname === 'localhost')) {
    return true
  }
  return false
}

async function postHost(body, timeoutMs = 2500) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${HOST}/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.ok ? data : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function wrapHtmlFragment(html) {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body><!--StartFragment-->${html}<!--EndFragment--></body></html>`
  )
}

/**
 * Word path: RTF via host when available; otherwise HTML for the browser.
 * @param {{ rtf: string, html: string, plain: string }} payload
 */
export async function writeClipboard(payload) {
  const desktop = typeof window !== 'undefined' ? window.codepasteDesktop : null
  if (desktop?.isDesktop && typeof desktop.writeRtf === 'function') {
    const native = await desktop.writeRtf({ rtf: payload.rtf, plain: payload.plain })
    if (native?.ok) return { via: 'native-rtf', detail: native }
  }

  // Only await the host when we are actually allowed to use it.
  if (canUseClipboardHost()) {
    const host = await postHost({
      rtf: payload.rtf,
      plain: payload.plain,
      mode: 'rtf'
    })
    if (host) return { via: 'native-rtf', detail: host }
  }

  const wrapped = wrapHtmlFragment(payload.html)

  // ClipboardItem first — best HTML→Word path while the click gesture is alive
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([wrapped], { type: 'text/html' }),
          'text/plain': new Blob([payload.plain], { type: 'text/plain' })
        })
      ])
      return { via: 'browser-html' }
    } catch {
      /* fall through */
    }
  }

  try {
    writeViaCopyEvent(wrapped, payload.plain, '')
    return { via: 'execCommand' }
  } catch {
    /* fall through */
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload.plain)
      return { via: 'browser-text' }
    } catch {
      /* fall through */
    }
  }

  throw new Error('copy failed')
}

/**
 * Plain Unicode clipboard (optional host mode).
 * @param {{ plain: string }} payload
 */
export async function writePlainClipboard(payload) {
  if (canUseClipboardHost()) {
    const host = await postHost({
      plain: payload.plain,
      mode: 'plain'
    })
    if (host) return { via: 'native-plain', detail: host }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload.plain)
      return { via: 'browser-text' }
    } catch {
      /* fall through */
    }
  }

  writeViaCopyEvent('', payload.plain, '')
  return { via: 'execCommand' }
}

function writeViaCopyEvent(html, plain, rtf) {
  const onCopy = (e) => {
    if (html) e.clipboardData.setData('text/html', html)
    e.clipboardData.setData('text/plain', plain)
    if (rtf) e.clipboardData.setData('text/rtf', rtf)
    e.preventDefault()
  }

  document.addEventListener('copy', onCopy)

  const probe = document.createElement('textarea')
  probe.value = plain || ' '
  probe.setAttribute('readonly', '')
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(probe)

  const prev = document.activeElement
  let ok = false
  try {
    probe.focus()
    probe.select()
    ok = document.execCommand('copy')
  } finally {
    document.removeEventListener('copy', onCopy)
    probe.remove()
    if (prev && typeof prev.focus === 'function') {
      try {
        prev.focus()
      } catch {
        /* ignore */
      }
    }
  }

  if (!ok) throw new Error('copy failed')
}

/** @param {Blob} blob @param {string} filename */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function clipboardHostReady() {
  if (!canUseClipboardHost()) return false
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 600)
  try {
    const res = await fetch(`${HOST}/health`, { method: 'GET', signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
