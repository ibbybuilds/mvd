import { createRequire } from 'module';
import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerDiscover } from './commands/discover.js';
import { registerSearch } from './commands/search.js';
import { registerInfo } from './commands/info.js';
import { registerWatchlist } from './commands/watchlist.js';
import { registerWatched } from './commands/watched.js';
import { registerSync } from './commands/sync.js';
import { TmdbError } from './utils/tmdb.js';
import { OmdbError } from './utils/omdb.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('mvd')
  .description('mvd — Movie discovery + watchlist CLI for humans and agents')
  .version(version)
  .option(
    '--format <fmt>',
    'Output format: json, yaml, table, auto (auto = yaml when piped, table in TTY)',
    'auto'
  );

registerInit(program);
registerDiscover(program);
registerSearch(program);
registerInfo(program);
registerWatchlist(program);
registerWatched(program);
registerSync(program);

program.parseAsync().catch((err) => {
  if (err instanceof TmdbError) {
    console.error(`TMDB error ${err.status}:`, err.body);
    process.exit(2);
  }
  if (err instanceof OmdbError) {
    console.error(`OMDb error ${err.status}: ${err.message}`);
    process.exit(2);
  }
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
