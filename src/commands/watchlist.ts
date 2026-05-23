import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { requireTmdbKey } from '../utils/config.js';
import { TmdbAPI } from '../utils/tmdb.js';
import {
  addToWatchlist,
  listWatchlist,
  removeFromWatchlist,
  type WatchlistSort,
} from '../utils/db.js';
import { printResult } from '../utils/output.js';
import { ensureGenres } from '../utils/genres.js';
import { ensureMovie } from '../utils/enrich.js';

async function promptPick(max: number): Promise<number | null> {
  const rl = createInterface({ input, output });
  try {
    const ans = (await rl.question(`Pick row [1-${max}], or q to cancel: `)).trim();
    if (ans.toLowerCase() === 'q') return null;
    const n = parseInt(ans, 10);
    if (!Number.isFinite(n) || n < 1 || n > max) return null;
    return n - 1;
  } finally {
    rl.close();
  }
}

export function registerWatchlist(program: Command): void {
  program
    .command('add <idOrQuery...>')
    .description('Add to watchlist by TMDB id or title')
    .option('--id', 'force numeric arg as TMDB id (default for pure-numeric input)', false)
    .option('--title', 'force arg to be searched as a title (use for numeric titles like "1984")', false)
    .option('--no-prompt', 'auto-pick top result on multi-match (agent mode)')
    .action(async (idOrQuery: string[], opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      const tmdb = new TmdbAPI(requireTmdbKey());
      await ensureGenres(tmdb);
      const arg = idOrQuery.join(' ').trim();
      if (!arg) {
        console.error('Error: provide a TMDB id or title');
        process.exit(1);
      }

      // Numeric arg = TMDB id (per spec). Use --title to force search for numeric titles like "1984".
      const isNumeric = /^\d+$/.test(arg);
      const treatAsId = opts.id || (isNumeric && !opts.title);

      let chosenId: number;
      if (treatAsId) {
        chosenId = parseInt(arg, 10);
      } else {
        const results = await tmdb.search(arg);
        if (results.length === 0) {
          console.error('Error: no matches found');
          process.exit(1);
        }
        if (results.length === 1 || opts.prompt === false) {
          chosenId = results[0].id;
        } else {
          const top = results.slice(0, 10);
          console.error('Multiple matches:');
          top.forEach((r, i) => {
            const yr = r.release_date?.slice(0, 4) ?? '????';
            const rating = r.vote_average?.toFixed(1) ?? '-';
            console.error(`  ${i + 1}. ${r.title} (${yr}) — ${rating}`);
          });
          if (!process.stdin.isTTY) {
            console.error('Non-interactive. Use --no-prompt or pass --id <tmdb_id>.');
            process.exit(1);
          }
          const idx = await promptPick(top.length);
          if (idx == null) {
            console.error('Cancelled.');
            process.exit(1);
          }
          chosenId = top[idx].id;
        }
      }

      const movie = await ensureMovie(tmdb,chosenId);
      addToWatchlist(movie.tmdb_id);
      printResult(
        {
          added: movie.title,
          year: movie.release_year,
          tmdb_id: movie.tmdb_id,
          tmdb_rating: movie.tmdb_rating,
        },
        fmt
      );
    });

  program
    .command('remove <id>')
    .description('Remove from watchlist (keeps movie in cache)')
    .action(async (idStr: string, _opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) {
        console.error('Error: id must be numeric');
        process.exit(1);
      }
      removeFromWatchlist(id);
      printResult({ removed: id }, fmt);
    });

  program
    .command('list')
    .description('Show watchlist')
    .option('--sort <field>', 'rating | added | year | title', 'added')
    .action(async (opts, cmd) => {
      const fmt = cmd.parent?.opts().format ?? 'auto';
      const rows = listWatchlist({ sort: opts.sort as WatchlistSort });
      const view = rows.map((m) => ({
        id: m.tmdb_id,
        title: m.title,
        year: m.release_year ?? '',
        tmdb: m.tmdb_rating?.toFixed(1) ?? '',
        imdb: m.imdb_rating?.toFixed(1) ?? '',
        genres: m.genres ?? '',
      }));
      printResult(view, fmt);
    });
}
