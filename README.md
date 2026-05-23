# mvd

Movie discovery + watchlist CLI. Built for humans and AI agents.

Discover movies by year, genre, rating, votes. Maintain a watchlist. Mark watched + rate. All local — no cloud sync, no telemetry.

```
$ mvd discover --year 2024 --min-rating 8 --top 5
  ID      TITLE                    YEAR  TMDB  VOTES  GENRES
  ──────  ───────────────────────  ────  ────  ─────  ────────────────────
  1184918 The Wild Robot           2024  8.4   3500   Animation, Family
  933260  The Substance            2024  8.2   2800   Horror, Drama
  ...
```

## Install

```bash
npm install -g @ibbybuilds/mvd
mvd init                # prompts for TMDB + OMDb keys
```

Get a free TMDB v4 token at <https://www.themoviedb.org/settings/api>. OMDb key (optional, for IMDB/RT/Metacritic enrichment) at <https://www.omdbapi.com/apikey.aspx>.

## Quick start

```bash
mvd discover --year 2024 --min-rating 7 --top 10
mvd search "fight club"
mvd add 550                          # add Fight Club (TMDB id) to watchlist
mvd add "fight club" --no-prompt     # agent-friendly: top match, no interactive disambiguation
mvd list --sort rating
mvd watched mark 550 --rating 9
mvd watched list
mvd unwatch 550                      # back to watchlist, preserves history
```

## Commands

| Command | What it does |
|---|---|
| `mvd init` | Save TMDB + OMDb API keys |
| `mvd discover` | Filter by year, genre, rating, votes |
| `mvd search <query>` | Search by title |
| `mvd info <id>` | Full details for one TMDB id |
| `mvd add <id\|title>` | Add to watchlist |
| `mvd remove <id>` | Remove from watchlist |
| `mvd list` | Show watchlist |
| `mvd watched list` | Show watched movies |
| `mvd watched mark <id>` | Mark as watched |
| `mvd unwatch <id>` | Move from watched back to watchlist |
| `mvd export` | Dump full state (JSON or SQL) |
| `mvd import <file>` | Restore from export (merge or --replace) |

Every command supports `--help`.

### Global flags

- `--format <fmt>` — `json` \| `yaml` \| `table` \| `auto` (default). `auto` = yaml when piped, table in TTY.

### `discover` options

```
--year <int>            Primary release year
--genre <name>          Genre name(s). Comma = AND, pipe = OR. Examples:
                        --genre Action          (single)
                        --genre "Action,Drama"  (both)
                        --genre "Action|Comedy" (either) — quote to avoid shell pipe
--min-rating <float>    TMDB vote average ≥ (default 0)
--min-votes <int>       TMDB vote count ≥ (default 300)
--top <int>             Limit results (default 10)
--sort <field>          tmdb | imdb | popularity | release | title (default tmdb)
--enrich                Fetch OMDb (IMDB/RT/Metacritic) per result
```

`--sort imdb` and `--enrich` use OMDb (free tier: 1000/day). Each enriched result = 2 API calls (TMDB details + OMDb lookup). Cap `--top` accordingly.

### `add <id-or-title>` options

```
--id                    Force numeric arg as TMDB id (use for movies titled "1984", "300", etc.)
--no-prompt             Auto-pick top result on multi-match (agent mode)
```

Numeric heuristic: bare digits > 999 treated as TMDB id. Use `--id` to override for low-id or numeric titles.

## Config

State lives in `~/.mvd/`:

- `config.json` — defaults (min_votes, top, sort, min_rating)
- `.env` — API keys (`TMDB_API_KEY`, `OMDB_API_KEY`)
- `movies.db` — SQLite cache + watchlist + watched + history

Override config dir with `MVD_HOME=/path/to/dir`.

Env vars override `.env` file: `TMDB_API_KEY`, `OMDB_API_KEY`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | User error (bad args, no match, validation fail) |
| 2 | API error (TMDB/OMDb HTTP failure) |
| 3 | Config / setup error (missing key, no init) |

## For AI agents

`mvd` is built for programmatic use. See [AGENTS.md](AGENTS.md). Key points:

- `--format auto` emits YAML when piped, JSON parses cleanly via `--format json`
- All commands deterministic — same input, same output
- No spinners, no progress bars, no TTY tricks in piped output
- `mvd add --no-prompt` for headless disambiguation
- Re-adding same id is a no-op

## Sync across devices

`mvd` is local-only by design — no cloud account, no telemetry. To sync state across machines, export + ship the snapshot anywhere you want:

```bash
mvd export --out ~/mvd-snap.json          # dump full state
mvd import ~/mvd-snap.json                # merge into local db (idempotent)
mvd import ~/mvd-snap.json --replace      # wipe local + restore from file
```

### Pattern 1: Syncthing / Dropbox / iCloud (zero-infra)

Put the export in a synced folder. Run on a timer:

```bash
# crontab -e
*/30 * * * * /usr/local/bin/mvd export --out ~/Dropbox/mvd/snap.json
@reboot       /usr/local/bin/mvd import  ~/Dropbox/mvd/snap.json
```

### Pattern 2: Git (versioned, free)

```bash
cd ~/mvd-sync && git init
mvd export --out ./snap.json
git add snap.json && git commit -m "snap $(date -I)" && git push
```

JSON diffs cleanly. Use `git log -p snap.json` to see when you added each movie.

### Pattern 3: Litestream (continuous, advanced)

Stream the SQLite WAL to S3/B2/SFTP. No code changes:

```bash
litestream replicate ~/.mvd/movies.db s3://my-bucket/mvd.db
# on restore:
litestream restore -o ~/.mvd/movies.db s3://my-bucket/mvd.db
```

See [litestream.io](https://litestream.io).

### Merge semantics

`mvd import <file>` (default = merge):

- **movies**: upsert by `tmdb_id` (newest wins, COALESCE preserves enriched fields)
- **watchlist**: idempotent (re-add same id = no-op)
- **watched**: upsert by `tmdb_id` (latest record replaces previous)
- **watched_history**: dedupe by `(tmdb_id, watched_date, archived_at)` triple
- **genres_cache**: replaced wholesale (newest export wins)

No multi-writer conflict resolution. If two devices edit between syncs, last-export-wins on the conflicting row. For true multi-master, use [Turso/libsql](https://turso.tech) (vendor) or [PouchDB-style CRDTs](https://pouchdb.com) (heavy).

## Database schema

See [SCHEMA.md](SCHEMA.md).

## Contributing

```bash
git clone https://github.com/ibbybuilds/mvd
cd mvd
npm install
npm run build
npm test
npm link    # makes `mvd` available globally
```

Conventional Commits. Strict TypeScript, no `any` without reason.

## License

MIT © ibbybuilds
