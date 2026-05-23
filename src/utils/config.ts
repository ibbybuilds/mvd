import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = process.env.MVD_HOME || join(homedir(), '.mvd');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const ENV_FILE = join(CONFIG_DIR, '.env');

export interface MvdDefaults {
  min_votes: number;
  top: number;
  min_rating: number;
  sort: string;
}

export interface MvdConfig {
  defaults: MvdDefaults;
}

const DEFAULTS: MvdDefaults = {
  min_votes: 300,
  top: 10,
  min_rating: 0,
  sort: 'tmdb',
};

export function configDir(): string {
  return CONFIG_DIR;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): MvdConfig {
  if (!existsSync(CONFIG_FILE)) return { defaults: { ...DEFAULTS } };
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    return { defaults: { ...DEFAULTS, ...(raw.defaults || {}) } };
  } catch {
    return { defaults: { ...DEFAULTS } };
  }
}

export function saveConfig(data: MvdConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2) + '\n');
}

function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function writeEnvFile(env: Record<string, string>): void {
  ensureConfigDir();
  const body = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(ENV_FILE, body + '\n');
}

export function loadTmdbKey(): string | null {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  return readEnvFile().TMDB_API_KEY ?? null;
}

export function loadOmdbKey(): string | null {
  if (process.env.OMDB_API_KEY) return process.env.OMDB_API_KEY;
  return readEnvFile().OMDB_API_KEY ?? null;
}

export function saveKeys(tmdb?: string, omdb?: string): void {
  const env = readEnvFile();
  if (tmdb) env.TMDB_API_KEY = tmdb;
  if (omdb) env.OMDB_API_KEY = omdb;
  writeEnvFile(env);
}

export function requireTmdbKey(): string {
  const k = loadTmdbKey();
  if (!k) {
    console.error('Error: TMDB key not set. Run `mvd init` first.');
    process.exit(3);
  }
  return k;
}

export function requireOmdbKey(): string {
  const k = loadOmdbKey();
  if (!k) {
    console.error('Error: OMDb key not set. Run `mvd init` first.');
    process.exit(3);
  }
  return k;
}

export function getDefault<K extends keyof MvdDefaults>(key: K): MvdDefaults[K] {
  return loadConfig().defaults[key];
}

export function setDefault<K extends keyof MvdDefaults>(key: K, value: MvdDefaults[K]): void {
  const cfg = loadConfig();
  cfg.defaults[key] = value;
  saveConfig(cfg);
}
