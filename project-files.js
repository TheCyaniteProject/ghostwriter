const fs = require('node:fs');
const path = require('node:path');

function projectFilename(title) {
  const name = (title || 'Untitled').trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 100) || 'untitled';
  return `${name}.ghostwriter`;
}

async function resolveSaveTarget(selectedPath, title) {
  let target = selectedPath;
  try {
    if ((await fs.promises.stat(target)).isDirectory()) {
      target = path.join(target, projectFilename(title));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return target.toLowerCase().endsWith('.ghostwriter') ? target : `${target}.ghostwriter`;
}

async function writeProjectAtomically(target, project) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`
  );
  let handle;
  try {
    handle = await fs.promises.open(temporary, 'wx');
    await handle.writeFile(`${JSON.stringify(project, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.promises.rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.promises.unlink(temporary).catch(() => {});
    throw error;
  }
}

module.exports = { projectFilename, resolveSaveTarget, writeProjectAtomically };
