/*
 * Cabinet Analysis Pro — Electron main process.
 *
 * The app is a fully local, offline desktop application:
 *   - the renderer is the built web bundle (apps/web/dist, copied to app/),
 *   - all data lives in the browser storage of the app's own profile directory,
 *   - no remote content is loaded, no network calls are made by the shell.
 */
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged && process.env.CAP_DEV === '1';

function rendererEntry() {
  const packaged = path.join(__dirname, 'app', 'index.html');
  if (fs.existsSync(packaged)) return packaged;
  // development fallback: the web build output
  return path.join(__dirname, '..', 'web', 'dist', 'index.html');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0e11',
    show: false,
    autoHideMenuBar: true,
    title: 'Cabinet Analysis Pro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  const entry = rendererEntry();
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox(
      'Cabinet Analysis Pro',
      'Application files were not found.\nRun "npm run build:web" before starting the desktop app.',
    );
    app.quit();
    return;
  }

  win.loadFile(entry);

  // Open external links in the OS browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

function buildMenu() {
  const template = [
    {
      label: 'پرونده',
      submenu: [
        { label: 'چاپ / خروجی PDF', accelerator: 'CmdOrCtrl+P', click: (_i, w) => w && w.webContents.print() },
        { type: 'separator' },
        { role: 'quit', label: 'خروج' },
      ],
    },
    {
      label: 'نمایش',
      submenu: [
        { role: 'reload', label: 'بارگذاری مجدد' },
        { role: 'resetZoom', label: 'اندازهٔ اصلی' },
        { role: 'zoomIn', label: 'بزرگ‌نمایی' },
        { role: 'zoomOut', label: 'کوچک‌نمایی' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'تمام‌صفحه' },
        ...(isDev ? [{ role: 'toggleDevTools', label: 'ابزار توسعه' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
