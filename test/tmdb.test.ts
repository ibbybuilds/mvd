import test from 'node:test';
import assert from 'node:assert/strict';
import { TmdbAPI, TmdbError, tmdbToMovie, posterUrl, directorOf } from '../src/utils/tmdb.ts';

function mockFetch(responses: Array<{ status?: number; body: unknown }>): typeof fetch {
  let i = 0;
  return (async (_url: string) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return r.body;
      },
      async text() {
        return JSON.stringify(r.body);
      },
    } as Response;
  }) as unknown as typeof fetch;
}

test('discover returns results', async () => {
  const tmdb = new TmdbAPI(
    'k',
    mockFetch([
      {
        body: {
          results: [{ id: 1, title: 'A', vote_average: 7.5, vote_count: 1000, release_date: '2024-01-01' }],
        },
      },
    ])
  );
  const r = await tmdb.discover({ primary_release_year: 2024 });
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'A');
});

test('retries on 429 then succeeds', async () => {
  const tmdb = new TmdbAPI(
    'k',
    mockFetch([
      { status: 429, body: { status_message: 'rate limit' } },
      { body: { results: [{ id: 2, title: 'B' }] } },
    ])
  );
  const r = await tmdb.discover({});
  assert.equal(r[0].id, 2);
});

test('throws TmdbError on persistent failure', async () => {
  const tmdb = new TmdbAPI(
    'k',
    mockFetch([
      { status: 401, body: { status_message: 'bad token' } },
    ])
  );
  await assert.rejects(() => tmdb.discover({}), TmdbError);
});

test('tmdbToMovie maps fields', () => {
  const m = tmdbToMovie({
    id: 5,
    title: 'X',
    release_date: '2020-05-01',
    vote_average: 8,
    vote_count: 500,
    poster_path: '/abc.jpg',
  });
  assert.equal(m.release_year, 2020);
  assert.equal(m.poster_url, 'https://image.tmdb.org/t/p/w500/abc.jpg');
});

test('posterUrl null-safe', () => {
  assert.equal(posterUrl(null), null);
});

test('directorOf extracts from credits', () => {
  const d = directorOf({
    id: 1,
    title: 'X',
    credits: { crew: [{ job: 'Producer', name: 'P' }, { job: 'Director', name: 'D' }] },
  } as any);
  assert.equal(d, 'D');
});

test('discoverMany paginates until top reached', async () => {
  const page1 = { results: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: `M${i}` })) };
  const page2 = { results: Array.from({ length: 20 }, (_, i) => ({ id: i + 21, title: `M${i + 20}` })) };
  const tmdb = new TmdbAPI('k', mockFetch([{ body: page1 }, { body: page2 }]));
  const r = await tmdb.discoverMany({}, 25);
  assert.equal(r.length, 25);
  assert.equal(r[24].id, 25);
});
