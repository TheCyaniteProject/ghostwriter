const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openExternalLink } = require('../external-links');

test('Ubuntu links use gio with an argument array', async () => {
  const calls = [];
  await openExternalLink('https://example.com/help', {
    platform: 'linux',
    commandRunner: async (command, args) => calls.push({ command, args }),
    openExternal: async () => assert.fail('Electron fallback should not run')
  });
  assert.deepEqual(calls, [{ command: 'gio', args: ['open', 'https://example.com/help'] }]);
});

test('Ubuntu links fall back from gio to xdg-open', async () => {
  const calls = [];
  await openExternalLink('https://example.com/issues', {
    platform: 'linux',
    commandRunner: async (command, args) => {
      calls.push({ command, args });
      if (command === 'gio') throw new Error('gio unavailable');
    },
    openExternal: async () => assert.fail('Electron fallback should not run')
  });
  assert.deepEqual(calls, [
    { command: 'gio', args: ['open', 'https://example.com/issues'] },
    { command: 'xdg-open', args: ['https://example.com/issues'] }
  ]);
});

test('Ubuntu links fall back to Electron when desktop commands fail', async () => {
  let opened;
  await openExternalLink('https://example.com/issues', {
    platform: 'linux',
    commandRunner: async () => { throw new Error('launcher unavailable'); },
    openExternal: async url => { opened = url; }
  });
  assert.equal(opened, 'https://example.com/issues');
});

test('external launcher rejects non-HTTPS URLs', async () => {
  await assert.rejects(openExternalLink('file:///etc/passwd', {
    platform: 'linux', commandRunner: async () => {}
  }), /secure web links/);
});
