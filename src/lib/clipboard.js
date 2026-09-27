/**
 * Clipboard client:
 * - Desktop / local http: prefer Windows RTF host
 * - Public https (GitHub Pages): browser clipboard only (never call localhost)
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

async function postHost(body, timeoutMs = 800) {
  if (!canUseClipboardHost()) return null
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

/**
 * Word path: RTF via host when available; otherwise HTML for the browser.
 * @param {{ rtf: string, html: string, plain: string }} payload
 */
export async function writeClipboard(payload) {
  const host = await postHost({
    rtf: payload.rtf,
    plain: payload.plain,
    mode: 'rtf'
  })
  if (host) return { via: 'native-rtf', detail: host }

  const wrapped =
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body><!--StartFragment-->${payload.html}<!--EndFragment--></body></html>`

  // Prefer execCommand during the click gesture — more reliable for text/html → Word
  try {
    await writeViaCopyEvent(wrapped, payload.plain, '')
    return { via: 'execCommand' }
  } catch {
    /* fall through */
  }

  if (navigator.clipboard?.write && window.ClipboardItem) {
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

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.plain)
    return { via: 'browser-text' }
  }

  throw new Error('copy failed')
}

/**
 * Plain Unicode clipboard (optional host mode).
 * @param {{ plain: string }} payload
 */
export async function writePlainClipboard(payload) {
  const host = await postHost({
    plain: payload.plain,
    mode: 'plain'
  })
  if (host) return { via: 'native-plain', detail: host }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.plain)
    return { via: 'browser-text' }
  }

  await writeViaCopyEvent('', payload.plain, '')
  return { via: 'execCommand' }
}

function writeViaCopyEvent(html, plain, rtf) {
  return new Promise((resolve, reject) => {
    const onCopy = (e) => {
      try {
        if (html) e.clipboardData.setData('text/html', html)
        e.clipboardData.setData('text/plain', plain)
        if (rtf) e.clipboardData.setData('text/rtf', rtf)
        e.preventDefault()
      } catch (err) {
        reject(err)
        return
      }
    }
    document.addEventListener('copy', onCopy)
    let ok = false
    try {
      ok = document.execCommand('copy')
    } finally {
      document.removeEventListener('copy', onCopy)
    }
    if (ok) resolve()
    else reject(new Error('copy failed'))
  })
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
