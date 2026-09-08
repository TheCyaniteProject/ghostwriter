const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghostwriter', {
  platform: process.platform,
  onSaveRequested: (callback) => ipcRenderer.on('project:request-save', (_event, mode) => callback(mode)),
  saveProject: (mode, project) => ipcRenderer.invoke('project:save', { mode, project }),
  onProjectLoaded: (callback) => ipcRenderer.on('project:loaded', (_event, project) => callback(project))
});
