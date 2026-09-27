/**
 * Code for Word (码文) Electron shell — window, tray, app menu, clipboard service.
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { normalizeLocale, shellStrings } = require('./shell-i18n.cjs')

const APP_ID = 'com.codepaste.app'
const APP_DISPLAY_NAME = 'Code for Word'
app.setName(APP_DISPLAY_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url)
    return true
  }
  return false
})

ipcMain.handle('shell:setLocale', async (_event, locale) => {
  applyShellLocale(locale)
  return shellLocale
})

const CLIP_PORT = Number(process.env.CODEPASTE_CLIP_PORT || 5199)

let mainWindow = null
let tray = null
let clipboardHandle = null
let quitting = false
/** @type {string} */
let shellLocale = 'zh'

function tShell() {
  return shellStrings(shellLocale)
}

function applyShellLocale(locale) {
  shellLocale = normalizeLocale(locale)
  const s = tShell()
  installAppMenu()
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(s.trayTooltip)
    tray.setContextMenu(buildTrayMenu())
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(s.windowTitle)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

function rootDir() {
  return path.join(__dirname, '..')
}

function packageInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir(), 'package.json'), 'utf8'))
  } catch {
    return { version: app.getVersion(), homepage: '' }
  }
}

function githubHome() {
  const pkg = packageInfo()
  const owner = pkg.codepaste?.githubOwner
  const repo = pkg.codepaste?.githubRepo
  if (owner && repo) return `https://github.com/${owner}/${repo}`
  return pkg.homepage || 'https://github.com'
}

function iconPath(name) {
  const candidates = [
    path.join(rootDir(), 'resources', name),
    path.join(__dirname, name)
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function loadAppIcon() {
  const ico = iconPath('icon.ico')
  const png = iconPath('icon.png')
  if (ico) return nativeImage.createFromPath(ico)
  if (png) return nativeImage.createFromPath(png)
  return nativeImage.createEmpty()
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideToTray() {
  if (mainWindow) mainWindow.hide()
}

function readInstallLocale() {
  const candidates = [
    path.join(path.dirname(process.execPath), 'install-locale.json'),
    path.join(rootDir(), 'install-locale.json')
  ]
  for (const file of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      const loc = String(raw.locale || '')
        .trim()
        .slice(0, 2)
        .toLowerCase()
      if (['zh', 'en', 'fr', 'es', 'ru'].includes(loc)) return loc
    } catch {
      /* next */
    }
  }
  return null
}

function withInstallLocale(url) {
  const loc = readInstallLocale()
  if (!loc) return url
  const parsed = new URL(url)
  parsed.searchParams.set('installLocale', loc)
  return parsed.toString()
}

function sendMenuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu:action', action)
  }
}

function isOpenAtLogin() {
  try {
    return !!app.getLoginItemSettings().openAtLogin
  } catch {
    return false
  }
}

function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    openAsHidden: true,
    path: process.execPath,
    args: app.isPackaged ? [] : [path.join(rootDir(), 'electron', 'main.cjs')]
  })
}

