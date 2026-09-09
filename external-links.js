const { execFile } = require('node:child_process');

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10000 }, (error, _stdout, stderr) => {
      if (!error) return resolve();
      const detail = stderr?.trim();
      reject(new Error(detail ? `${error.message}: ${detail}` : error.message));
    });
  });
}

async function openExternalLink(url, { platform = process.platform, openExternal, commandRunner = runCommand } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only secure web links can be opened.');

  // KDE's xdg-open path can report success without launching the registered
  // browser. GLib talks to the MIME association directly and works across the
  // Ubuntu GNOME and KDE/Plasma desktop variants.
  if (platform === 'linux') {
    try {
      await commandRunner('gio', ['open', parsed.href]);
      return;
    } catch (gioError) {
      try {
        await commandRunner('xdg-open', [parsed.href]);
        return;
      } catch (xdgError) {
        if (typeof openExternal !== 'function') {
          throw new Error(`Browser launch failed. gio: ${gioError.message}; xdg-open: ${xdgError.message}`);
        }
      }
    }
  }
  if (typeof openExternal !== 'function') throw new Error('No browser launcher is available.');
  await openExternal(parsed.href);
}

module.exports = { openExternalLink };
