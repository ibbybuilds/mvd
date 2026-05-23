import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'mvd-genres-'));
process.env.MVD_HOME = TMP;

const { cacheGenres, closeDb } = await import('../src/utils/db.ts');
const { resolveGenreName, parseGenreSpec } = await import('../src/utils/genres.ts');

cacheGenres([
  { id: 28, name: 'Action' },
  { id: 878, name: 'Science Fiction' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
]);

test.after(() => {
  closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

test('exact match', () => {
  assert.equal(resolveGenreName('Action'), 28);
});

test('case insensitive', () => {
  assert.equal(resolveGenreName('action'), 28);
});

test('substring (sci-fi → Science Fiction)', () => {
  assert.equal(resolveGenreName('science'), 878);
});

test('fuzzy (Levenshtein ≤ 2)', () => {
  assert.equal(resolveGenreName('comdy'), 35);
});

test('unknown returns null', () => {
  assert.equal(resolveGenreName('xyzzyqq'), null);
});

test('parseGenreSpec AND', () => {
  const r = parseGenreSpec('Action,Comedy');
  assert.equal(r.withGenres, '28,35');
  assert.deepEqual(r.unresolved, []);
});

test('parseGenreSpec OR', () => {
  const r = parseGenreSpec('Action|Drama');
  assert.equal(r.withGenres, '28|18');
});

test('parseGenreSpec unresolved', () => {
  const r = parseGenreSpec('Action,Nonsense');
  assert.deepEqual(r.unresolved, ['Nonsense']);
});
