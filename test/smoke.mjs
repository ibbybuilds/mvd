// E2E live smoke runner. Reads stdin JSON; asserts via callback in argv[2].
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMDB = process.env.TMDB_KEY;
const OMDB = process.env.OMDB_KEY;
if (!TMDB || !OMDB) {
  console.error('Need TMDB_KEY + OMDB_KEY env');
  process.exit(2);
}

const HOME = mkdtempSync(join(tmpdir(), 'mvd-final-'));
const CLI = join(process.cwd(), 'dist', 'cli.js');

function mvd(args, opts = {}) {
  try {
    const out = execFileSync('node', [CLI, ...args], {
      env: { ...process.env, MVD_HOME: HOME, TMDB_API_KEY: TMDB, OMDB_API_KEY: OMDB, ...(opts.env || {}) },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', opts.captureErr ? 'pipe' : 'inherit'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: e.stdout?.toString() ?? '', err: e.stderr?.toString() ?? '' };
  }
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log(`[PASS] ${name}`); pass++; }
  else { console.log(`[FAIL] ${name}${detail ? ' :: ' + detail : ''}`); fail++; }
}

// A1: init writes .env
let r = mvd(['init', '--tmdb', TMDB, '--omdb', OMDB]);
check('A1  init non-interactive writes .env', existsSync(join(HOME, '.env')) && r.code === 0);

// A2: version
r = mvd(['--version']);
check('A2  --version', /\d+\.\d+\.\d+/.test(r.out));

// A3: help
r = mvd(['--help']);
check('A3  --help lists commands', /discover/.test(r.out) && /watched/.test(r.out) && /add/.test(r.out));

// A4: discover JSON
r = mvd(['discover', '--year', '2024', '--min-rating', '8', '--min-votes', '500', '--top', '3', '--format', 'json']);
let d = JSON.parse(r.out);
check('A4  discover JSON len=3', Array.isArray(d) && d.length === 3 && d.every((m) => m.id && m.title));

// A5: add by id
r = mvd(['add', '550', '--format', 'json']);
d = JSON.parse(r.out);
check('A5  add id=550 → Fight Club', d.added === 'Fight Club' && d.tmdb_id === 550);

// A6: add by title --no-prompt
r = mvd(['add', 'matrix', '--no-prompt', '--format', 'json']);
d = JSON.parse(r.out);
check('A6  add title --no-prompt picks top', /Matrix/i.test(d.added));

// A7: list contains 550
r = mvd(['list', '--format', 'json']);
d = JSON.parse(r.out);
check('A7  list contains added items', d.some((m) => m.id === 550));

// A8: watched mark
r = mvd(['watched', 'mark', '550', '--rating', '9', '--notes', 'smoke', '--format', 'json']);
d = JSON.parse(r.out);
check('A8  watched mark', d.rating === 9 && /Fight Club/.test(d.marked_watched));

// A9: watched list
r = mvd(['watched', 'list', '--format', 'json']);
d = JSON.parse(r.out);
check('A9  watched list has 550 rating=9', d.some((m) => m.id === 550 && m.rating === 9));

// A10: 550 removed from watchlist after mark
r = mvd(['list', '--format', 'json']);
d = JSON.parse(r.out);
check('A10 watchlist no longer has 550', !d.some((m) => m.id === 550));

// A11: discover --enrich --sort imdb
r = mvd(['discover', '--year', '2024', '--min-rating', '8', '--enrich', '--sort', 'imdb', '--top', '3', '--format', 'json']);
d = JSON.parse(r.out);
const imdbVals = d.map((m) => parseFloat(m.imdb)).filter((v) => Number.isFinite(v));
const sortedDesc = [...imdbVals].sort((a, b) => b - a);
check('A11 enrich+sort imdb desc', imdbVals.length === 3 && JSON.stringify(imdbVals) === JSON.stringify(sortedDesc));

// A12: info --enrich
r = mvd(['info', '550', '--enrich', '--format', 'json']);
d = JSON.parse(r.out);
check('A12 info enrich (director+imdb+rt+meta)',
  d.director === 'David Fincher' && d.imdb_rating >= 8 && d.rt_score > 0 && d.metacritic > 0);

// A13: unwatch returns to watchlist + preserves history
r = mvd(['unwatch', '550', '--format', 'json']);
const r2 = mvd(['list', '--format', 'json']);
d = JSON.parse(r2.out);
const back = d.some((m) => m.id === 550);
// query db directly
const dbPath = join(HOME, 'movies.db');
const Database = (await import('better-sqlite3')).default;
const db = new Database(dbPath, { readonly: true });
const hist = db.prepare('SELECT * FROM watched_history WHERE tmdb_id = 550').all();
db.close();
check('A13 unwatch returns to watchlist', back);
check('A14 watched_history preserves unwatch record', hist.length === 1 && hist[0].user_rating === 9);

// A15: search
r = mvd(['search', 'matrix', '--top', '3', '--format', 'json']);
d = JSON.parse(r.out);
check('A15 search by title', d.some((m) => /Matrix/i.test(m.title)));

// A16: remove
mvd(['add', '603', '--format', 'json']);
mvd(['remove', '603', '--format', 'json']);
r = mvd(['list', '--format', 'json']);
d = JSON.parse(r.out);
check('A16 remove from watchlist', !d.some((m) => m.id === 603));

// A17: exit code 3 on missing TMDB key
const EMPTY = mkdtempSync(join(tmpdir(), 'mvd-empty-'));
r = mvd(['discover', '--year', '2024'], { env: { TMDB_API_KEY: '', OMDB_API_KEY: '', MVD_HOME: EMPTY } });
check('A17 exit 3 on missing TMDB key', r.code === 3);

// A18: exit code 1 on bad id
r = mvd(['info', 'abc'], { captureErr: true });
check('A18 exit 1 on bad id', r.code === 1);

// A19: genre AND filter
r = mvd(['discover', '--genre', 'Action,Comedy', '--min-rating', '7', '--top', '3', '--format', 'json']);
d = JSON.parse(r.out);
check('A19 genre AND filter', d.every((m) => /Action/.test(m.genres) && /Comedy/.test(m.genres)));

// A20: yaml auto when piped
r = mvd(['list']);
check('A20 auto=yaml when piped', /^- /m.test(r.out) || r.out.trim() === '(none)');

rmSync(HOME, { recursive: true, force: true });
rmSync(EMPTY, { recursive: true, force: true });

console.log(`\n================================`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log(`================================`);
process.exit(fail);
