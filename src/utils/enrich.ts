import { loadOmdbKey } from './config.js';
import { getMovie, upsertMovie } from './db.js';
import { OmdbAPI, parseRatings } from './omdb.js';
import { TmdbAPI, directorOf, posterUrl } from './tmdb.js';
import type { Movie } from './types.js';

/**
 * Resolve a movie by TMDB id with full enrichment when possible.
 * - Returns cached row if it already has imdb_id + director + imdb_rating
 * - Otherwise fetches TMDB details (w/ credits) and, if OMDb key present and imdb_id known, OMDb ratings
 * - Upserts the merged row before returning
 */
export async function ensureMovie(tmdb: TmdbAPI, id: number): Promise<Movie> {
  const cached = getMovie(id);
  const omdbKey = loadOmdbKey();
  const needsDetails = !cached || !cached.imdb_id || !cached.director;
  const needsRatings = !!omdbKey && (!cached || cached.imdb_rating == null);

  let movie: Movie;
  if (cached && !needsDetails) {
    movie = cached;
  } else {
    const details = await tmdb.movie(id, { appendCredits: true });
    movie = {
      tmdb_id: details.id,
      imdb_id: details.imdb_id ?? cached?.imdb_id ?? null,
      title: details.title,
      release_date: details.release_date ?? null,
      release_year: details.release_date
        ? parseInt(details.release_date.slice(0, 4), 10)
        : null,
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

  if (omdbKey && movie.imdb_id && needsRatings) {
    try {
      const resp = await new OmdbAPI(omdbKey).lookupByImdb(movie.imdb_id);
      const ratings = parseRatings(resp);
      Object.assign(movie, ratings);
      upsertMovie(movie);
    } catch {
      // non-fatal
    }
  }
  return movie;
}
