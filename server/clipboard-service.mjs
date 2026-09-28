/**
 * Shared Windows clipboard HTTP service (RTF + UnicodeText).
 * Used by clipboard-host.mjs and the Electron main process.
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const DEFAULT_CLIP_PORT = 5199

/**
 * @param {{ rtf?: string | null, plain: string }} payload
 */
export function writeWindowsClipboard({ rtf, plain }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepaste-'))
  const plainPath = path.join(dir, 'a.txt')
  fs.writeFileSync(plainPath, plain, { encoding: 'utf8' })

  const plainOnly = !rtf
  let rtfPath = ''
  if (!plainOnly) {
    rtfPath = path.join(dir, 'a.rtf')
    fs.writeFileSync(rtfPath, rtf, { encoding: 'utf8' })
  }

  // 目标应用（Word/WPS）瞬时占用剪贴板时 OpenClipboard 会失败（"Clipboard is busy"），
  // 在同一进程内短间隔重试，避免整个复制操作失败。
  const ps = plainOnly
    ? `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$plain = [System.IO.File]::ReadAllText(${JSON.stringify(plainPath)}, [System.Text.Encoding]::UTF8)
$data = New-Object System.Windows.Forms.DataObject
$data.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $false, $plain)
$done = $false
for ($i = 0; $i -lt 6 -and -not $done; $i++) {
  try {
    [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
    $done = $true
  } catch {
    Start-Sleep -Milliseconds 120
  }
}
if (-not $done) { throw 'clipboard busy after retries' }
Write-Output 'ok'
`
    : `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$rtf = [System.IO.File]::ReadAllText(${JSON.stringify(rtfPath)}, [System.Text.Encoding]::UTF8)
$plain = [System.IO.File]::ReadAllText(${JSON.stringify(plainPath)}, [System.Text.Encoding]::UTF8)
$data = New-Object System.Windows.Forms.DataObject
$data.SetData([System.Windows.Forms.DataFormats]::Rtf, $false, $rtf)
$data.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $false, $plain)
$done = $false
for ($i = 0; $i -lt 6 -and -not $done; $i++) {
  try {
    [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
    $done = $true
  } catch {
    Start-Sleep -Milliseconds 120
  }
}
if (-not $done) { throw 'clipboard busy after retries' }
Write-Output 'ok'
`
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'utf8', windowsHide: true, timeout: 12000 }
  )

  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }

  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || 'clipboard failed').trim()
    throw new Error(msg)
  }
  return true
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/**
 * @param {{ port?: number, host?: string }} [options]
 * @returns {Promise<{ port: number, host: string, close: () => Promise<void> }>}
 */
export function startClipboardServer(options = {}) {
  const port = Number(options.port || process.env.CODEPASTE_CLIP_PORT || DEFAULT_CLIP_PORT)
  const host = options.host || '127.0.0.1'

  const server = http.createServer(async (req, res) => {
    cors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, platform: process.platform }))
      return
    }

    if (req.method === 'POST' && req.url === '/clipboard') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = Buffer.concat(chunks).toString('utf8')
      try {
        const payload = JSON.parse(body)
        if (payload.plain == null) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'plain required' }))
          return
        }
        const plainOnly = payload.mode === 'plain' || !payload.rtf
        if (!plainOnly && !payload.rtf) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'rtf required unless mode=plain' }))
          return
        }
        if (process.platform !== 'win32') {
          res.writeHead(501, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Windows clipboard host only' }))
          return
        }
        writeWindowsClipboard({
          rtf: plainOnly ? null : payload.rtf,
          plain: payload.plain
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, via: plainOnly ? 'unicode' : 'rtf+unicode' }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
      }
      return
    }

    res.writeHead(404)
    res.end('not found')
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      resolve({
        port,
        host,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          })
      })
    })
  })
}
