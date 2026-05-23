import { Command } from 'commander';
import { requireOmdbKey, requireTmdbKey } from '../utils/config.js';
import { TmdbAPI, tmdbToMovie } from '../utils/tmdb.js';
import { OmdbAPI, parseRatings } from '../utils/omdb.js';
import { ensureGenres, genreIdsToNames, parseGenreSpec } from '../utils/genres.js';
import { upsertMovie } from '../utils/db.js';
import { printResult } from '../utils/output.js';
import type { Movie } from '../utils/types.js';

type SortField = 'tmdb' | 'imdb' | 'popularity' | 'release' | 'title';

function tmdbSortBy(sort: SortField): string {
  switch (sort) {
    case 'popularity':
      return 'popularity.desc';
    case 'release':
      return 'primary_release_date.desc';
    case 'title':
      return 'title.asc';
    case 'tmdb':
    default:
      return 'vote_average.desc';
  }
}

export function registerDiscover(program: Command): void {
  program
    .command('discover')
    .description('Discover movies by year, genre, rating, votes')
    .option('--year <int>', 'primary release year', (v) => parseInt(v, 10))
    .option('--genre <name>', 'genre name(s). Comma = AND, pipe = OR')
    .option('--min-rating <float>', 'minimum TMDB rating', (v) => parseFloat(v), 0)
    .option('--min-votes <int>', 'minimum vote count', (v) => parseInt(v, 10), 300)
    .option('--top <int>', 'limit results', (v) => parseInt(v, 10), 10)
    .option('--sort <field>', 'tmdb | imdb | popularity | release | title', 'tmdb')
    .option('--enrich', 'fetch OMDb scores per result', false)
    .action(async (opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      const tmdbKey = requireTmdbKey();
      const tmdb = new TmdbAPI(tmdbKey);
      await ensureGenres(tmdb);

      let withGenres: string | undefined;
      if (opts.genre) {
        const parsed = parseGenreSpec(opts.genre);
        if (parsed.unresolved.length) {
          console.error(`Error: unknown genre(s): ${parsed.unresolved.join(', ')}`);
          process.exit(1);
        }
        withGenres = parsed.withGenres;
      }

      const sort: SortField = opts.sort;
      const needsEnrich = opts.enrich || sort === 'imdb';

      const results = await tmdb.discoverMany(
        {
          primary_release_year: opts.year,
          with_genres: withGenres,
          vote_average_gte: opts.minRating,
          vote_count_gte: opts.minVotes,
          sort_by: tmdbSortBy(sort === 'imdb' ? 'tmdb' : sort),
        },
        opts.top
      );

      let movies: Movie[] = results.map((r) =>
        tmdbToMovie(r, { genres: genreIdsToNames(r.genre_ids) })
      );

      if (needsEnrich) {
        const omdbKey = requireOmdbKey();
        const omdb = new OmdbAPI(omdbKey);
        for (const m of movies) {
          try {
            // Need imdb_id — fetch movie details
            if (!m.imdb_id) {
              const details = await tmdb.movie(m.tmdb_id);
              m.imdb_id = details.imdb_id ?? null;
              m.runtime_minutes = details.runtime ?? null;
            }
            if (m.imdb_id) {
              const resp = await omdb.lookupByImdb(m.imdb_id);
              const r = parseRatings(resp);
              Object.assign(m, r);
            }
          } catch {
            // Skip individual failures
          }
        }
      }

      // Sort
      if (sort === 'imdb') {
        movies.sort((a, b) => (b.imdb_rating ?? 0) - (a.imdb_rating ?? 0));
      } else if (sort === 'title') {
        movies.sort((a, b) => a.title.localeCompare(b.title));
      } else if (sort === 'release') {
        movies.sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''));
      } else if (sort === 'tmdb') {
        movies.sort((a, b) => (b.tmdb_rating ?? 0) - (a.tmdb_rating ?? 0));
      }

      // Upsert
      for (const m of movies) upsertMovie(m);

      const rows = movies.map((m) => ({
        id: m.tmdb_id,
        title: m.title,
        year: m.release_year ?? '',
        tmdb: m.tmdb_rating?.toFixed(1) ?? '',
        votes: m.tmdb_votes ?? '',
        imdb: m.imdb_rating?.toFixed(1) ?? '',
        rt: m.rt_score != null ? `${m.rt_score}%` : '',
        meta: m.metacritic ?? '',
        genres: m.genres ?? '',
      }));

      printResult(rows, fmt);
    });
}
