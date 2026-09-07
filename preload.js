/**
 * Ark Admin Manager — Preload Script
 * contextBridge: window.api.invoke + window controls
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Generic IPC invoke
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Window controls
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close: () => ipcRenderer.invoke('app:close'),
  isMaximized: () => ipcRenderer.invoke('app:isMaximized'),

  // Event listeners
  on: (event, callback) => {
    const validEvents = ['window:maximized', 'server:statusChanged', 'server:console', 'discord:message'];
    if (validEvents.includes(event)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(event, subscription);
      return () => ipcRenderer.removeListener(event, subscription);
    }
    return () => {};
  },
});
