/**
 * Clipboard client:
 * 1) Prefer local Windows host
 * 2) Fallback browser APIs
 */

const HOST = `http://127.0.0.1:${import.meta.env?.VITE_CLIP_PORT || 5199}`

/**
 * Word path: RTF + plain via host (no HTML).
 * @param {{ rtf: string, html: string, plain: string }} payload
 */
export async function writeClipboard(payload) {
  try {
    const res = await fetch(`${HOST}/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rtf: payload.rtf,
        plain: payload.plain,
        mode: 'rtf'
      })
    })
    if (res.ok) {
      const data = await res.json()
      if (data.ok) return { via: 'native-rtf', detail: data }
    }
  } catch {
    /* host offline */
  }

  const wrapped =
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body><!--StartFragment-->${payload.html}<!--EndFragment--></body></html>`

  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([wrapped], { type: 'text/html' }),
        'text/plain': new Blob([payload.plain], { type: 'text/plain' })
      })
    ])
    return { via: 'browser-html' }
  }

  await writeViaCopyEvent(wrapped, payload.plain, payload.rtf)
  return { via: 'execCommand' }
}

/**
 * Plain Unicode clipboard (optional host mode).
 * @param {{ plain: string }} payload
 */
export async function writePlainClipboard(payload) {
  try {
    const res = await fetch(`${HOST}/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plain: payload.plain,
        mode: 'plain'
      })
    })
    if (res.ok) {
      const data = await res.json()
      if (data.ok) return { via: 'native-plain', detail: data }
    }
  } catch {
    /* host offline */
  }

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
      if (html) e.clipboardData.setData('text/html', html)
      e.clipboardData.setData('text/plain', plain)
      try {
        if (rtf) e.clipboardData.setData('text/rtf', rtf)
      } catch {
        /* chrome may block */
      }
      e.preventDefault()
    }
    document.addEventListener('copy', onCopy)
    const ok = document.execCommand('copy')
    document.removeEventListener('copy', onCopy)
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
  try {
    const res = await fetch(`${HOST}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}
