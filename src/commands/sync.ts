import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { initDb } from '../utils/db.js';
import { printResult } from '../utils/output.js';

interface ExportPayload {
  mvd_version: number;
  exported_at: string;
  movies: Record<string, unknown>[];
  watchlist: Record<string, unknown>[];
  watched: Record<string, unknown>[];
  watched_history: Record<string, unknown>[];
  genres_cache: Record<string, unknown>[];
}

const SCHEMA_VERSION = 1;

function exportAll(): ExportPayload {
  const db = initDb();
  return {
    mvd_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    movies: db.prepare('SELECT * FROM movies').all() as Record<string, unknown>[],
    watchlist: db.prepare('SELECT * FROM watchlist').all() as Record<string, unknown>[],
    watched: db.prepare('SELECT * FROM watched').all() as Record<string, unknown>[],
    watched_history: db.prepare('SELECT * FROM watched_history').all() as Record<string, unknown>[],
    genres_cache: db.prepare('SELECT * FROM genres_cache').all() as Record<string, unknown>[],
  };
}

function toSqlDump(p: ExportPayload): string {
  const lines: string[] = [];
  lines.push(`-- mvd export v${p.mvd_version} @ ${p.exported_at}`);
  lines.push('BEGIN TRANSACTION;');
  const sqlVal = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const dumpTable = (table: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    for (const row of rows) {
      lines.push(
        `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols
          .map((c) => sqlVal(row[c]))
          .join(', ')});`
      );
    }
  };
  dumpTable('movies', p.movies);
  dumpTable('watchlist', p.watchlist);
  dumpTable('watched', p.watched);
  dumpTable('watched_history', p.watched_history);
  dumpTable('genres_cache', p.genres_cache);
  lines.push('COMMIT;');
  return lines.join('\n') + '\n';
}

interface ImportStats {
  movies: { added: number; updated: number };
  watchlist: { added: number; skipped: number };
  watched: { added: number; updated: number };
  watched_history: { added: number };
  genres_cache: { replaced: number };
}

function applyImport(payload: ExportPayload, opts: { replace: boolean }): ImportStats {
  const db = initDb();
  if (payload.mvd_version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported export version ${payload.mvd_version} (expected ${SCHEMA_VERSION})`);
  }

  const stats: ImportStats = {
    movies: { added: 0, updated: 0 },
    watchlist: { added: 0, skipped: 0 },
    watched: { added: 0, updated: 0 },
    watched_history: { added: 0 },
    genres_cache: { replaced: 0 },
  };

  const tx = db.transaction(() => {
    if (opts.replace) {
      db.prepare('DELETE FROM watched_history').run();
      db.prepare('DELETE FROM watched').run();
      db.prepare('DELETE FROM watchlist').run();
      db.prepare('DELETE FROM movies').run();
      db.prepare('DELETE FROM genres_cache').run();
    }

    // movies
    for (const m of payload.movies) {
      const existing = db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id = ?').get(m.tmdb_id);
      const cols = Object.keys(m);
      const placeholders = cols.map((c) => `@${c}`).join(', ');
      db.prepare(
        `INSERT OR REPLACE INTO movies (${cols.join(', ')}) VALUES (${placeholders})`
      ).run(m);
      if (existing) stats.movies.updated++;
      else stats.movies.added++;
    }

    // watchlist (idempotent)
    for (const w of payload.watchlist) {
      const r = db
        .prepare('INSERT OR IGNORE INTO watchlist (tmdb_id, added_at) VALUES (?, ?)')
        .run(w.tmdb_id, w.added_at);
      if (r.changes) stats.watchlist.added++;
      else stats.watchlist.skipped++;
    }

    // watched (upsert by tmdb_id)
    for (const w of payload.watched) {
      const existing = db.prepare('SELECT tmdb_id FROM watched WHERE tmdb_id = ?').get(w.tmdb_id);
      db.prepare(
        `INSERT OR REPLACE INTO watched (tmdb_id, user_rating, watched_date, notes) VALUES (?, ?, ?, ?)`
      ).run(w.tmdb_id, w.user_rating ?? null, w.watched_date, w.notes ?? null);
      if (existing) stats.watched.updated++;
      else stats.watched.added++;
    }

    // watched_history (append-only, dedupe by tmdb_id+watched_date+archived_at)
    for (const h of payload.watched_history) {
      const exists = db
        .prepare(
          'SELECT 1 FROM watched_history WHERE tmdb_id = ? AND watched_date = ? AND archived_at = ?'
        )
        .get(h.tmdb_id, h.watched_date, h.archived_at);
      if (exists) continue;
      db.prepare(
        `INSERT INTO watched_history (tmdb_id, user_rating, watched_date, notes, archived_at) VALUES (?, ?, ?, ?, ?)`
      ).run(h.tmdb_id, h.user_rating ?? null, h.watched_date, h.notes ?? null, h.archived_at);
      stats.watched_history.added++;
    }

    // genres_cache (replace wholesale, latest wins)
    if (payload.genres_cache.length) {
      db.prepare('DELETE FROM genres_cache').run();
      for (const g of payload.genres_cache) {
        db.prepare(
          'INSERT INTO genres_cache (id, name, cached_at) VALUES (?, ?, ?)'
        ).run(g.id, g.name, g.cached_at);
        stats.genres_cache.replaced++;
      }
    }
  });
  tx();
  return stats;
}

export function registerSync(program: Command): void {
  program
    .command('export')
    .description('Export full mvd state (movies, watchlist, watched, history)')
    .option('--as <kind>', 'json | sql', 'json')
    .option('--out <path>', 'write to file instead of stdout')
    .action(async (opts) => {
      const payload = exportAll();
      const body =
        opts.as === 'sql' ? toSqlDump(payload) : JSON.stringify(payload, null, 2) + '\n';
      if (opts.out) {
        writeFileSync(opts.out, body);
        console.error(`Wrote ${body.length} bytes to ${opts.out}`);
      } else {
        process.stdout.write(body);
      }
    });

  program
    .command('import <file>')
    .description('Import mvd state from JSON export (default: merge)')
    .option('--replace', 'wipe local state before import (DANGEROUS)', false)
    .action(async (file: string, opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      let raw: string;
      try {
        raw = readFileSync(file, 'utf-8');
      } catch (e: any) {
        console.error(`Error reading ${file}: ${e.message}`);
        process.exit(1);
      }
      let payload: ExportPayload;
      try {
        payload = JSON.parse(raw);
      } catch {
        console.error('Error: only JSON imports supported. For .sql, pipe through sqlite3 directly.');
        process.exit(1);
      }
      const stats = applyImport(payload, { replace: opts.replace });
      printResult(stats, fmt);
    });
}
