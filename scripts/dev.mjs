/**
 * Dev: Vite + Electron (clipboard runs inside Electron main).
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB_URL = 'http://127.0.0.1:5173/'
const children = []

function shutdown(code = 0) {
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

function waitForHttp(url, timeoutMs = 60000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`timeout ${url}`))
        else setTimeout(tick, 250)
      })
    }
    tick()
  })
}

const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  cwd: ROOT,
  stdio: 'inherit',
  windowsHide: true
})
children.push(vite)

await waitForHttp(WEB_URL)

const electronBin = path.join(
  ROOT,
  'node_modules',
  'electron',
  'cli.js'
)
const electron = spawn(process.execPath, [electronBin, '.'], {
  cwd: ROOT,
  env: {
    ...process.env,
    VITE_DEV_SERVER: WEB_URL
  },
  stdio: 'inherit',
  windowsHide: true
})
children.push(electron)

electron.on('exit', (code) => shutdown(code ?? 0))
vite.on('exit', (code) => {
  if (code && code !== 0) shutdown(code)
})
