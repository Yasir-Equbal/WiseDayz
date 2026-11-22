'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisedayzUpdater', Object.freeze({
  checkForUpdates: () => ipcRenderer.invoke('wisedayz-updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('wisedayz-updater:download'),
  installUpdate: () => ipcRenderer.invoke('wisedayz-updater:install')
}));
