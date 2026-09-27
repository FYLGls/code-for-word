/**
 * Capture fullscreen README demo frames (visible cursor) from the Vite app.
 * Usage: node scripts/capture-demo.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'docs', '_demo-frames')
const baseUrl = process.argv[2] || 'http://127.0.0.1:5173'
const WIDTH = 1440
const HEIGHT = 900

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1
  })
  await page.goto(`${baseUrl}/?demo=1`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__codepasteDemoFrame === 'function')

  const count = await page.evaluate(() => window.__codepasteDemoFrameCount || 19)
  const meta = []
  for (let i = 0; i < count; i++) {
    const info = await page.evaluate(async (idx) => window.__codepasteDemoFrame(idx), i)
    // Let layout/paint settle; cursor is positioned instantly (no CSS transition).
    await page.waitForTimeout(60)
    const file = path.join(outDir, `frame-${String(i).padStart(2, '0')}.png`)
    await page.screenshot({ path: file, type: 'png' })
    meta.push({ i, holdMs: info?.holdMs ?? 120, file })
    process.stdout.write(`captured ${i + 1}/${count}\n`)
  }

  await writeFile(path.join(outDir, 'meta.json'), JSON.stringify({ WIDTH, HEIGHT, meta }, null, 2))
  await browser.close()
  console.log(`done → ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
