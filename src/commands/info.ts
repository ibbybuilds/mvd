import { Command } from 'commander';
import { requireOmdbKey, requireTmdbKey } from '../utils/config.js';
import { TmdbAPI, directorOf, posterUrl } from '../utils/tmdb.js';
import { OmdbAPI, parseRatings } from '../utils/omdb.js';
import { getMovie, upsertMovie } from '../utils/db.js';
import { printResult } from '../utils/output.js';
import type { Movie } from '../utils/types.js';

const CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(m: Movie | null): boolean {
  if (!m?.last_synced) return false;
  return Date.now() - new Date(m.last_synced).getTime() < CACHE_FRESH_MS;
}

export function registerInfo(program: Command): void {
  program
    .command('info <id>')
    .description('Full movie details by TMDB id')
    .option('--enrich', 'fetch OMDb scores', false)
    .option('--no-cache', 'force refetch ignoring cache')
    .action(async (idStr: string, opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) {
        console.error('Error: id must be a TMDB numeric ID');
        process.exit(1);
      }
      const cached = getMovie(id);
      let movie: Movie;
      const cachedComplete = !!cached?.imdb_id && !!cached?.director;
      if (cached && isFresh(cached) && cachedComplete && opts.cache !== false) {
        movie = cached;
      } else {
        const tmdb = new TmdbAPI(requireTmdbKey());
        const details = await tmdb.movie(id, { appendCredits: true });
        movie = {
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
        upsertMovie(movie);
      }

      if (opts.enrich && movie.imdb_id) {
        try {
          const omdb = new OmdbAPI(requireOmdbKey());
          const resp = await omdb.lookupByImdb(movie.imdb_id);
          Object.assign(movie, parseRatings(resp));
          upsertMovie(movie);
        } catch (e) {
          console.error('Warning: OMDb enrichment failed.');
        }
      }

      printResult(
        {
          id: movie.tmdb_id,
          imdb_id: movie.imdb_id,
          title: movie.title,
          year: movie.release_year,
          director: movie.director,
          runtime_minutes: movie.runtime_minutes,
          genres: movie.genres,
          tmdb_rating: movie.tmdb_rating,
          tmdb_votes: movie.tmdb_votes,
          imdb_rating: movie.imdb_rating,
          rt_score: movie.rt_score,
          metacritic: movie.metacritic,
          overview: movie.overview,
          poster_url: movie.poster_url,
        },
        fmt
      );
    });
}
