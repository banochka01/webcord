const path = require('path');
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, Notification } = require('electron');

const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAqMBgWlAbI8AAAAASUVORK5CYII=');
let win;
let tray;
const WEBCORD_URL = process.env.WEBCORD_DESKTOP_URL || 'https://webcordes.ru';

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Webcord Desktop',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL(WEBCORD_URL).catch(() => {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  });

  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'display-capture'].includes(permission));
  });
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
