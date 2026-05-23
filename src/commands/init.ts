import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadOmdbKey, loadTmdbKey, saveKeys } from '../utils/config.js';
import { TmdbAPI } from '../utils/tmdb.js';
import { cacheGenres } from '../utils/db.js';

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const ans = await rl.question(question);
    return ans.trim();
  } finally {
    rl.close();
  }
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Set up mvd with TMDB + OMDb API keys')
    .option('--tmdb <key>', 'TMDB v4 read access token')
    .option('--omdb <key>', 'OMDb API key')
    .action(async (opts) => {
      let tmdb = opts.tmdb || loadTmdbKey();
      let omdb = opts.omdb || loadOmdbKey();

      const interactive = process.stdin.isTTY && !opts.tmdb && !opts.omdb;
      if (interactive) {
        if (!tmdb) tmdb = await prompt('TMDB v4 read access token: ');
        if (!omdb) omdb = await prompt('OMDb API key: ');
      }

      if (!tmdb) {
        console.error('Error: TMDB key required. Use --tmdb <key> or run interactively.');
        process.exit(1);
      }

      // Validate by fetching genres
      try {
        const api = new TmdbAPI(tmdb);
        const genres = await api.genres();
        cacheGenres(genres);
      } catch {
        console.error('Error: TMDB key invalid or network failure.');
        process.exit(2);
      }

      saveKeys(tmdb, omdb || undefined);
      console.log('Keys saved to ~/.mvd/.env');
      if (!omdb) {
        console.log('Note: OMDb key not set. --enrich and --sort imdb will fail until configured.');
      }
      console.log('Ready. Try: mvd discover --year 2024 --min-rating 7');
    });
}
