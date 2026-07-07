import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const isDev = !app.isPackaged;
const DASHBOARD_URL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../renderer/index.html')}`;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.loadURL(DASHBOARD_URL).catch((err) => {
    console.error('[Main] Failed to load URL:', err);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function makeTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '../../resources/icon-16.png');
  const fromFile = nativeImage.createFromPath(iconPath);
  if (!fromFile.isEmpty()) return fromFile;

  // Fallback: 16×16 purple pixel buffer so tray doesn't show a blank/missing icon in dev
  const size = 16;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4 + 0] = 109; // R (purple)
    rgba[i * 4 + 1] = 40;  // G
    rgba[i * 4 + 2] = 217; // B
    rgba[i * 4 + 3] = 255; // A
  }
  return nativeImage.createFromBuffer(rgba, { width: size, height: size });
}

function createTray(): void {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Wanted AI Studio');

  const menu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow?.show());
}

function startServer(): void {
  if (isDev) return; // dev uses separate server process

  const serverPath = path.join(process.resourcesPath, 'server', 'index.js');
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[Server]', data.toString().trim());
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[Server]', data.toString().trim());
  });

  serverProcess.on('exit', (code) => {
    console.log('[Server] exited with code', code);
  });
}

// IPC handlers
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  const allowedProtocols = ['https:', 'http:'];
  const parsed = new URL(url);
  if (allowedProtocols.includes(parsed.protocol)) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => {
  shell.showItemInFolder(filePath);
});

// App lifecycle
app.whenReady().then(() => {
  startServer();
  createWindow();
  createTray();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  serverProcess?.kill();
  tray?.destroy();
});

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('updater:update-available');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('updater:update-downloaded');
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall();
});
