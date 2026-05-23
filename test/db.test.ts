import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'mvd-db-'));
process.env.MVD_HOME = TMP;

const {
  initDb,
  closeDb,
  upsertMovie,
  getMovie,
  addToWatchlist,
  removeFromWatchlist,
  listWatchlist,
  markWatched,
  unwatch,
  listWatched,
  cacheGenres,
  getGenreIdByName,
  genresStale,
  inWatchlist,
} = await import('../src/utils/db.ts');

test.after(() => {
  closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

test('upsert + get movie', () => {
  initDb();
  upsertMovie({ tmdb_id: 1, title: 'A', release_year: 2020, tmdb_rating: 7.5 });
  const m = getMovie(1);
  assert.equal(m?.title, 'A');
  assert.equal(m?.release_year, 2020);
});

test('upsert COALESCE preserves existing on partial update', () => {
  upsertMovie({ tmdb_id: 1, title: 'A', imdb_rating: 8.1 });
  const m = getMovie(1);
  assert.equal(m?.tmdb_rating, 7.5);
  assert.equal(m?.imdb_rating, 8.1);
});

test('watchlist add/remove + list ordering', () => {
  upsertMovie({ tmdb_id: 2, title: 'B', release_year: 2021, tmdb_rating: 8.0 });
  upsertMovie({ tmdb_id: 3, title: 'C', release_year: 2019, tmdb_rating: 9.0 });
  addToWatchlist(1);
  addToWatchlist(2);
  addToWatchlist(3);
  assert.ok(inWatchlist(2));
  const byRating = listWatchlist({ sort: 'rating' });
  assert.equal(byRating[0].tmdb_id, 3);
  removeFromWatchlist(2);
  assert.equal(inWatchlist(2), false);
});

test('add duplicate is idempotent', () => {
  addToWatchlist(1);
  addToWatchlist(1);
  const rows = listWatchlist();
  assert.equal(rows.filter((r) => r.tmdb_id === 1).length, 1);
});

test('markWatched removes from watchlist and stores record', () => {
  addToWatchlist(1);
  markWatched(1, 9, '2025-01-01', 'great');
  assert.equal(inWatchlist(1), false);
  const w = listWatched({ sort: 'date' });
  const row = w.find((r) => r.tmdb_id === 1);
  assert.equal(row?.user_rating, 9);
  assert.equal(row?.watched_date, '2025-01-01');
  assert.equal(row?.notes, 'great');
});

test('unwatch preserves history and returns to watchlist', async () => {
  markWatched(3, 8, '2025-02-01', null);
  unwatch(3);
  assert.ok(inWatchlist(3));
  const w = listWatched();
  assert.equal(w.find((r) => r.tmdb_id === 3), undefined);
  // history exists
  const { initDb: init } = await import('../src/utils/db.ts');
  const db = init();
  const hist = db.prepare('SELECT * FROM watched_history WHERE tmdb_id = ?').all(3);
  assert.equal(hist.length, 1);
});

test('genres cache + lookup', () => {
  cacheGenres([
    { id: 28, name: 'Action' },
    { id: 878, name: 'Science Fiction' },
  ]);
  assert.equal(getGenreIdByName('action'), 28);
  assert.equal(getGenreIdByName('Science Fiction'), 878);
  assert.equal(genresStale(), false);
});
