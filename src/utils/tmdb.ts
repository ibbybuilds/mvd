import type {
  DiscoverParams,
  TmdbGenre,
  TmdbMovie,
  TmdbMovieDetails,
} from './types.js';

export class TmdbError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `TMDB request failed: ${status}`);
  }
}

class RateLimiter {
  private timestamps: number[] = [];
  constructor(private maxRequests = 38, private windowMs = 10_000) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const wait = this.windowMs - (now - this.timestamps[0]) + 50;
      await new Promise((r) => setTimeout(r, wait));
      return this.acquire();
    }
    this.timestamps.push(Date.now());
  }
}

export class TmdbAPI {
  private base = 'https://api.themoviedb.org/3';
  private limiter = new RateLimiter();
  private fetchImpl: typeof fetch;

  constructor(private apiKey: string, fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async request<T>(
    path: string,
    query: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    await this.limiter.acquire();
    let res = await this.fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        accept: 'application/json',
      },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      await this.limiter.acquire();
      res = await this.fetchImpl(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          accept: 'application/json',
        },
      });
    }
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      throw new TmdbError(res.status, body);
    }
    return (await res.json()) as T;
  }

  async discover(params: DiscoverParams): Promise<TmdbMovie[]> {
    const data = await this.request<{ results: TmdbMovie[] }>('/discover/movie', {
      primary_release_year: params.primary_release_year,
      with_genres: params.with_genres,
      'vote_average.gte': params.vote_average_gte,
      'vote_count.gte': params.vote_count_gte,
      sort_by: params.sort_by ?? 'popularity.desc',
      page: params.page ?? 1,
      include_adult: 'false',
    });
    return data.results;
  }

  async discoverMany(params: DiscoverParams, top: number): Promise<TmdbMovie[]> {
    const out: TmdbMovie[] = [];
    let page = 1;
    while (out.length < top && page <= 5) {
      const r = await this.discover({ ...params, page });
      if (r.length === 0) break;
      out.push(...r);
      page++;
    }
    return out.slice(0, top);
  }

  async search(query: string, year?: number): Promise<TmdbMovie[]> {
    const data = await this.request<{ results: TmdbMovie[] }>('/search/movie', {
      query,
      year,
      include_adult: 'false',
    });
    return data.results;
  }

  async movie(
    id: number,
    opts: { appendCredits?: boolean } = {}
  ): Promise<TmdbMovieDetails> {
    return this.request<TmdbMovieDetails>(`/movie/${id}`, {
      append_to_response: opts.appendCredits ? 'credits' : undefined,
    });
  }

  async recommendations(id: number): Promise<TmdbMovie[]> {
    const data = await this.request<{ results: TmdbMovie[] }>(
      `/movie/${id}/recommendations`
    );
    return data.results;
  }

  async genres(): Promise<TmdbGenre[]> {
    const data = await this.request<{ genres: TmdbGenre[] }>('/genre/movie/list');
    return data.genres;
  }
}

export function posterUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/w500${path}`;
}

export function directorOf(details: TmdbMovieDetails): string | null {
  const crew = details.credits?.crew;
  if (!crew) return null;
  const d = crew.find((c) => c.job === 'Director');
  return d?.name ?? null;
}

export function tmdbToMovie(
  m: TmdbMovie,
  extra: Partial<{ imdb_id: string; runtime: number; director: string; genres: string }> = {}
): import('./types.js').Movie {
  const year = m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : null;
  return {
    tmdb_id: m.id,
    imdb_id: extra.imdb_id ?? null,
    title: m.title,
    release_date: m.release_date ?? null,
    release_year: Number.isFinite(year) ? year : null,
    genres: extra.genres ?? null,
    overview: m.overview ?? null,
    poster_url: posterUrl(m.poster_path),
    tmdb_rating: m.vote_average ?? null,
    tmdb_votes: m.vote_count ?? null,
    runtime_minutes: extra.runtime ?? null,
    director: extra.director ?? null,
    last_synced: new Date().toISOString(),
  };
}
