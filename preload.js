const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghostwriter', {
  platform: process.platform,
  exportStory: (format, story) => ipcRenderer.invoke('story:export', { format, story }),
  importStyleGuide: () => ipcRenderer.invoke('project:import-style-guide'),
  llmConfig: () => ipcRenderer.invoke('llm:config'),
  llmKeyStatus: () => ipcRenderer.invoke('llm:key-status'),
  generateChapter: (request) => ipcRenderer.invoke('llm:generate', request),
  cancelGeneration: () => ipcRenderer.invoke('llm:cancel'),
  validateProject: (project) => { const error=ipcRenderer.sendSync('project:validate',project);if(error)throw new Error(error);return true; },
  autosave: (project) => ipcRenderer.sendSync('project:autosave', project),
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
