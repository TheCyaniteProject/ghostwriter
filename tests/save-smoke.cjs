const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.commandLine.appendSwitch('disable-gpu');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostwriter-save-ipc-'));
app.setPath('userData', path.join(directory, 'user-data'));
let dialogCalls = 0;
let dialogPath = directory;
dialog.showSaveDialog = async () => { dialogCalls++; return { canceled: false, filePath: dialogPath }; };
dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };

require('../main');

app.whenReady().then(async () => {
  try {
    let win;
    for (let attempt = 0; attempt < 100; attempt++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading()) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (!win) throw new Error('Application window was not created.');
    await win.webContents.executeJavaScript(`(() => {
      nodes=[];connections=[];sourceArcId=null;styleGuide='';nextId=1;content.replaceChildren();
      document.querySelector('.document-title input').value='IPC Save Test';
      addNode('arc',40,40,{title:'Saved Arc'});enterProject();
    })()`);
    win.webContents.send('project:request-save', 'save');
    const expected = path.join(directory, 'ipc-save-test.ghostwriter');
    for (let attempt = 0; attempt < 100 && !fs.existsSync(expected); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (!fs.existsSync(expected)) throw new Error('Save request completed without creating a project file.');
    const saved = JSON.parse(fs.readFileSync(expected, 'utf8'));
    if (saved.title !== 'IPC Save Test' || saved.nodes[0]?.title !== 'Saved Arc') {
      throw new Error('Saved project contents did not match renderer state.');
    }
    const assert = require('node:assert/strict');
    const loadedPath = path.join(directory, 'chosen-filename.ghostwriter');
    fs.writeFileSync(loadedPath, JSON.stringify(saved));
    await win.webContents.executeJavaScript(`window.ghostwriter.openProject(${JSON.stringify(loadedPath)})`);
    // The project:loaded event precedes this renderer call on the same channel.
    const beforeAutosave = fs.readFileSync(loadedPath, 'utf8');
    const backupResult = await win.webContents.executeJavaScript(`(() => {
      document.querySelector('.document-title input').value='A different title';
      return autosaveCurrent();
    })()`);
    assert.equal(backupResult.path, loadedPath + '.bak');
    assert.equal(await win.webContents.executeJavaScript('document.title'), 'Ghostwriter - A different title *Unsaved', 'backup does not clear the unsaved marker');
    assert.equal(fs.readFileSync(loadedPath, 'utf8'), beforeAutosave, 'autosave preserves the primary file');
    assert.equal(JSON.parse(fs.readFileSync(loadedPath + '.bak', 'utf8')).title, 'A different title');
    const callsBeforeSave = dialogCalls;
    const saveResult = await win.webContents.executeJavaScript(`window.ghostwriter.saveProject('save',serializeProject())`);
    assert.equal(saveResult.path, loadedPath, 'Save reuses the loaded filename');
    assert.equal(dialogCalls, callsBeforeSave, 'Save does not open a new dialog');
    assert.equal(JSON.parse(fs.readFileSync(loadedPath, 'utf8')).title, 'A different title');
    win.webContents.send('project:request-save', 'save');
    for(let attempt=0;attempt<100;attempt++){
      if(await win.webContents.executeJavaScript('document.title')==='Ghostwriter - A different title')break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(await win.webContents.executeJavaScript('document.title'), 'Ghostwriter - A different title', 'manual save clears the marker');
    dialogPath = path.join(directory, 'save-as-name.ghostwriter');
    const saveAsResult = await win.webContents.executeJavaScript(`window.ghostwriter.saveProject('save-as',serializeProject())`);
    assert.equal(saveAsResult.path, dialogPath);
    const nextBackup = await win.webContents.executeJavaScript(`window.ghostwriter.autosave(serializeProject())`);
    assert.equal(nextBackup.path, dialogPath + '.bak', 'autosave follows the Save As destination');
    assert.ok(fs.existsSync(nextBackup.path));
    console.log('Save smoke passed: disk write, backup isolation, loaded filename retention, Save As destination');
    win.destroy();
    fs.rmSync(directory, { recursive: true });
    app.exit(0);
  } catch (error) {
    console.error(error);
    BrowserWindow.getAllWindows().forEach(win => win.destroy());
    fs.rmSync(directory, { recursive: true, force: true });
    app.exit(1);
  }
});
