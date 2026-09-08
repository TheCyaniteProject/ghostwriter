const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.commandLine.appendSwitch('disable-gpu');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostwriter-save-ipc-'));
dialog.showSaveDialog = async () => ({ canceled: false, filePath: directory });
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
    console.log(`Save smoke passed: ${expected}`);
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
