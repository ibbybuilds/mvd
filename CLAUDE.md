# Repo conventions for Claude / agents

This file is for agents working ON the mvd codebase. End-user docs: [README.md](README.md), [AGENTS.md](AGENTS.md).

## Stack

- TypeScript strict, ES2022, ESM-only
- `commander` for CLI parsing
- `better-sqlite3` for storage (sync API, single file)
- `yaml` + native `JSON` for output
- `tsup` (esbuild) for bundling
- `tsx` + `node:test` for tests
- Node >= 18

## Conventions

- **Mirror discli** (`D:\Github\discli`) — same author, same patterns. When in doubt, copy.
- Strict TS. No `any` without justification (cast on external JSON is OK).
- Each command in its own file under `src/commands/`, exporting `register<Name>(program)`.
- Each external API in its own file under `src/utils/` (`tmdb.ts`, `omdb.ts`).
- All output via `printResult(data, fmt)` from `utils/output.ts`. Never `console.log` rows directly.
- Use `node:` prefix for builtins (`node:readline/promises`) — esbuild requires it.
- Exit codes per [README.md](README.md#exit-codes): 0/1/2/3.

## State

- `~/.mvd/.env` — API keys
- `~/.mvd/config.json` — defaults
- `~/.mvd/movies.db` — SQLite
- Override root with `MVD_HOME` (used in tests)

## Tests

```bash
npm test            # runs all .test.ts via tsx
npm run typecheck   # tsc --noEmit
npm run build       # tsup
```

Tests use `MVD_HOME` to isolate DB into a tmp dir. Fetch is mocked — no live TMDB/OMDb calls in unit tests.

## Adding a command

1. Create `src/commands/<name>.ts` with `register<Name>(program: Command)`.
2. Wire in `src/cli.ts`.
3. Use `requireTmdbKey()` / `requireOmdbKey()` for keys.
4. Read `cmd.parent?.opts().format` for `--format` (or `cmd.parent?.parent?.opts().format` for sub-subcommands).
5. Route output through `printResult(data, fmt)`.
6. Add a `.test.ts` covering at least one happy path + one error.

## Commit style

Conventional Commits:

```
feat(discover): add --enrich flag
fix(db): coalesce nulls on upsert
chore: bump deps
docs: clarify OMDb rate limits
test(genres): cover fuzzy fallback
```

## Out of scope (Phase 2+)

- Custom lists, stats dashboard, JustWatch availability, LLM prompts
- Letterboxd/CSV import/export, refresh-all command, TUI, shell completions

Don't stub; leave out of help text entirely.
