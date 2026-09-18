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
  /**
   * Where Python puts what you installed, whatever the surrounding directory is called.
   *
   * `venv/` and `.venv/` were ignored by name, and a repository whose virtualenv was
   * called `venv52/` had 7331 of its 8438 source files read as its own: botocore, boto3,
   * the whole of pip's output. It produced a critical — `SECRET_KEY =
   * 'AWS_SECRET_ACCESS_KEY'`, which is botocore naming an environment variable — against
   * a project that had not written it.
   *
   * This is `node_modules` for Python, and like `node_modules` it cannot be anything
   * else. The name of the virtualenv is a guess; `site-packages` is a fact.
   */
  '**/site-packages/**',
  '**/dist-packages/**',
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
  /**
   * Somebody else's code, copied into this repository by a package manager.
   *
   * These are not `node_modules` by name, so they were scanned as if the project had
   * written them. A Unity game turned into a "b2b-saas with subscriptions, an
   * administrative surface and accounts", 6054 source files strong, because
   * `Library/PackageCache/` holds the 65 engine packages Unity downloads — and the
   * evidence for those subscriptions was `STRIPE_LEN` in Unity's own xxHash
   * implementation, where a stripe is a block of bytes.
   *
   * The engine paths are anchored at the root rather than `**`-prefixed: Unity's
   * generated `Library/` sits beside `Assets/`, and a `src/Library/` a developer wrote
   * is theirs to be judged on.
   */
  'Library/**',
  'Temp/**',
  'Logs/**',
  'Builds/**',
  '.godot/**',
  'Binaries/**',
  'Intermediate/**',
  'DerivedData/**',
  '**/Pods/**',
  /**
   * Flutter's own generated tooling, and the word it chose for it.
   *
   * `ios/Flutter/ephemeral/` holds scripts Flutter writes and rewrites — one of them a
   * Python helper for lldb. Its imports were being read as the project's dependencies,
   * so a Dart application's report said some of its dependencies came from Python
   * imports. The directory says what it is in its name.
   */
  '**/Flutter/ephemeral/**',
  '**/.dart_tool/**',
  '**/Carthage/Build/**',
  // Composer, Go modules and Bundler all install into `vendor/`. The name means the
  // same thing in each: not ours.
  '**/vendor/**',
  // .NET build output, the `dist/` of a C# project.
  '**/obj/**',
  '**/bin/Debug/**',
  '**/bin/Release/**',
];

export interface ScanOptions {
  cwd: string;
  patterns?: string[];
  ignore?: string[];
}

/**
 * Scan files relative to a root project path. Returns paths relative to cwd.
 */
/**
 * The file Python writes at the root of a virtualenv, and the only reliable way to
 * recognise one.
 *
 * A virtualenv can be called anything: `venv52`, `env-3.11`, `.direnv`. Its scripts live
 * in `bin/` and its packages in `lib/pythonX/site-packages/`, but the marker at the root
 * is always this. Finding it means everything beside it was installed rather than
 * written.
 */
const VIRTUALENV_MARKER = 'pyvenv.cfg';

function withoutVirtualenvs(files: string[]): string[] {
  const roots = files
    .filter((file) => file === VIRTUALENV_MARKER || file.endsWith(`/${VIRTUALENV_MARKER}`))
    .map((file) => file.slice(0, file.length - VIRTUALENV_MARKER.length));

  if (roots.length === 0) return files;

  return files.filter((file) => !roots.some((root) => root !== '' && file.startsWith(root)));
}

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

  return withoutVirtualenvs(entries.map((e) => e.split(path.sep).join('/')));
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
