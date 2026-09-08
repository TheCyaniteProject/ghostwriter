const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghostwriter', {
  platform: process.platform,
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  templates: () => ipcRenderer.invoke('project:templates'),
  openTemplate: (file) => ipcRenderer.invoke('project:template', file),
  newProject: () => ipcRenderer.invoke('project:new'),
  openProject: (file) => ipcRenderer.invoke('project:open', file),
  onProjectMenu: (callback) => ipcRenderer.on('project:home', callback),
  onSaveRequested: (callback) => ipcRenderer.on('project:request-save', (_event, mode) => callback(mode)),
  saveProject: (mode, project) => ipcRenderer.invoke('project:save', { mode, project }),
  onProjectLoaded: (callback) => ipcRenderer.on('project:loaded', (_event, project) => callback(project))
});
