import { Command } from 'commander';
import { requireTmdbKey } from '../utils/config.js';
import { TmdbAPI, directorOf, posterUrl } from '../utils/tmdb.js';
import {
  getMovie,
  listWatched,
  markWatched,
  unwatch,
  upsertMovie,
  type WatchedSort,
} from '../utils/db.js';
import { printResult } from '../utils/output.js';
import type { Movie } from '../utils/types.js';

async function ensureCached(tmdb: TmdbAPI, id: number): Promise<Movie> {
  const cached = getMovie(id);
  if (cached) return cached;
  const details = await tmdb.movie(id, { appendCredits: true });
  const m: Movie = {
    tmdb_id: details.id,
    imdb_id: details.imdb_id ?? null,
    title: details.title,
    release_date: details.release_date ?? null,
    release_year: details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : null,
    genres: details.genres?.map((g) => g.name).join(', ') ?? null,
    overview: details.overview ?? null,
    poster_url: posterUrl(details.poster_path),
    tmdb_rating: details.vote_average ?? null,
    tmdb_votes: details.vote_count ?? null,
    runtime_minutes: details.runtime ?? null,
    director: directorOf(details),
    last_synced: new Date().toISOString(),
  };
  upsertMovie(m);
  return m;
}

function rowsForWatched(rows: ReturnType<typeof listWatched>) {
  return rows.map((m) => ({
    id: m.tmdb_id,
    title: m.title,
    year: m.release_year ?? '',
    rating: m.user_rating ?? '',
    tmdb: m.tmdb_rating?.toFixed(1) ?? '',
    watched: m.watched_date,
    notes: m.notes ?? '',
  }));
}

export function registerWatched(program: Command): void {
  const watched = program
    .command('watched')
    .description('List watched movies, or mark/list via subcommands');

  watched
    .command('list', { isDefault: true })
    .description('List watched movies')
    .option('--sort <field>', 'rating | date | title', 'date')
    .action(async (opts, cmd) => {
      const fmt = cmd.parent?.parent?.opts().format ?? 'auto';
      printResult(rowsForWatched(listWatched({ sort: opts.sort as WatchedSort })), fmt);
    });

  watched
    .command('mark <id>')
    .description('Mark a movie as watched (removes from watchlist)')
    .option('--rating <n>', '1-10 user rating', (v) => parseInt(v, 10))
    .option('--date <yyyy-mm-dd>', 'watched date (default today)')
    .option('--notes <text>', 'free text notes')
    .action(async (idStr: string, opts, cmd) => {
      const fmt = cmd.parent?.parent?.opts().format ?? 'auto';
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) {
        console.error('Error: id must be numeric');
        process.exit(1);
      }
      if (opts.rating != null && (opts.rating < 1 || opts.rating > 10)) {
        console.error('Error: --rating must be 1-10');
        process.exit(1);
      }
      const tmdb = new TmdbAPI(requireTmdbKey());
      const movie = await ensureCached(tmdb, id);
      markWatched(id, opts.rating ?? null, opts.date ?? null, opts.notes ?? null);
      printResult(
        {
          marked_watched: movie.title,
          year: movie.release_year,
          rating: opts.rating ?? null,
          date: opts.date ?? new Date().toISOString().slice(0, 10),
        },
        fmt
      );
    });

  program
    .command('unwatch <id>')
    .description('Move from watched back to watchlist (preserves history in watched_history)')
    .action(async (idStr: string, _opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) {
        console.error('Error: id must be numeric');
        process.exit(1);
      }
      unwatch(id);
      printResult({ unwatched: id }, fmt);
    });
}
