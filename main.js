const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = process.argv.includes('--dev');
const frontendFiles = ['index.html', 'styles.css', 'renderer.js', 'preload.js'];
let projectPath = null;
const templateDirs = () => [path.join(__dirname, 'templates'), path.join(app.getPath('home'), 'Ghostwriter', 'Templates')];
async function listTemplates() {
  const templates = [];
  for (const directory of templateDirs()) {
    let files;
    try { files = await fs.promises.readdir(directory); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const file of files.sort()) {
      if (!file.endsWith('.ghostwriter')) continue;
      try {
        const project = JSON.parse(await fs.promises.readFile(path.join(directory, file), 'utf8'));
        if (project.format === 'ghostwriter' && Array.isArray(project.nodes) && Array.isArray(project.connections))
          templates.push({ path: path.join(directory, file), title: project.title || file, description: project.description || 'Saved project template' });
      } catch { /* Ignore unrelated or invalid template files. */ }
    }
  }
  return templates;
}
ipcMain.handle('project:templates', listTemplates);
ipcMain.handle('project:template', async (event, file) => {
  try {
    if (!(await listTemplates()).some(template => template.path === file)) throw new Error('Template is no longer available.');
    const project = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    projectPath = null;
    event.sender.send('project:loaded', project);
  } catch (error) { dialog.showErrorBox('Could not open template', error.message); }
});
const recentPath = () => path.join(app.getPath('userData'), 'recent-projects.json');
function recentProjects() {
  try { return JSON.parse(fs.readFileSync(recentPath(), 'utf8')); } catch { return []; }
}
async function rememberProject(file, project) {
  const recent = [{ path: file, title: project.title || path.basename(file), openedAt: new Date().toISOString() },
    ...recentProjects().filter(item => item.path !== file)].slice(0, 12);
  await fs.promises.mkdir(app.getPath('userData'), { recursive: true });
  await fs.promises.writeFile(recentPath(), JSON.stringify(recent, null, 2));
}
async function openProject(win, file) {
  if (!file) {
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Ghostwriter Project', extensions: ['ghostwriter'] }] });
    if (result.canceled) return;
    file = result.filePaths[0];
  }
  try {
    const project = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (project.format !== 'ghostwriter' || !Array.isArray(project.nodes) || !Array.isArray(project.connections)) throw new Error('Invalid Ghostwriter project.');
    projectPath = file;
    await rememberProject(file, project);
    win.webContents.send('project:loaded', project);
  } catch (error) { dialog.showErrorBox('Could not load project', error.message); }
}
ipcMain.handle('project:recent', () => recentProjects());
ipcMain.handle('project:new', () => { projectPath = null; });
ipcMain.handle('project:open', (event, file) => openProject(BrowserWindow.fromWebContents(event.sender), file));

function installMenu(win) {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Project Menu', click: () => win.webContents.send('project:home') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('project:request-save', 'save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('project:request-save', 'save-as') },
        { label: 'Save as Template', click: () => win.webContents.send('project:request-save', 'template') },
        { label: 'Load…', accelerator: 'CmdOrCtrl+O', click: () => openProject(win) },
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
  if (mode === 'template') {
    try {
      const directory = templateDirs()[1];
      await fs.promises.mkdir(directory, { recursive: true });
      const name = (project.title || 'Untitled').replace(/[^a-z0-9 _-]/gi, '_').slice(0, 100);
      let target = path.join(directory, name + '.ghostwriter');
      for (let suffix = 2; fs.existsSync(target); suffix++) target = path.join(directory, name + ' (' + suffix + ').ghostwriter');
      await fs.promises.writeFile(target, JSON.stringify(project, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      await dialog.showMessageBox({ type: 'info', message: 'Template saved', detail: target });
      return { canceled: false, path: target };
    } catch (error) {
      dialog.showErrorBox('Could not save template', error.message);
      return { canceled: true, error: error.message };
    }
  }
  let target = mode === 'save' ? projectPath : null;
  if (!target) {
    const result = await dialog.showSaveDialog({ defaultPath: 'Untitled.ghostwriter', filters: [{ name: 'Ghostwriter Project', extensions: ['ghostwriter'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    target = result.filePath.endsWith('.ghostwriter') ? result.filePath : `${result.filePath}.ghostwriter`;
  }
  try {
    await fs.promises.writeFile(target, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
    projectPath = target;
    await rememberProject(target, project);
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
