import { contextBridge, ipcRenderer } from 'electron';

const api = {
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    platform: (): Promise<string> => ipcRenderer.invoke('app:platform'),
  },

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  },

  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItemInFolder', path),
  },

  updater: {
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    onUpdateAvailable: (cb: () => void) => {
      ipcRenderer.on('updater:update-available', cb);
      return () => ipcRenderer.removeListener('updater:update-available', cb);
    },
    onUpdateDownloaded: (cb: () => void) => {
      ipcRenderer.on('updater:update-downloaded', cb);
      return () => ipcRenderer.removeListener('updater:update-downloaded', cb);
    },
  },
} as const;

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
