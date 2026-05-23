import type { OmdbRatings, OmdbResponse } from './types.js';

export class OmdbError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class OmdbAPI {
  private base = 'http://www.omdbapi.com/';
  private fetchImpl: typeof fetch;

  constructor(private apiKey: string, fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async request(params: Record<string, string>): Promise<OmdbResponse> {
    const url = new URL(this.base);
    url.searchParams.set('apikey', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
    const res = await this.fetchImpl(url.toString());
    if (!res.ok) throw new OmdbError(res.status, `OMDb HTTP ${res.status}`);
    const data = (await res.json()) as OmdbResponse;
    if (data.Response === 'False') {
      throw new OmdbError(404, data.Error ?? 'not found');
    }
    return data;
  }

  async lookupByImdb(imdbId: string): Promise<OmdbResponse> {
    return this.request({ i: imdbId });
  }

  async lookupByTitle(title: string, year?: number): Promise<OmdbResponse> {
    return this.request({ t: title, y: year ? String(year) : '' });
  }
}

export function parseRatings(resp: OmdbResponse): OmdbRatings {
  const out: OmdbRatings = {
    imdb_rating: null,
    imdb_votes: null,
    rt_score: null,
    metacritic: null,
  };
  if (resp.imdbRating && resp.imdbRating !== 'N/A') {
    const v = parseFloat(resp.imdbRating);
    if (Number.isFinite(v)) out.imdb_rating = v;
  }
  if (resp.imdbVotes && resp.imdbVotes !== 'N/A') {
    const v = parseInt(resp.imdbVotes.replace(/,/g, ''), 10);
    if (Number.isFinite(v)) out.imdb_votes = v;
  }
  for (const r of resp.Ratings ?? []) {
    if (r.Source === 'Rotten Tomatoes') {
      const m = r.Value.match(/(\d+)%/);
      if (m) out.rt_score = parseInt(m[1], 10);
    } else if (r.Source === 'Metacritic') {
      const m = r.Value.match(/(\d+)/);
      if (m) out.metacritic = parseInt(m[1], 10);
    } else if (r.Source === 'Internet Movie Database' && out.imdb_rating == null) {
      const m = r.Value.match(/([\d.]+)/);
      if (m) out.imdb_rating = parseFloat(m[1]);
    }
  }
  return out;
}
