import { Command } from 'commander';
import { requireTmdbKey } from '../utils/config.js';
import { TmdbAPI, tmdbToMovie } from '../utils/tmdb.js';
import { ensureGenres, genreIdsToNames } from '../utils/genres.js';
import { upsertMovie } from '../utils/db.js';
import { printResult } from '../utils/output.js';

export function registerSearch(program: Command): void {
  program
    .command('search <query>')
    .description('Search movies by title')
    .option('--year <int>', 'release year filter', (v) => parseInt(v, 10))
    .option('--top <int>', 'limit results', (v) => parseInt(v, 10), 10)
    .action(async (query: string, opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      const tmdb = new TmdbAPI(requireTmdbKey());
      await ensureGenres(tmdb);
      const results = (await tmdb.search(query, opts.year)).slice(0, opts.top);
      const movies = results.map((r) =>
        tmdbToMovie(r, { genres: genreIdsToNames(r.genre_ids) })
      );
      for (const m of movies) upsertMovie(m);
      const rows = movies.map((m) => ({
        id: m.tmdb_id,
        title: m.title,
        year: m.release_year ?? '',
        tmdb: m.tmdb_rating?.toFixed(1) ?? '',
        votes: m.tmdb_votes ?? '',
        genres: m.genres ?? '',
      }));
      printResult(rows, fmt);
    });
}
