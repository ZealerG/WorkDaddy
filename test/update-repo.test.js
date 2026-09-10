'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const daemon = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'daemon.js'), 'utf8');
const start = daemon.indexOf('const UPDATE_REPO_FILE =');
const end = daemon.indexOf('const UPDATE_CHECK_INTERVAL =', start);
assert.ok(start >= 0 && end > start, 'the updater must retain persistent fork repository selection');
const resolve = new Function('fs', 'path', 'process', 'DATA_DIR',
  daemon.slice(start, end) + '\nreturn { repo: UPDATE_REPO, api: UPDATE_API };');

function resolveRepo(envRepo, readFileSync) {
  return resolve({ readFileSync }, path, { env: { WBSWITCH_UPDATE_REPO: envRepo } },
    path.join('fixture', 'data'));
}

test('update repository environment override takes priority over the saved fork', () => {
  const result = resolveRepo('example/override', () => {
    assert.fail('environment override must not read the saved repository');
  });
  assert.equal(result.repo, 'example/override');
  assert.equal(result.api, 'https://api.github.com/repos/example/override/releases/latest');
});

test('updater reads the trimmed fork repository from the persistent data directory', () => {
  const result = resolveRepo('', (file, encoding) => {
    assert.equal(file, path.join('fixture', 'data', 'update-repo.json'));
    assert.equal(encoding, 'utf8');
    return JSON.stringify({ repo: '  ZealerG/WorkDaddy  ' });
  });
  assert.equal(result.repo, 'ZealerG/WorkDaddy');
  assert.equal(result.api, 'https://api.github.com/repos/ZealerG/WorkDaddy/releases/latest');
});

test('missing or invalid saved repository falls back to upstream', () => {
  for (const contents of [undefined, 'invalid JSON', 'null', '{}', '{"repo":42}', '{"repo":"  "}']) {
    const result = resolveRepo(undefined, () => {
      if (contents === undefined) throw Object.assign(new Error('missing fixture'), { code: 'ENOENT' });
      return contents;
    });
    assert.equal(result.repo, 'babygoton/WorkDaddy');
    assert.equal(result.api, 'https://api.github.com/repos/babygoton/WorkDaddy/releases/latest');
  }
});
