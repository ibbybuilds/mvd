import test from 'node:test';
import assert from 'node:assert/strict';
import { OmdbAPI, OmdbError, parseRatings } from '../src/utils/omdb.ts';

function mockFetch(body: any, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
      async text() {
        return JSON.stringify(body);
      },
    } as Response)) as unknown as typeof fetch;
}

test('lookupByImdb returns parsed body', async () => {
  const omdb = new OmdbAPI(
    'k',
    mockFetch({
      Response: 'True',
      Title: 'Fight Club',
      imdbRating: '8.8',
      imdbVotes: '2,300,000',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.8/10' },
        { Source: 'Rotten Tomatoes', Value: '79%' },
        { Source: 'Metacritic', Value: '66/100' },
      ],
    })
  );
  const r = await omdb.lookupByImdb('tt0137523');
  const parsed = parseRatings(r);
  assert.equal(parsed.imdb_rating, 8.8);
  assert.equal(parsed.imdb_votes, 2300000);
  assert.equal(parsed.rt_score, 79);
  assert.equal(parsed.metacritic, 66);
});

test('omdb 404 (Response False) throws', async () => {
  const omdb = new OmdbAPI('k', mockFetch({ Response: 'False', Error: 'not found' }));
  await assert.rejects(() => omdb.lookupByImdb('tt0'), OmdbError);
});

test('parseRatings handles missing fields', () => {
  const r = parseRatings({ Response: 'True', Title: 'x' });
  assert.equal(r.imdb_rating, null);
  assert.equal(r.rt_score, null);
});
