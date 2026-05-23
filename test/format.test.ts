import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFormat } from '../src/utils/output.ts';

test('resolveFormat: explicit passthrough', () => {
  assert.equal(resolveFormat('json'), 'json');
  assert.equal(resolveFormat('yaml'), 'yaml');
  assert.equal(resolveFormat('table'), 'table');
});

test('resolveFormat: auto + non-TTY = yaml', () => {
  const orig = process.stdout.isTTY;
  (process.stdout as any).isTTY = false;
  try {
    assert.equal(resolveFormat('auto'), 'yaml');
  } finally {
    (process.stdout as any).isTTY = orig;
  }
});

test('resolveFormat: auto + TTY = table', () => {
  const orig = process.stdout.isTTY;
  (process.stdout as any).isTTY = true;
  try {
    assert.equal(resolveFormat('auto'), 'table');
  } finally {
    (process.stdout as any).isTTY = orig;
  }
});
