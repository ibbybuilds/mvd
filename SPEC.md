# mvd — Build Spec

**For the coding agent:** this is a complete, self-contained spec for building `mvd` from scratch. Mirror `D:\Github\discli` conventions exactly — config pattern, output pattern, command registration pattern, build config, release scripts. When in doubt, copy from discli.

---

## Project

- **Name:** `@ibbybuilds/mvd`
- **Description:** Movie discovery + watchlist CLI. Built for humans and AI agents.
- **Author:** ibbybuilds
- **License:** MIT
- **Repo location:** `D:\Github\mvd\`
- **GitHub:** `github.com/ibbybuilds/mvd`
- **Distribution:** npm publish under `@ibbybuilds/mvd`

## Purpose

CLI to discover movies (filter by year/genre/rating/votes), maintain a watchlist, mark watched + rate, and view personal stats later. Local-only storage. No cloud sync. Agent-first (no TUI, no interactive flourishes that block automation).

## Stack (mirrors discli exactly)

`package.json`:

```json
{
  "name": "@ibbybuilds/mvd",
  "version": "0.1.0",
  "description": "mvd — Movie discovery + watchlist CLI. Built for humans and AI agents.",
  "type": "module",
  "bin": { "mvd": "dist/cli.js" },
  "files": ["dist", "README.md"],
  "repository": { "type": "git", "url": "git+https://github.com/ibbybuilds/mvd.git" },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "start": "node dist/cli.js",
    "typecheck": "tsc --noEmit",
    "test": "node --test test/*.test.js",
    "release:patch": "npm run typecheck && npm run build && npm test && npm version patch && git push && git push --tags",
    "release:minor": "npm run typecheck && npm run build && npm test && npm version minor && git push && git push --tags",
    "release:major": "npm run typecheck && npm run build && npm test && npm version major && git push && git push --tags"
  },
  "keywords": ["movies", "cli", "tmdb", "imdb", "watchlist", "agent"],
  "author": "ibbybuilds",
  "license": "MIT",
  "dependencies": {
    "commander": "^13.1.0",
    "yaml": "^2.8.2",
    "better-sqlite3": "^11.5.0"
  },
  "engines": { "node": ">=18.0.0" },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/better-sqlite3": "^7.6.12",
    "tsup": "^8.5.1",
    "typescript": "^5.9.3"
  }
}
```

`tsup.config.ts` — copy from discli verbatim:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  splitting: false,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

`tsconfig.json` — copy from discli verbatim:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## File structure

```
mvd/
├── .github/workflows/        # CI: typecheck + test + npm publish on tag
├── assets/                   # logo placeholder
├── dist/                     # build output, gitignored
├── docs/                     # extended docs (Phase 2+)
├── src/
│   ├── cli.ts                # main entry, registers all commands
│   ├── commands/
│   │   ├── init.ts           # mvd init
│   │   ├── discover.ts       # mvd discover
│   │   ├── search.ts         # mvd search
│   │   ├── info.ts           # mvd info
│   │   ├── watchlist.ts      # mvd add, list, remove (grouped under watchlist verbs at top level)
│   │   └── watched.ts        # mvd watched, unwatch
│   └── utils/
│       ├── tmdb.ts           # TMDB API client
│       ├── omdb.ts           # OMDb API client
│       ├── db.ts             # better-sqlite3 wrapper + schema + prepared statements
│       ├── config.ts         # ~/.mvd/config.json + ~/.mvd/.env
│       ├── output.ts         # printResult, printTable, resolveFormat — copy-adapt from discli
│       └── genres.ts         # genre name <-> ID with cache refresh
├── test/
│   ├── db.test.js
│   ├── tmdb.test.js
│   └── cli.test.js
├── .gitignore                # node_modules, dist, *.log
├── AGENTS.md                 # how AI agents should use mvd
├── CLAUDE.md                 # repo-level Claude conventions
├── package.json
├── package-lock.json
├── README.md
├── SCHEMA.md                 # SQLite schema docs
├── tsconfig.json
├── tsup.config.ts
└── SPEC.md                   # this file
```

## Global flags (mirrors discli)

Top-level options on the main `Command`:

```
--format <fmt>       json | yaml | table | auto   (auto = yaml when piped, table in terminal)
```

Every subcommand reads `program.opts().format` and routes through `resolveFormat()` + `printResult()` from `utils/output.ts`. Do not write per-command output logic.

## APIs

### TMDB (primary)

- Base: `https://api.themoviedb.org/3`
- Auth: v4 token via `Authorization: Bearer ${TMDB_API_KEY}` header
- Rate limit: 40 req / 10 sec
- Endpoints used:
  - `GET /discover/movie` — filter + sort
  - `GET /search/movie` — title search
  - `GET /movie/{id}` — full details (includes `imdb_id`, credits via `?append_to_response=credits`)
  - `GET /movie/{id}/recommendations` — for Phase 2 `mvd recommend`
  - `GET /genre/movie/list` — genre map, cache locally

