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
  writeRtf(payload) {
    return ipcRenderer.invoke('clipboard:writeRtf', payload)
  }
})
