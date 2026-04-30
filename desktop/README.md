# WebCord Desktop

Electron shell for the existing WebCord frontend.

## Run

```bash
npm install
npm --prefix ../frontend run build
npm start
```

For live frontend development:

```bash
npm --prefix ../frontend run dev
npm run dev
```

## Build Windows

```bash
npm run build
```

The shell uses a frameless BrowserWindow, the React titlebar, native window controls through preload IPC, notification permission handling, and a tray entry.
