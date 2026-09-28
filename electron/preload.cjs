const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('codepasteDesktop', {
  isDesktop: true,
  onMenuAction(handler) {
    const listener = (_event, action) => handler(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },
  openExternal(url) {
    return ipcRenderer.invoke('shell:openExternal', url)
  },
  setLocale(locale) {
    return ipcRenderer.invoke('shell:setLocale', locale)
  },
  // 主进程网络代理（AI 翻译用）；返回 { ok, status, text } 的 Response 近似对象
  netFetch(url, init) {
    return ipcRenderer.invoke('net:fetch', url, init)
  },
  writeRtf(payload) {
    return ipcRenderer.invoke('clipboard:writeRtf', payload)
  }
})
