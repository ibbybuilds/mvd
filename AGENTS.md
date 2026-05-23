# Using mvd from agents

`mvd` is designed for AI agents and headless automation. This doc covers the contract.

## Setup

```bash
mvd init --tmdb <v4-token> --omdb <key>     # non-interactive
```

Or set env vars (override file):

```bash
export TMDB_API_KEY=...
export OMDB_API_KEY=...
```

## Output format

`--format auto` (default) resolves:

- TTY → `table` (human-readable)
- Piped/redirected → `yaml` (machine-readable, preserves null)

For deterministic JSON, always pass `--format json`:

```bash
mvd discover --year 2024 --min-rating 8 --format json | jq '.[].id'
```

## One command = one operation

No interactive prompts in agent mode. Two escape hatches:

1. `mvd add <id>` — pass numeric TMDB id directly (no search, no prompt)
2. `mvd add "<title>" --no-prompt` — auto-pick top search result

If the numeric heuristic guesses wrong (e.g., movie titled "300"), force-disambiguate:

```bash
mvd add 1995 --id            # numeric title? force as TMDB id
mvd search "300" --format json   # then pick the right id yourself
```

## Determinism

- Same `--year --genre --min-rating --min-votes --sort` returns the same ordered results.
- Re-adding the same id to watchlist is a no-op (no duplicate row).
- Marking already-watched updates the row (does not duplicate).

## Recommended workflows

### Discover + auto-add top N

```bash
mvd discover --year 2025 --min-rating 7 --top 20 --format json \
  | jq -r '.[].id' \
  | xargs -I{} mvd add {} --format json
```

### Sync state

```bash
mvd list --format json > watchlist.json
mvd watched list --format json > watched.json
```

### Enrich for ranking

```bash
mvd discover --year 2024 --min-rating 7 --enrich --sort imdb --top 10 --format json
```

OMDb free tier: 1000 calls/day. Each `--enrich` result = 2 calls. Budget accordingly.

## Exit codes

| Code | Meaning | Agent response |
|---|---|---|
| 0 | Success | Continue |
| 1 | User error (bad args, no match) | Don't retry; fix invocation |
| 2 | API error (HTTP failure) | Retry with backoff |
| 3 | Config error (missing key) | Run `mvd init` |

## Common pitfalls

- **Genre OR uses `|`** — shell interprets unquoted. Always quote: `--genre "Action|Comedy"`.
- **`mvd watched` is a parent command** — use `mvd watched list` or `mvd watched mark <id>`.
- **OMDb is rate-limited (1000/day)** — cache responses, don't re-enrich the same id.
- **`info <id>` caches for 7 days** — pass `--no-cache` to force refetch.
- **First run hits `/genre/movie/list`** — cached 30 days in `~/.mvd/movies.db`.

## Idempotency

- `add` same id → no-op
- `remove` non-existent → silent success
- `watched mark` already-watched → updates rating/date/notes
- `unwatch` non-watched → still adds to watchlist (treat as upsert)

## State location

`~/.mvd/movies.db` is a SQLite file. Agents can read it directly for bulk queries:

```bash
sqlite3 ~/.mvd/movies.db "SELECT title, tmdb_rating FROM movies WHERE release_year = 2024"
```

Schema in [SCHEMA.md](SCHEMA.md). Don't write directly — use `mvd` commands so cache invariants hold.
