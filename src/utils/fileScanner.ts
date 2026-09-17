import fg from 'fast-glob';
import * as path from 'path';

export const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/venv/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/.parcel-cache/**',
  // Build output that is not literally called `dist`. A bundle is a copy of the
  // source, so scanning it counts every signal twice and — worse — produces evidence
  // pointing at a generated file. This product's promise is that a finding names a
  // file you can open and argue with; `dist-worker/index.js:254` is not that. Found by
  // analysing prodkit-cloud, whose worker bundle is emitted to `dist-worker/`.
  '**/dist-*/**',
  '**/out/**',
  '**/.output/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
  '**/.nuxt/**',
  '**/.vercel/**',
  '**/.netlify/**',
  '**/target/**',
  '**/*.min.js',
  '**/*.bundle.js',
  // Test fixtures are sample applications, often deliberately insecure, and they are
  // not the product. Scanning them makes a repository inherit the stack and the
  // defects of its own test data: prodkit analysing itself reported express, next,
  // nestjs, flask, fastapi, django, react, vue and electron, none of which it uses,
  // because each has a fixture directory under tests/fixtures.
  '**/fixtures/**',
  '**/__fixtures__/**',
  '**/testdata/**',
  '**/__snapshots__/**',
];

export interface ScanOptions {
  cwd: string;
  patterns?: string[];
  ignore?: string[];
}

/**
 * Scan files relative to a root project path. Returns paths relative to cwd.
 */
export async function scanFiles(opts: ScanOptions): Promise<string[]> {
  const patterns = opts.patterns ?? ['**/*'];
  const ignore = [...DEFAULT_IGNORE, ...(opts.ignore ?? [])];
  const entries = await fg(patterns, {
    cwd: opts.cwd,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore,
    suppressErrors: true,
  });
  return entries.map((e) => e.split(path.sep).join('/'));
}

/**
 * Quick check: does at least one path matching glob exist?
 */
export async function hasFile(cwd: string, patterns: string[]): Promise<string | null> {
  const found = await fg(patterns, {
    cwd,
    dot: true,
    onlyFiles: true,
    ignore: DEFAULT_IGNORE,
    suppressErrors: true,
  });
  return found.length > 0 ? found[0] : null;
}
