import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HOME_A = mkdtempSync(join(tmpdir(), 'mvd-sync-a-'));
const HOME_B = mkdtempSync(join(tmpdir(), 'mvd-sync-b-'));
const CLI = join(process.cwd(), 'dist', 'cli.js');

function mvd(home: string, args: string[]) {
  const r = spawnSync('node', [CLI, ...args], {
    env: { ...process.env, MVD_HOME: home, TMDB_API_KEY: 'fake', OMDB_API_KEY: 'fake' },
    encoding: 'utf-8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test.after(() => {
  rmSync(HOME_A, { recursive: true, force: true });
  rmSync(HOME_B, { recursive: true, force: true });
});

test('export of empty db is valid JSON', () => {
  const r = mvd(HOME_A, ['export', '--format', 'json']);
  assert.equal(r.code, 0);
  const p = JSON.parse(r.out);
  assert.equal(p.mvd_version, 1);
  assert.deepEqual(p.movies, []);
  assert.deepEqual(p.watchlist, []);
});

test('export + import roundtrip preserves state', async () => {
  // seed HOME_A via direct db access
  process.env.MVD_HOME = HOME_A;
  const { initDb, upsertMovie, addToWatchlist, markWatched, unwatch, closeDb } = await import('../src/utils/db.ts');
  initDb();
  upsertMovie({ tmdb_id: 100, title: 'Alpha', release_year: 2001, tmdb_rating: 8.0, imdb_rating: 7.9 });
  upsertMovie({ tmdb_id: 200, title: 'Beta', release_year: 2002, tmdb_rating: 7.5 });
  addToWatchlist(100);
  markWatched(200, 9, '2025-01-15', 'great');
  // unwatch to create history row
  unwatch(200);
  markWatched(200, 10, '2025-06-01', 'rewatched');
  closeDb();

  const exportPath = join(HOME_A, 'snap.json');
  const r1 = mvd(HOME_A, ['export', '--format', 'json', '--out', exportPath]);
  assert.equal(r1.code, 0);

  const r2 = mvd(HOME_B, ['import', exportPath]);
  assert.equal(r2.code, 0);

  // Verify HOME_B has same state
  process.env.MVD_HOME = HOME_B;
  const dbMod = await import('../src/utils/db.ts');
  // Force re-open against HOME_B
  dbMod.closeDb();
  const db = dbMod.initDb();
  const movies = db.prepare('SELECT * FROM movies ORDER BY tmdb_id').all() as any[];
  assert.equal(movies.length, 2);
  assert.equal(movies[0].title, 'Alpha');
  assert.equal(movies[1].imdb_rating, null);

  const watchlist = db.prepare('SELECT * FROM watchlist').all() as any[];
  assert.equal(watchlist.length, 1);
  assert.equal(watchlist[0].tmdb_id, 100);

  const watched = db.prepare('SELECT * FROM watched').all() as any[];
  assert.equal(watched.length, 1);
  assert.equal(watched[0].user_rating, 10);

  const hist = db.prepare('SELECT * FROM watched_history').all() as any[];
  assert.equal(hist.length, 1);
  assert.equal(hist[0].user_rating, 9);
  dbMod.closeDb();
});

test('import is idempotent (re-import = same state)', async () => {
  process.env.MVD_HOME = HOME_A;
  const dbMod = await import('../src/utils/db.ts');
  dbMod.closeDb();
  const exportPath = join(HOME_A, 'snap.json');

  const r1 = mvd(HOME_B, ['import', exportPath, '--format', 'json']);
  const r2 = mvd(HOME_B, ['import', exportPath, '--format', 'json']);
  assert.equal(r1.code, 0);
  assert.equal(r2.code, 0);
  const s2 = JSON.parse(r2.out);
  assert.equal(s2.watched_history.added, 0); // no new history
  assert.equal(s2.watchlist.added, 0); // already there
});

test('import --replace wipes existing state', () => {
  // Seed B with junk JSON
  const junk = {
    mvd_version: 1,
    exported_at: new Date().toISOString(),
    movies: [{ tmdb_id: 999, title: 'Junk', release_year: 1900 }],
    watchlist: [{ tmdb_id: 999, added_at: new Date().toISOString() }],
    watched: [],
    watched_history: [],
    genres_cache: [],
  };
  const junkPath = join(HOME_B, 'junk.json');
  writeFileSync(junkPath, JSON.stringify(junk));
  const r = mvd(HOME_B, ['import', junkPath, '--replace', '--format', 'json']);
  assert.equal(r.code, 0);
  const listed = mvd(HOME_B, ['list', '--format', 'json']);
  const w = JSON.parse(listed.out);
  assert.equal(w.length, 1);
  assert.equal(w[0].id, 999);
});

test('export SQL format produces valid statements', () => {
  const r = mvd(HOME_B, ['export', '--as', 'sql']);
  assert.equal(r.code, 0);
  assert.match(r.out, /BEGIN TRANSACTION;/);
  assert.match(r.out, /COMMIT;/);
});

test('import bad version errors out', () => {
  const bad = { mvd_version: 999, exported_at: '', movies: [], watchlist: [], watched: [], watched_history: [], genres_cache: [] };
  const badPath = join(HOME_B, 'bad.json');
  writeFileSync(badPath, JSON.stringify(bad));
  const r = mvd(HOME_B, ['import', badPath]);
  assert.notEqual(r.code, 0);
});

test('import nonexistent file → exit 1', () => {
  const r = mvd(HOME_B, ['import', join(HOME_B, 'does-not-exist.json')]);
  assert.equal(r.code, 1);
});
