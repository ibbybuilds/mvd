import { allGenres, cacheGenres, genresStale, getGenreIdByName, getGenreNameById } from './db.js';
import { TmdbAPI } from './tmdb.js';

export async function ensureGenres(tmdb: TmdbAPI): Promise<void> {
  if (!genresStale()) return;
  const fresh = await tmdb.genres();
  cacheGenres(fresh);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function resolveGenreName(name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const direct = getGenreIdByName(trimmed);
  if (direct != null) return direct;
  const lower = trimmed.toLowerCase();
  const all = allGenres();
  // Substring
  for (const g of all) {
    if (g.name.toLowerCase().includes(lower) || lower.includes(g.name.toLowerCase())) {
      return g.id;
    }
  }
  // Fuzzy (Levenshtein <= 2)
  let best: { id: number; dist: number } | null = null;
  for (const g of all) {
    const d = levenshtein(lower, g.name.toLowerCase());
    if (d <= 2 && (!best || d < best.dist)) best = { id: g.id, dist: d };
  }
  return best?.id ?? null;
}

/**
 * Parse genre spec: comma=AND (TMDB joins with ','), pipe=OR (TMDB joins with '|').
 * Returns { withGenres } ready for TMDB or null if any name unresolved.
 */
export function parseGenreSpec(spec: string): { withGenres: string; unresolved: string[] } {
  let separator: ',' | '|' = ',';
  if (spec.includes('|')) separator = '|';
  const parts = spec.split(separator).map((s) => s.trim()).filter(Boolean);
  const ids: number[] = [];
  const unresolved: string[] = [];
  for (const p of parts) {
    const id = resolveGenreName(p);
    if (id == null) unresolved.push(p);
    else ids.push(id);
  }
  return { withGenres: ids.join(separator), unresolved };
}

export function genreIdsToNames(ids: number[] | undefined): string {
  if (!ids?.length) return '';
  return ids
    .map((id) => getGenreNameById(id))
    .filter((n): n is string => !!n)
    .join(', ');
}
