const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopNative', {
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_event, key) => cb(key)),
  notify: (title, body) => ipcRenderer.send('notify', { title, body })
});
