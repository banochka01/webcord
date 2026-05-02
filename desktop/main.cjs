const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isDevUrl = Boolean(process.env.WEBCORD_DESKTOP_URL);
const fallbackIcon = nativeImage.createFromDataURL(
  'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="18" fill="#5865f2"/>
        <path d="M18 22c7-5 21-5 28 0 3 8 3 15 0 22-6 3-22 3-28 0-3-7-3-14 0-22Z" fill="white" opacity=".95"/>
        <circle cx="26" cy="34" r="3" fill="#5865f2"/>
        <circle cx="38" cy="34" r="3" fill="#5865f2"/>
      </svg>
    `)
);
const iconPath = path.join(__dirname, 'build', 'icon.png');
const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : fallbackIcon;
const trayIcon = appIcon.isEmpty() ? fallbackIcon : appIcon;

let mainWindow;
let tray;

function getFrontendEntry() {
  if (process.env.WEBCORD_DESKTOP_URL) return process.env.WEBCORD_DESKTOP_URL;
  if (app.isPackaged) return path.join(process.resourcesPath, 'frontend', 'index.html');
  return path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
}

function sendWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    show: false,
    title: 'WebCord',
    backgroundColor: '#111318',
    autoHideMenuBar: true,
    icon: trayIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);

  const entry = getFrontendEntry();
  if (isDevUrl) {
    mainWindow.loadURL(entry);
  } else {
    mainWindow.loadFile(entry);
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.on('focus', () => mainWindow.webContents.send('window:focus', true));
  mainWindow.on('blur', () => mainWindow.webContents.send('window:focus', false));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['notifications', 'media', 'display-capture'].includes(permission));
  });
}

function createTray() {
  tray = new Tray(trayIcon);
  tray.setToolTip('WebCord');
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  sendWindowState();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('app:notify', (_event, payload = {}) => {
  if (!Notification.isSupported()) return false;
  new Notification({
    title: payload.title || 'WebCord',
    body: payload.body || '',
    icon: trayIcon
  }).show();
  return true;
});