Discover params used:
- `primary_release_year` — int
- `with_genres` — comma-separated IDs (AND), or pipe-separated (OR)
- `vote_average.gte` — float
- `vote_count.gte` — int (default 300 to avoid noise)
- `sort_by` — popularity.desc, vote_average.desc, primary_release_date.desc, title.asc
- `page` — for pagination (return top N across pages if --top > 20)

### OMDb (enrichment)

- Base: `http://www.omdbapi.com/`
- Auth: `?apikey=${OMDB_API_KEY}` query param
- Free tier: 1,000 calls/day
- Use case: only when user passes `--enrich` or `--sort imdb`
- Lookup by `imdb_id` from TMDB response (preferred) or `title + year`
- Parse `Ratings[]` array → extract IMDB (10-point), Rotten Tomatoes (%), Metacritic (100-point)

## Config

File: `~/.mvd/config.json` (matches discli's pattern):

```json
{
  "defaults": {
    "min_votes": 300,
    "top": 10,
    "min_rating": 0,
    "sort": "tmdb"
  }
}
```

File: `~/.mvd/.env`:

```
TMDB_API_KEY=...
OMDB_API_KEY=...
```

`utils/config.ts` exports (match discli signature shape):

- `loadConfig(): MvdConfig`
- `saveConfig(data: MvdConfig): void`
- `loadTmdbKey(): string | null`
- `loadOmdbKey(): string | null`
- `saveKeys(tmdb: string, omdb: string): void`
- `requireTmdbKey(): string` — throws with friendly "run `mvd init`" message
- `requireOmdbKey(): string` — same
- `getDefault<K extends keyof MvdDefaults>(key: K): MvdDefaults[K]`
- `setDefault<K extends keyof MvdDefaults>(key: K, value: MvdDefaults[K]): void`

Also read env vars `TMDB_API_KEY` + `OMDB_API_KEY` as override. Resolution: env > `.env` file > prompt-via-error.

## Database

`better-sqlite3` at `~/.mvd/movies.db`. Sync API. Single file. Schema init is idempotent.

### Schema (also documented in SCHEMA.md)

```sql
CREATE TABLE IF NOT EXISTS movies (
  tmdb_id INTEGER PRIMARY KEY,
  imdb_id TEXT,
  title TEXT NOT NULL,
  release_date TEXT,
  release_year INTEGER,
  genres TEXT,                  -- comma-separated genre names
  overview TEXT,
  poster_url TEXT,
  tmdb_rating REAL,
  tmdb_votes INTEGER,
  imdb_rating REAL,             -- nullable, set on enrich
  imdb_votes INTEGER,           -- nullable
  rt_score INTEGER,             -- nullable, RT %
  metacritic INTEGER,           -- nullable
  runtime_minutes INTEGER,
  director TEXT,
  last_synced TEXT              -- ISO timestamp
);

CREATE TABLE IF NOT EXISTS watchlist (
  tmdb_id INTEGER PRIMARY KEY REFERENCES movies(tmdb_id),
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watched (
  tmdb_id INTEGER PRIMARY KEY REFERENCES movies(tmdb_id),
  user_rating INTEGER,          -- nullable, 1-10
  watched_date TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS genres_cache (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cached_at TEXT NOT NULL
);
```

### `utils/db.ts` exports

- `initDb(): Database` — opens connection, runs schema, returns handle
- `upsertMovie(movie: Movie): void`
- `getMovie(tmdb_id: number): Movie | null`
- `addToWatchlist(tmdb_id: number): void`
- `removeFromWatchlist(tmdb_id: number): void`
- `listWatchlist(opts: { sort?: 'rating' | 'added' | 'year' | 'title' }): Movie[]`
- `markWatched(tmdb_id: number, rating?: number, date?: string, notes?: string): void`
- `unwatch(tmdb_id: number): void`
- `listWatched(opts: { sort?: 'rating' | 'date' | 'title' }): (Movie & { user_rating?: number; watched_date: string })[]`
- `cacheGenres(genres: TmdbGenre[]): void`
- `getGenreIdByName(name: string): number | null`
- `getGenreNameById(id: number): string | null`
- `genresStale(): boolean` — true if last refresh > 30 days ago or cache empty

Use prepared statements for all CRUD. Wrap multi-statement operations in `db.transaction()`.

## Commands (Phase 1 MVP)

### `mvd init`

Interactive setup. Prompts for TMDB + OMDb keys using `node:readline/promises`. Writes `~/.mvd/.env`. Confirms by making one test call to TMDB `/genre/movie/list`.

For agent use: also accept `--tmdb <key> --omdb <key>` flags to skip interactive mode.

### `mvd discover`

```
mvd discover [options]
  --year <int>                primary_release_year
  --genre <name>              comma-separated for AND, pipe for OR (case-insensitive)
  --min-rating <float>        vote_average.gte (default 0)
  --min-votes <int>           vote_count.gte (default 300)
  --top <int>                 limit (default 10)
  --sort <field>              tmdb | imdb | popularity | release | title (default tmdb)
  --enrich                    also pull OMDb scores for each result
```

Flow:
1. Resolve genre names → IDs via `genres.ts` (refresh cache if stale)
2. Call TMDB `/discover/movie` with mapped params
3. If `--top > 20`, paginate
4. If `--enrich` or `--sort imdb`, fetch OMDb data per result, re-sort if needed
5. Upsert each result into `movies` table
6. `printResult(rows, format)` — table by default

### `mvd search <query>`

```
mvd search <query> [--year <int>]
```

Calls `/search/movie`. Returns up to 10 results in table. Same upsert behavior.

### `mvd info <id>`

```
mvd info <id> [--enrich]
```

Full details on one title. Pulls from cache if present + fresh (within 7 days). Otherwise refetches `/movie/{id}` with `append_to_response=credits` to extract director.

### `mvd add <id-or-query>`

```
mvd add <id-or-query>
```

If numeric → treat as TMDB ID, fetch + upsert + add to watchlist.

If text:
1. Call TMDB search
2. If 1 result: add it, print confirmation
3. If 2-10 results: print numbered table (year, rating), prompt `Pick row [1-N], or q to cancel:` via `node:readline/promises`
4. If 0 results: error "no matches found"

**Agent escape hatch:** `--no-prompt` flag → if multiple matches, just pick top result.

### `mvd remove <id>`

Removes from watchlist. Keeps movie in `movies` cache.

### `mvd list`

```
mvd list [--sort <field>]
```

Show watchlist. Sort: rating | added | year | title.

### `mvd watched <id>`

```
mvd watched <id> [--rating <1-10>] [--date <YYYY-MM-DD>] [--notes <text>]
```

Marks as watched. If already in watchlist, removes from watchlist. If not in any table, allowed — adds directly to watched (after fetching from TMDB).

If `<id>` omitted → list watched titles instead. So `mvd watched` (no args) = list, `mvd watched 550 --rating 9` = mark.

### `mvd unwatch <id>`

Moves a watched title back to watchlist. Preserves the watched record? **No** — delete the watched row, add back to watchlist with new `added_at`. (Re-watching gets a fresh record.)

## Output (`utils/output.ts`)

**Copy from discli verbatim**, then adapt only the function names if needed. Specifically:

- `resolveFormat(explicit: string): string` — auto = yaml-when-piped, table-when-TTY
- `printResult(data: unknown, format: string): void`
- `printTable(rows: Record<string, unknown>[], columns?: string[]): void`

Do not write any custom formatting per command. Every command calls `printResult(data, fmt)`.

## TMDB client (`utils/tmdb.ts`)

Class-based, matches discli's `DiscordAPI` pattern:

```ts
export class TmdbAPI {
  constructor(private apiKey: string) {}

  async discover(params: DiscoverParams): Promise<TmdbMovie[]>;
  async search(query: string, year?: number): Promise<TmdbMovie[]>;
  async movie(id: number, opts?: { appendCredits?: boolean }): Promise<TmdbMovieDetails>;
  async recommendations(id: number): Promise<TmdbMovie[]>;
  async genres(): Promise<TmdbGenre[]>;

  private async request<T>(path: string, query?: Record<string, string | number>): Promise<T> {
    // GET with Authorization: Bearer
    // Retry once on 429 after 2s sleep
    // Throw TmdbError on 4xx/5xx with parsed body
  }
}
```

## OMDb client (`utils/omdb.ts`)

```ts
export class OmdbAPI {
  constructor(private apiKey: string) {}

  async lookupByImdb(imdbId: string): Promise<OmdbResponse>;
  async lookupByTitle(title: string, year?: number): Promise<OmdbResponse>;
}
```

Parse `Ratings[]` into `{ imdb_rating, rt_score, metacritic }`.

## Genre resolution (`utils/genres.ts`)

- On first invocation (or when stale): fetch `/genre/movie/list`, upsert into `genres_cache` with `cached_at = now()`
- `getGenreId(name)`:
  1. Lowercase + exact name match
  2. Fall back to substring match (e.g., `sci-fi` → `Science Fiction`)
  3. Fall back to fuzzy (Levenshtein ≤ 1 if you want, otherwise skip)
- Refresh cache when `genresStale()` is true (>30 days)

## Agent-first considerations

This CLI is built for agents primarily, not interactive users. Specifically:

1. **`--format json` is the default for piped output** (auto resolution does this). Agents calling `mvd` get parseable JSON without flag.
2. **All commands deterministic** — same input, same output. No randomized re-rankings.
3. **No TUI, no spinners, no progress bars.** Plain output only.
4. **`--no-prompt` on `mvd add`** for headless disambiguation (pick top match).
5. **Exit codes:** 0 = success, 1 = user error (bad args), 2 = API error, 3 = config/setup error. Document in README.
6. **No telemetry, no auto-update checks, no analytics.**

## AGENTS.md (write this file)

Short doc on how AI agents should use `mvd`. Cover:
- One command = one operation
- `--format json` for programmatic consumption
- Recommended workflows:
  - Discover + auto-add: `mvd discover --year 2025 --min-rating 8 --format json` → parse → `mvd add <id>` per item
  - Sync state: `mvd list --format json`, `mvd watched --format json`
  - Idempotency: re-adding same ID is a no-op
- Common pitfalls

## CLAUDE.md (write this file)

Repo conventions for Claude/agents working ON the codebase:
- Mirror discli patterns
- Where state lives (`~/.mvd/`)
- How to run tests
- Style guide (TypeScript strict, no `any` unless justified)
- Commit message style (Conventional Commits)

## README.md sections (mirror discli)

1. One-liner + tagline
2. Install: `npm i -g @ibbybuilds/mvd`
3. Quick start (3 example commands)
4. All commands table
5. Config (where keys live, link to TMDB + OMDb signup pages)
6. AI agent usage (link to AGENTS.md)
7. Contributing
8. License

## SCHEMA.md

Document each table, each column, semantic meaning. Mirror discli's SCHEMA.md style if it exists, otherwise write fresh.

## Acceptance criteria for v0.1.0

1. `npm install` from clean repo succeeds
2. `npm run typecheck` clean
3. `npm test` passes (at minimum: db CRUD tests, TMDB mocked client tests, one CLI smoke test)
4. `npm run build` produces `dist/cli.js` with shebang
5. `npm link` installs `mvd` globally
6. `mvd init --tmdb K --omdb K` writes `~/.mvd/.env` non-interactively
7. `mvd discover --year 2025 --min-rating 8 --min-votes 500 --format json` returns valid JSON array from TMDB
8. `mvd add "Fight Club" --no-prompt` adds top match to watchlist
9. `mvd list --format json` returns watchlist with TMDB ratings
10. `mvd watched 550 --rating 9` records watched with rating
11. `mvd watched --format json` returns watched list
12. `mvd discover --year 2025 --min-rating 8 --enrich --sort imdb --format json` returns results sorted by IMDB
13. All commands support `--help` (commander default)
14. README, AGENTS.md, CLAUDE.md, SCHEMA.md present
15. Output utility (json/yaml/table/auto) mirrors discli's pattern
16. Release scripts in `package.json` match discli's pattern (patch/minor/major)
17. `.gitignore` covers node_modules, dist, *.log
18. Initial commit follows Conventional Commits format

## Out of scope for v0.1.0

- Custom lists (`mvd lists create`)
- Stats dashboard (`mvd stats`)
- Streaming availability (JustWatch)
- LLM mood prompts
- Import/export (Letterboxd, CSV, JSON dump)
- Refresh ratings across watchlist (`mvd update`)
- TUI mode
- Shell completions

These are Phase 2+. Don't build. Don't stub. Just leave them out of help text.

## Reference repo

`D:\Github\discli` — same author, same conventions, same stack. **When in doubt, copy from discli.** Particularly:
- `package.json` scripts + structure
- `tsup.config.ts` + `tsconfig.json` verbatim
- `src/cli.ts` registration pattern
- `src/utils/output.ts` (verbatim)
- `src/utils/config.ts` (adapt: replace bot token with API keys)
- `src/commands/*` registration style (each file exports a `register*(program)` function)
- AGENTS.md tone
- README structure

## Build order (recommend the coding agent follows)

1. Scaffold: package.json, tsconfig, tsup, .gitignore, basic folder structure
2. Copy from discli: output.ts, config.ts (adapt for keys not bot token)
3. db.ts + schema init + tests
4. tmdb.ts client + tests (with mocked fetch)
5. omdb.ts client + tests
6. genres.ts (uses tmdb + db)
7. commands/init.ts
8. commands/discover.ts
9. commands/search.ts + commands/info.ts
10. commands/watchlist.ts (add, list, remove)
11. commands/watched.ts (watched mark, watched list, unwatch)
12. cli.ts wiring
13. README, AGENTS.md, CLAUDE.md, SCHEMA.md
14. CI workflow
15. Tag v0.1.0, publish
