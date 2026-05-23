import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'mvd-cli-'));
const CLI = join(process.cwd(), 'dist', 'cli.js');

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync('node', [CLI, ...args], {
    env: { ...process.env, MVD_HOME: TMP, ...env },
    encoding: 'utf-8',
  });
}

test.after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

test('--version prints version', () => {
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\d+\.\d+\.\d+/);
});

test('--help prints commands', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /discover/);
  assert.match(r.stdout, /watched/);
  assert.match(r.stdout, /add/);
});

test('missing TMDB key on discover → exit 3', () => {
  const r = run(['discover'], { TMDB_API_KEY: '' });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /mvd init/);
});

test('non-numeric id on info → exit 1', () => {
  const r = run(['info', 'abc'], { TMDB_API_KEY: 'fake' });
  assert.equal(r.status, 1);
});
