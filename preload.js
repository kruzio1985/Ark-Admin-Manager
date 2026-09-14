// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// Derivative works must retain this license and link to: https://github.com/kruzio1985/Ark-Admin-Manager
// https://polyformproject.org/licenses/noncommercial/1.0.0/

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
