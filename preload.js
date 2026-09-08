const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ghostwriter', {
  platform: process.platform
});