async function showAbout() {
  const pkg = packageInfo()
  const s = tShell()
  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: s.aboutTitle,
    message: s.aboutMessage,
    detail: [`${s.version} ${pkg.version || app.getVersion()}`, '', s.aboutDetail, '', githubHome()].join(
      '\n'
    ),
    buttons: [s.aboutOk, 'GitHub'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  if (response === 1) shell.openExternal(githubHome())
}

function buildAppMenu() {
  const s = tShell()
  const template = [
    {
      label: s.file,
      submenu: [
        {
          label: s.copyToWord,
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            showMainWindow()
            sendMenuAction('copy-to-word')
          }
        },
        {
          label: s.downloadDocx,
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            showMainWindow()
            sendMenuAction('download-docx')
          }
        },
        { type: 'separator' },
        {
          label: s.hideToTray,
          accelerator: 'CmdOrCtrl+H',
          click: () => hideToTray()
        },
        {
          label: s.quit,
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ]
    },
    {
      label: s.edit,
      submenu: [
        { role: 'undo', label: s.undo },
        { role: 'redo', label: s.redo },
        { type: 'separator' },
        { role: 'cut', label: s.cut },
        { role: 'copy', label: s.copy },
        { role: 'paste', label: s.paste },
        { role: 'selectAll', label: s.selectAll }
      ]
    },
    {
      label: s.view,
      submenu: [
        {
          label: s.reload,
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.webContents.reload()
          }
        },
        { type: 'separator' },
        { role: 'resetZoom', label: s.actualSize },
        { role: 'zoomIn', label: s.zoomIn },
        { role: 'zoomOut', label: s.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: s.toggleFullscreen },
        ...(!app.isPackaged
          ? [
              { type: 'separator' },
              { role: 'toggleDevTools', label: 'Developer Tools' }
            ]
          : [])
      ]
    },
    {
      label: s.window,
      submenu: [
        {
          label: s.showMain,
          click: () => showMainWindow()
        },
        { role: 'minimize', label: s.minimize },
        {
          label: s.openAtLogin,
          type: 'checkbox',
          checked: isOpenAtLogin(),
          click: (item) => {
            setOpenAtLogin(item.checked)
            installAppMenu()
            if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu())
          }
        }
      ]
    },
    {
      label: s.help,
      submenu: [
        {
          label: s.readme,
          click: () => shell.openExternal(`${githubHome()}#readme`)
        },
        {
          label: s.downloadSetup,
          click: () => shell.openExternal(`${githubHome()}/releases`)
        },
        {
          label: 'GitHub',
          click: () => shell.openExternal(githubHome())
        },
        { type: 'separator' },
        {
          label: s.about,
          click: () => showAbout()
        }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

function installAppMenu() {
  Menu.setApplicationMenu(buildAppMenu())
}

function buildTrayMenu() {
  const s = tShell()
  return Menu.buildFromTemplate([
    {
      label: s.showMain,
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: s.openAtLogin,
      type: 'checkbox',
      checked: isOpenAtLogin(),
      click: (item) => {
        setOpenAtLogin(item.checked)
        installAppMenu()
        if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu())
      }
    },
    { type: 'separator' },
    {
      label: s.quit,
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
}

function createTray() {
  const image = loadAppIcon()
  const s = tShell()
  tray = new Tray(image.isEmpty() ? nativeImage.createFromDataURL(fallbackTrayPng()) : image)
  tray.setToolTip(s.trayTooltip)
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
}

function fallbackTrayPng() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBzVMKoBQw0YDYJRA0aDYDSAUQ1Y1YDRIBgAAB0AAfT3g7UAAAAASUVORK5CYII='
}

function createWindow() {
  const icon = loadAppIcon()
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 880,
    minHeight: 560,
    title: tShell().windowTitle,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  })

  const iconFile = iconPath('icon.ico') || iconPath('icon.png')
  try {
    mainWindow.setAppDetails({
      appId: APP_ID,
      relaunchDisplayName: APP_DISPLAY_NAME,
      relaunchCommand: app.isPackaged
        ? `"${process.execPath}"`
        : `"${process.execPath}" "${path.join(rootDir(), 'electron', 'main.cjs')}"`,
      ...(iconFile ? { appIconPath: iconFile } : {})
    })
  } catch {
    /* older Electron / non-Windows */
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.VITE_DEV_SERVER
  const installLocale = readInstallLocale()
  if (devUrl) {
    mainWindow.loadURL(withInstallLocale(devUrl))
  } else {
    const indexHtml = path.join(rootDir(), 'dist', 'index.html')
    if (!fs.existsSync(indexHtml)) {
      mainWindow.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<h2 style="font-family:sans-serif;padding:2rem">UI missing. Run npm run build, or npm run dev.</h2>'
          )
      )
    } else {
      mainWindow.loadFile(indexHtml, installLocale ? { query: { installLocale } } : undefined)
    }
  }
}

async function startClipboard() {
  const serviceUrl = pathToFileURL(path.join(rootDir(), 'server', 'clipboard-service.mjs')).href
  const mod = await import(serviceUrl)
  try {
    clipboardHandle = await mod.startClipboardServer({ port: CLIP_PORT })
    console.log(`[codepaste] clipboard http://127.0.0.1:${CLIP_PORT}`)
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      console.log(`[codepaste] clipboard port ${CLIP_PORT} in use � reusing`)
      clipboardHandle = null
      return
    }
    throw err
  }
}

app.whenReady().then(async () => {
  shellLocale = normalizeLocale(readInstallLocale() || app.getLocale())
  installAppMenu()
  await startClipboard()
  createTray()
  createWindow()
  app.on('activate', () => showMainWindow())
})

app.on('before-quit', () => {
  quitting = true
  if (clipboardHandle) {
    const handle = clipboardHandle
    clipboardHandle = null
    handle.close().catch(() => {})
  }
})

app.on('window-all-closed', () => {})
