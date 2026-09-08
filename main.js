const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require('electron');
nativeTheme.themeSource = 'dark';
const path = require('node:path');
const fs = require('node:fs');
const llm = require('./llm');
const { projectFilename, resolveSaveTarget, writeProjectAtomically } = require('./project-files');
const generations = new Map();
ipcMain.handle('project:import-style-guide', async (event) => {
  const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{
    title:'Import Style Guide',properties:['openFile'],filters:[{name:'Text or Markdown',extensions:['txt','md']}]
  });
  if(result.canceled)return {canceled:true};
  try{
    const file=result.filePaths[0];
    if(!['.txt','.md'].includes(path.extname(file).toLowerCase()))throw new Error('Choose a .txt or .md file.');
    if((await fs.promises.stat(file)).size>800000)throw new Error('The Style Guide file is too large.');
    const text=(await fs.promises.readFile(file,'utf8')).replace(/^\uFEFF/,'');
    if(text.length>200000)throw new Error('The Style Guide exceeds 200,000 characters.');
    return {text};
  }catch(error){return {error:error.message};}
});
ipcMain.handle('llm:config', () => llm.publicConfig());
ipcMain.handle('llm:key-status', () => llm.keyStatus());
ipcMain.handle('llm:cancel', (event) => generations.get(event.sender.id)?.abort());
ipcMain.handle('llm:generate', async (event, request) => {
  if(generations.has(event.sender.id))return {error:'A chapter is already being generated.'};
  const controller=new AbortController();generations.set(event.sender.id,controller);
  const timer=setTimeout(()=>controller.abort(),180000);
  try{return await llm.generate(request,{signal:controller.signal});}
  catch(error){return {error:controller.signal.aborted?'Generation cancelled or timed out.':error.message};}
  finally{clearTimeout(timer);generations.delete(event.sender.id);}
});
const { validateProject } = require('./project-validation');

const isDev = process.argv.includes('--dev');
const frontendFiles = ['index.html', 'styles.css', 'renderer.js', 'studio.js', 'style-guide.js', 'preload.js'];
let projectPath = null;
ipcMain.on('project:validate', (event, project) => {
  try { validateProject(project);event.returnValue=null; } catch(error){event.returnValue=error.message;}
});
function isTemplate(file) {
  return file && templateDirs().some(dir => { const relative=path.relative(dir,file);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative); });
}
ipcMain.on('project:autosave', (event, project) => {
  try {
    if (!projectPath || isTemplate(projectPath)) { event.returnValue={saved:false}; return; }
    validateProject(project);
    const temporary=projectPath+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(project,null,2)+'\n');
    fs.renameSync(temporary,projectPath);
    event.returnValue={saved:true};
  } catch(error) { event.returnValue={saved:false,error:error.message}; }
});
async function prepareChange(sender) {
  return sender.executeJavaScript('window.prepareProjectChange ? window.prepareProjectChange() : true');
}
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
    validateProject(project);
    if (!await prepareChange(event.sender)) return;
    projectPath = null;
    event.sender.send('project:loaded', project);
  } catch (error) { dialog.showErrorBox('Could not open template', error.message); }
});
const recentPath = () => path.join(app.getPath('userData'), 'recent-projects.json');
function recentProjects() {
  try {
    const recent = JSON.parse(fs.readFileSync(recentPath(), 'utf8'));
    return Array.isArray(recent) ? recent.filter(item => item && typeof item.path === 'string' && typeof item.title === 'string') : [];
  } catch { return []; }
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
    validateProject(project);
    if (!await prepareChange(win.webContents)) return;
    if (project.format !== 'ghostwriter' || !Array.isArray(project.nodes) || !Array.isArray(project.connections)) throw new Error('Invalid Ghostwriter project.');
    projectPath = file;
    await rememberProject(file, project);
    win.webContents.send('project:loaded', project);
  } catch (error) { dialog.showErrorBox('Could not load project', error.message); }
}
ipcMain.handle('project:recent', () => recentProjects());
ipcMain.handle('project:new', async (event) => { if(!await prepareChange(event.sender))return false;projectPath = null;return true; });
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
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Unsaved changes',
      message: 'This project has changes that have not been saved.',
      detail: 'Choose Cancel to return and save your work, or Discard Changes to continue.',
      buttons: ['Cancel', 'Discard Changes'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    // In Electron, preventing this event allows the blocked unload to proceed.
    if (choice === 1) event.preventDefault();
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  watchFrontend(win);
  installMenu(win);
}

ipcMain.handle('project:save', async (_event, { mode, project }) => {
  try {
    validateProject(project);
    if (mode === 'template') {
      const directory = templateDirs()[1];
      await fs.promises.mkdir(directory, { recursive: true });
      const name = (project.title || 'Untitled').replace(/[^a-z0-9 _-]/gi, '_').slice(0, 100);
      let target = path.join(directory, name + '.ghostwriter');
      for (let suffix = 2; fs.existsSync(target); suffix++) target = path.join(directory, name + ' (' + suffix + ').ghostwriter');
      await fs.promises.writeFile(target, JSON.stringify(project, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      await dialog.showMessageBox({ type: 'info', message: 'Template saved', detail: target });
      return { canceled: false, path: target };
    }
    // Save on a new project (including a template copy) is Save As.
    const useSaveAs = mode === 'save-as' || !projectPath || isTemplate(projectPath);
    let target = useSaveAs ? null : projectPath;
    if (useSaveAs) {
      const filename = projectFilename(project.title);
      const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(_event.sender), {
        title: 'Save Project As',
        defaultPath: projectPath && !isTemplate(projectPath) ? path.join(path.dirname(projectPath), filename) : filename,
        filters: [{ name: 'Ghostwriter Project', extensions: ['ghostwriter'] }]
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      target = await resolveSaveTarget(result.filePath, project.title);
    }
    await writeProjectAtomically(target, project);
    projectPath = target;
    try { await rememberProject(target, project); } catch { /* The project is saved even if recent-project metadata fails. */ }
    return { canceled: false, path: target };
  } catch (error) {
    dialog.showErrorBox(mode === 'template' ? 'Could not save template' : 'Could not save project', error.message);
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
