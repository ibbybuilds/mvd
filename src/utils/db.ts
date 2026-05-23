import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { configDir } from './config.js';
import type { Movie, TmdbGenre } from './types.js';

let _db: Database.Database | null = null;

function dbPath(): string {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'movies.db');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS movies (
  tmdb_id INTEGER PRIMARY KEY,
  imdb_id TEXT,
  title TEXT NOT NULL,
  release_date TEXT,
  release_year INTEGER,
  genres TEXT,
  overview TEXT,
  poster_url TEXT,
  tmdb_rating REAL,
  tmdb_votes INTEGER,
  imdb_rating REAL,
  imdb_votes INTEGER,
  rt_score INTEGER,
  metacritic INTEGER,
  runtime_minutes INTEGER,
  director TEXT,
  last_synced TEXT
);

CREATE TABLE IF NOT EXISTS watchlist (
  tmdb_id INTEGER PRIMARY KEY REFERENCES movies(tmdb_id),
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watched (
  tmdb_id INTEGER PRIMARY KEY REFERENCES movies(tmdb_id),
  user_rating INTEGER,
  watched_date TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS watched_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL REFERENCES movies(tmdb_id),
  user_rating INTEGER,
  watched_date TEXT NOT NULL,
  notes TEXT,
  archived_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS genres_cache (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cached_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(release_year);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_rating ON movies(tmdb_rating);
CREATE INDEX IF NOT EXISTS idx_watched_history_tmdb ON watched_history(tmdb_id);
`;

export function initDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath());
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function upsertMovie(movie: Movie): void {
  const db = initDb();
  const stmt = db.prepare(`
    INSERT INTO movies (
      tmdb_id, imdb_id, title, release_date, release_year, genres, overview,
      poster_url, tmdb_rating, tmdb_votes, imdb_rating, imdb_votes, rt_score,
      metacritic, runtime_minutes, director, last_synced
    ) VALUES (
      @tmdb_id, @imdb_id, @title, @release_date, @release_year, @genres, @overview,
      @poster_url, @tmdb_rating, @tmdb_votes, @imdb_rating, @imdb_votes, @rt_score,
      @metacritic, @runtime_minutes, @director, @last_synced
    )
    ON CONFLICT(tmdb_id) DO UPDATE SET
      imdb_id = COALESCE(excluded.imdb_id, movies.imdb_id),
      title = excluded.title,
      release_date = COALESCE(excluded.release_date, movies.release_date),
      release_year = COALESCE(excluded.release_year, movies.release_year),
      genres = COALESCE(excluded.genres, movies.genres),
      overview = COALESCE(excluded.overview, movies.overview),
      poster_url = COALESCE(excluded.poster_url, movies.poster_url),
      tmdb_rating = COALESCE(excluded.tmdb_rating, movies.tmdb_rating),
      tmdb_votes = COALESCE(excluded.tmdb_votes, movies.tmdb_votes),
      imdb_rating = COALESCE(excluded.imdb_rating, movies.imdb_rating),
      imdb_votes = COALESCE(excluded.imdb_votes, movies.imdb_votes),
      rt_score = COALESCE(excluded.rt_score, movies.rt_score),
      metacritic = COALESCE(excluded.metacritic, movies.metacritic),
      runtime_minutes = COALESCE(excluded.runtime_minutes, movies.runtime_minutes),
      director = COALESCE(excluded.director, movies.director),
      last_synced = excluded.last_synced
  `);
  stmt.run({
    tmdb_id: movie.tmdb_id,
    imdb_id: movie.imdb_id ?? null,
    title: movie.title,
    release_date: movie.release_date ?? null,
    release_year: movie.release_year ?? null,
    genres: movie.genres ?? null,
    overview: movie.overview ?? null,
    poster_url: movie.poster_url ?? null,
    tmdb_rating: movie.tmdb_rating ?? null,
    tmdb_votes: movie.tmdb_votes ?? null,
    imdb_rating: movie.imdb_rating ?? null,
    imdb_votes: movie.imdb_votes ?? null,
    rt_score: movie.rt_score ?? null,
    metacritic: movie.metacritic ?? null,
    runtime_minutes: movie.runtime_minutes ?? null,
    director: movie.director ?? null,
    last_synced: movie.last_synced ?? new Date().toISOString(),
  });
}

export function getMovie(tmdb_id: number): Movie | null {
  const db = initDb();
  const row = db.prepare('SELECT * FROM movies WHERE tmdb_id = ?').get(tmdb_id) as Movie | undefined;
  return row ?? null;
}

export function addToWatchlist(tmdb_id: number): void {
  const db = initDb();
  db.prepare(
    'INSERT OR IGNORE INTO watchlist (tmdb_id, added_at) VALUES (?, ?)'
  ).run(tmdb_id, new Date().toISOString());
}

export function removeFromWatchlist(tmdb_id: number): void {
  const db = initDb();
  db.prepare('DELETE FROM watchlist WHERE tmdb_id = ?').run(tmdb_id);
}

export function inWatchlist(tmdb_id: number): boolean {
  const db = initDb();
  const row = db.prepare('SELECT 1 FROM watchlist WHERE tmdb_id = ?').get(tmdb_id);
  return !!row;
}

export type WatchlistSort = 'rating' | 'added' | 'year' | 'title';

export function listWatchlist(opts: { sort?: WatchlistSort } = {}): Movie[] {
  const db = initDb();
  const sortMap: Record<WatchlistSort, string> = {
    rating: 'm.tmdb_rating DESC NULLS LAST',
    added: 'w.added_at DESC',
    year: 'm.release_year DESC NULLS LAST',
    title: 'm.title ASC',
  };
  const order = sortMap[opts.sort ?? 'added'];
  return db
    .prepare(
      `SELECT m.* FROM watchlist w JOIN movies m ON m.tmdb_id = w.tmdb_id ORDER BY ${order}`
    )
    .all() as Movie[];
}

export function markWatched(
  tmdb_id: number,
  rating?: number | null,
  date?: string | null,
  notes?: string | null
): void {
  const db = initDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM watchlist WHERE tmdb_id = ?').run(tmdb_id);
    db.prepare(
      `INSERT INTO watched (tmdb_id, user_rating, watched_date, notes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         user_rating = COALESCE(excluded.user_rating, watched.user_rating),
         watched_date = excluded.watched_date,
         notes = COALESCE(excluded.notes, watched.notes)`
    ).run(tmdb_id, rating ?? null, date ?? new Date().toISOString().slice(0, 10), notes ?? null);
  });
  tx();
}

export function unwatch(tmdb_id: number): void {
  const db = initDb();
  const tx = db.transaction(() => {
    const row = db
      .prepare('SELECT user_rating, watched_date, notes FROM watched WHERE tmdb_id = ?')
      .get(tmdb_id) as { user_rating: number | null; watched_date: string; notes: string | null } | undefined;
    if (row) {
      db.prepare(
        `INSERT INTO watched_history (tmdb_id, user_rating, watched_date, notes, archived_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(tmdb_id, row.user_rating, row.watched_date, row.notes, new Date().toISOString());
      db.prepare('DELETE FROM watched WHERE tmdb_id = ?').run(tmdb_id);
    }
    db.prepare('INSERT OR IGNORE INTO watchlist (tmdb_id, added_at) VALUES (?, ?)').run(
      tmdb_id,
      new Date().toISOString()
    );
  });
  tx();
}

export type WatchedSort = 'rating' | 'date' | 'title';

export interface WatchedRow extends Movie {
  user_rating: number | null;
  watched_date: string;
  notes: string | null;
}

export function listWatched(opts: { sort?: WatchedSort } = {}): WatchedRow[] {
  const db = initDb();
  const sortMap: Record<WatchedSort, string> = {
    rating: 'w.user_rating DESC NULLS LAST',
    date: 'w.watched_date DESC',
    title: 'm.title ASC',
  };
  const order = sortMap[opts.sort ?? 'date'];
  return db
    .prepare(
      `SELECT m.*, w.user_rating, w.watched_date, w.notes
       FROM watched w JOIN movies m ON m.tmdb_id = w.tmdb_id
       ORDER BY ${order}`
    )
    .all() as WatchedRow[];
}

export function cacheGenres(genres: TmdbGenre[]): void {
  const db = initDb();
  const now = new Date().toISOString();
  const tx = db.transaction((gs: TmdbGenre[]) => {
    db.prepare('DELETE FROM genres_cache').run();
    const stmt = db.prepare(
      'INSERT INTO genres_cache (id, name, cached_at) VALUES (?, ?, ?)'
    );
    for (const g of gs) stmt.run(g.id, g.name, now);
  });
  tx(genres);
}

export function allGenres(): TmdbGenre[] {
  const db = initDb();
  return db.prepare('SELECT id, name FROM genres_cache').all() as TmdbGenre[];
}

export function getGenreIdByName(name: string): number | null {
  const db = initDb();
  const row = db
    .prepare('SELECT id FROM genres_cache WHERE LOWER(name) = LOWER(?)')
    .get(name) as { id: number } | undefined;
  return row?.id ?? null;
}

export function getGenreNameById(id: number): string | null {
  const db = initDb();
  const row = db.prepare('SELECT name FROM genres_cache WHERE id = ?').get(id) as
    | { name: string }
    | undefined;
  return row?.name ?? null;
}

export function genresStale(): boolean {
  const db = initDb();
  const row = db
    .prepare('SELECT MAX(cached_at) AS latest, COUNT(*) AS n FROM genres_cache')
    .get() as { latest: string | null; n: number };
  if (!row || row.n === 0 || !row.latest) return true;
  const ageMs = Date.now() - new Date(row.latest).getTime();
  return ageMs > 30 * 24 * 60 * 60 * 1000;
}
