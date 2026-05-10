const { contextBridge, ipcRenderer } = require('electron');

const windowApi = {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  toggleMaximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
  setBadge: (count) => ipcRenderer.invoke('app:set-badge', count),
  onDeepLink: (callback) => {
    const listener = (_event, value) => callback(String(value || ''));
    ipcRenderer.on('app:deep-link', listener);
    return () => ipcRenderer.removeListener('app:deep-link', listener);
  },
  onMaximizedChange: (callback) => {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('window:maximized', listener);
    return () => ipcRenderer.removeListener('window:maximized', listener);
  },
  onFocusChange: (callback) => {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('window:focus', listener);
    return () => ipcRenderer.removeListener('window:focus', listener);
  }
};

contextBridge.exposeInMainWorld('webcordDesktop', windowApi);
contextBridge.exposeInMainWorld('webcordWindow', windowApi);
