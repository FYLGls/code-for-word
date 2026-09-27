#!/usr/bin/env node
/**
 * CLI:
 * - Installed desktop app → launch
 * - Else Windows → download latest GitHub Release Setup.exe
 * - Else local checkout with deps → npm run dev
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const pkg = require(path.join(ROOT, 'package.json'))
const isWin = process.platform === 'win32'

function log(msg) {
  console.log(msg)
}

function fail(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

function installedExeCandidates() {
  const local = process.env.LOCALAPPDATA || ''
  const pf = process.env.ProgramFiles || ''
  const pf86 = process.env['ProgramFiles(x86)'] || ''
  return [
    path.join(local, 'Programs', 'Code for Word', 'Code for Word.exe'),
    path.join(local, 'Programs', 'CodePaste', 'CodePaste.exe'),
    path.join(pf, 'Code for Word', 'Code for Word.exe'),
    path.join(pf, 'CodePaste', 'CodePaste.exe'),
    path.join(pf86, 'Code for Word', 'Code for Word.exe'),
    path.join(pf86, 'CodePaste', 'CodePaste.exe')
  ]
}

function findInstalledApp() {
  for (const p of installedExeCandidates()) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

function launchExe(exe) {
  log(`正在启动 Code for Word…\n  ${exe}`)
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
}

function githubRepo() {
  const cfg = pkg.codepaste || {}
  const owner = process.env.CODEPASTE_GITHUB_OWNER || cfg.githubOwner
  const repo = process.env.CODEPASTE_GITHUB_REPO || cfg.githubRepo
  if (owner && repo) return { owner, repo }
  const url = pkg.repository?.url || ''
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i)
  if (m) return { owner: m[1], repo: m[2] }
  return null
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https
    const req = lib.get(
      url,
      { headers: { 'User-Agent': 'codepaste-cli', Accept: 'application/vnd.github+json' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve, reject)
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(body))
          } catch (err) {
            reject(err)
          }
        })
      }
    )
    req.on('error', reject)
  })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const lib = url.startsWith('http://') ? http : https
    const req = lib.get(url, { headers: { 'User-Agent': 'codepaste-cli' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlinkSync(dest)
        downloadFile(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
    })
    req.on('error', (err) => {
      try {
        fs.unlinkSync(dest)
      } catch {
        /* ignore */
      }
      reject(err)
    })
  })
}

async function installFromGitHubRelease() {
  const repo = githubRepo()
  if (!repo) {
    fail('未配置 GitHub 仓库地址。请到 Releases 下载 CodeForWord-Setup-*.exe。')
  }

  log(`正在查找最新安装包：${repo.owner}/${repo.repo} …`)
  let release
  try {
    release = await fetchJson(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`
    )
  } catch (err) {
    fail(
      `无法读取 GitHub Release（${err.message}）。\nhttps://github.com/${repo.owner}/${repo.repo}/releases`
    )
  }

  const asset = (release.assets || []).find(
    (a) =>
      /\.exe$/i.test(a.name) &&
      (/setup/i.test(a.name) || /CodeForWord/i.test(a.name) || /CodePaste/i.test(a.name))
  )
  if (!asset?.browser_download_url) {
    fail(`最新 Release 中没有安装包。\nhttps://github.com/${repo.owner}/${repo.repo}/releases`)
  }

  const tmp = path.join(os.tmpdir(), asset.name)
  log(`正在下载 ${asset.name} …`)
  await downloadFile(asset.browser_download_url, tmp)
  log('正在打开安装程序…')
  const result = spawnSync(tmp, [], { stdio: 'inherit', windowsHide: false })
  if (result.status && result.status !== 0) fail(`安装程序退出码：${result.status}`)

  for (let i = 0; i < 30; i++) {
    const exe = findInstalledApp()
    if (exe) {
      launchExe(exe)
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  log('安装可能已完成。请从开始菜单打开「Code for Word」。')
}

function launchDevCheckout() {
  const devScript = path.join(ROOT, 'scripts', 'dev.mjs')
  const electronMain = path.join(ROOT, 'electron', 'main.cjs')
  const hasElectron = fs.existsSync(path.join(ROOT, 'node_modules', 'electron'))

  if (fs.existsSync(electronMain) && hasElectron && fs.existsSync(devScript)) {
    log('检测到开发目录，正在启动…')
    const child = spawn(process.execPath, [devScript], {
      cwd: ROOT,
      stdio: 'inherit',
      windowsHide: false
    })
    child.on('exit', (code) => process.exit(code ?? 0))
    return
  }

  fail('未找到已安装的 Code for Word，且当前目录也不是可用的开发检出。')
}

async function main() {
  const installed = findInstalledApp()
  if (installed) {
    launchExe(installed)
    return
  }

  if (isWin) {
    const inRepo = fs.existsSync(path.join(ROOT, 'electron', 'main.cjs'))
    const hasModules = fs.existsSync(path.join(ROOT, 'node_modules', 'electron'))
    if (inRepo && hasModules && !process.env.CODEPASTE_FORCE_INSTALL) {
      launchDevCheckout()
      return
    }
    await installFromGitHubRelease()
    return
  }

  launchDevCheckout()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
