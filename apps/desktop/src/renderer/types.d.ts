import type { ElectronAPI } from '../preload/preload.js';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
