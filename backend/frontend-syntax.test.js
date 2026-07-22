const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('mysql-utils.js tiene sintaxis valida como modulo', () => {
  const filePath = path.join(__dirname, '..', 'mysql-utils.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

