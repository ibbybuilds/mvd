# Database schema

SQLite at `~/.mvd/movies.db` (override via `MVD_HOME`). Single file. WAL mode. Foreign keys ON.

## Tables

### `movies`

Cached TMDB + OMDb data. One row per movie.

| Column | Type | Notes |
|---|---|---|
| `tmdb_id` | INTEGER PK | TMDB movie id |
| `imdb_id` | TEXT | e.g. `tt0137523`. Null until enriched or details fetched |
| `title` | TEXT NOT NULL | |
| `release_date` | TEXT | ISO `YYYY-MM-DD` |
| `release_year` | INTEGER | Convenience copy of year from `release_date` |
| `genres` | TEXT | Comma-separated names (e.g. `Action, Drama`) |
| `overview` | TEXT | TMDB synopsis |
| `poster_url` | TEXT | `https://image.tmdb.org/t/p/w500/...` |
| `tmdb_rating` | REAL | 0-10 |
| `tmdb_votes` | INTEGER | |
| `imdb_rating` | REAL | Nullable, set via `--enrich` |
| `imdb_votes` | INTEGER | Nullable |
| `rt_score` | INTEGER | Rotten Tomatoes % (0-100), nullable |
| `metacritic` | INTEGER | 0-100, nullable |
| `runtime_minutes` | INTEGER | Nullable |
| `director` | TEXT | Nullable (requires details fetch w/ credits) |
| `last_synced` | TEXT | ISO timestamp of last cache write |

Upserts use `COALESCE` so partial updates (e.g., enrichment) don't blank existing fields.

Indexes: `release_year`, `tmdb_rating`.

### `watchlist`

| Column | Type | Notes |
|---|---|---|
| `tmdb_id` | INTEGER PK FK→movies | |
| `added_at` | TEXT NOT NULL | ISO timestamp |

`INSERT OR IGNORE` for idempotency.

### `watched`

| Column | Type | Notes |
|---|---|---|
| `tmdb_id` | INTEGER PK FK→movies | |
| `user_rating` | INTEGER | 1-10, nullable |
| `watched_date` | TEXT NOT NULL | ISO `YYYY-MM-DD` |
| `notes` | TEXT | Nullable |

Marking already-watched updates the row (does not duplicate).

### `watched_history`

Append-only audit log of all past watches. Populated on `unwatch`.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `tmdb_id` | INTEGER NOT NULL FK→movies | |
| `user_rating` | INTEGER | Snapshot from `watched` at unwatch time |
| `watched_date` | TEXT NOT NULL | |
| `notes` | TEXT | |
| `archived_at` | TEXT NOT NULL | ISO timestamp of `unwatch` call |

Indexed on `tmdb_id` for re-watch analytics.

### `genres_cache`

TMDB genre map. Refreshed when >30 days old or empty.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | TMDB genre id |
| `name` | TEXT NOT NULL | e.g. `Science Fiction` |
| `cached_at` | TEXT NOT NULL | ISO timestamp |

Cleared + replaced atomically inside a transaction on refresh.

## Migrations

None yet. Schema is created idempotently with `CREATE TABLE IF NOT EXISTS`. Future breaking changes will ship with explicit migration scripts.

## Querying directly

```bash
sqlite3 ~/.mvd/movies.db "SELECT title, tmdb_rating, imdb_rating FROM movies WHERE release_year = 2024 ORDER BY tmdb_rating DESC LIMIT 10"
```

Don't write directly. Use `mvd` commands so cache invariants and FK constraints hold.
