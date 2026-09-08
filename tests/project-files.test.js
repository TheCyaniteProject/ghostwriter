const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { projectFilename, resolveSaveTarget, writeProjectAtomically } = require('../project-files');

test('project filenames are safe and always use the project extension', () => {
  assert.equal(projectFilename(' My Story! '), 'my-story_.ghostwriter');
  assert.equal(projectFilename(''), 'untitled.ghostwriter');
});

test('a selected directory resolves to a project file inside it', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ghostwriter-save-'));
  try {
    assert.equal(await resolveSaveTarget(directory, 'My Story'), path.join(directory, 'my-story.ghostwriter'));
    assert.equal(await resolveSaveTarget(path.join(directory, 'custom'), 'Ignored'), path.join(directory, 'custom.ghostwriter'));
    assert.equal(await resolveSaveTarget(path.join(directory, 'CUSTOM.GHOSTWRITER'), 'Ignored'), path.join(directory, 'CUSTOM.GHOSTWRITER'));
  } finally {
    await fs.promises.rm(directory, { recursive: true });
  }
});

test('atomic project writes replace the destination and leave no temporary file', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ghostwriter-write-'));
  const target = path.join(directory, 'story.ghostwriter');
  try {
    await fs.promises.writeFile(target, 'old');
    await writeProjectAtomically(target, { format: 'ghostwriter', version: 1 });
    assert.deepEqual(JSON.parse(await fs.promises.readFile(target, 'utf8')), { format: 'ghostwriter', version: 1 });
    assert.deepEqual(await fs.promises.readdir(directory), ['story.ghostwriter']);
  } finally {
    await fs.promises.rm(directory, { recursive: true });
  }
});
