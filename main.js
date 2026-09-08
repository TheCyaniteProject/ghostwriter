const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = process.argv.includes('--dev');
const frontendFiles = ['index.html', 'styles.css', 'renderer.js', 'preload.js'];
let projectPath = null;

function installMenu(win) {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('project:request-save', 'save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('project:request-save', 'save-as') },
        { label: 'Load…', accelerator: 'CmdOrCtrl+O', click: async () => {
          const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Ghostwriter Project', extensions: ['ghostwriter'] }, { name: 'JSON', extensions: ['json'] }] });
          if (result.canceled || !result.filePaths[0]) return;
          try {
            const raw = await fs.promises.readFile(result.filePaths[0], 'utf8');
            const project = JSON.parse(raw);
            projectPath = result.filePaths[0];
            win.webContents.send('project:loaded', project);
          } catch (error) {
            dialog.showErrorBox('Could not load project', error.message);
          }
        } },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' }
      ]
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    {
      label: 'Help',
      submenu: [
        { label: 'Github', click: () => shell.openExternal('https://github.com/TheCyaniteProject/ghostwriter') },
        { label: 'Report an Issue', click: () => shell.openExternal('https://github.com/TheCyaniteProject/ghostwriter/issues') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function watchFrontend(win) {
  if (!isDev) return;

  let reloadTimer;
  const watchers = frontendFiles.map((file) => {
    const filePath = path.join(__dirname, file);
    return fs.watch(filePath, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (!win.isDestroyed()) win.webContents.reloadIgnoringCache();
      }, 100);
    });
  });

  win.on('closed', () => {
    clearTimeout(reloadTimer);
    watchers.forEach((watcher) => watcher.close());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f1eee8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  watchFrontend(win);
  installMenu(win);
}

ipcMain.handle('project:save', async (_event, { mode, project }) => {
  let target = mode === 'save' ? projectPath : null;
  if (!target) {
    const result = await dialog.showSaveDialog({ defaultPath: 'Untitled.ghostwriter', filters: [{ name: 'Ghostwriter Project', extensions: ['ghostwriter'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    target = result.filePath.endsWith('.ghostwriter') ? result.filePath : `${result.filePath}.ghostwriter`;
  }
  try {
    await fs.promises.writeFile(target, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
    projectPath = target;
    return { canceled: false, path: target };
  } catch (error) {
    dialog.showErrorBox('Could not save project', error.message);
    return { canceled: true, error: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
