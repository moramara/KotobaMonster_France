'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAll } = require('../scripts/check_syntax.js');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('構文: data / src / scripts / tests のすべての .js が構文エラーなく読める(新しいファイルも自動で対象)', () => {
  const r = checkAll();
  assert.deepEqual(r.bad, []);
  assert.ok(r.checked >= 30, '対象のファイル数: ' + r.checked);
});
test('構文: 構文エラーのあるファイルを検出する(検査自体が機能している)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syn-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'ok.js'), '#!/usr/bin/env node\nconst a = 1;\n');
  fs.writeFileSync(path.join(root, 'src', 'ng.js'), 'const = ;\n');
  const r = checkAll(root);
  assert.equal(r.checked, 2);
  assert.deepEqual(
    r.bad.map(b => b.file),
    [path.join('src', 'ng.js')]
  );
});
