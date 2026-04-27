const path = require('path');
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, Notification } = require('electron');

const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAqMBgWlAbI8AAAAASUVORK5CYII=');
let win;
let tray;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Webcord Desktop',
    backgroundColor: '#0b0a12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function setupTray() {
  tray = new Tray(icon);
  tray.setToolTip('Webcord Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => win?.show() },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

app.whenReady().then(() => {
  createWindow();
  setupTray();

  globalShortcut.register('CommandOrControl+K', () => {
    win?.webContents.send('shortcut', 'quick-switcher');
  });
  globalShortcut.register('CommandOrControl+/', () => {
    win?.webContents.send('shortcut', 'hotkeys');
  });
  globalShortcut.register('Escape', () => {
    win?.webContents.send('shortcut', 'escape');
  });
});

ipcMain.on('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
