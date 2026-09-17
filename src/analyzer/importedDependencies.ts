import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * What a project uses, read from its code rather than from a manifest.
 *
 * Seventeen of the seventy-seven repositories in the verification corpus were reported
 * "inconclusive — no package manifest was found in any format this analyzer reads", and
 * had their score capped at 39 on that basis. They were not unreadable. `PyLLama` is
 * one file that opens `import streamlit` and `import openai`; the browser games load
 * Phaser and three.js from a CDN in a `<script>` tag. Every one of them says plainly
 * what it is built on, in the only place a project without a package manager can say
 * it.
 *
 * This is a fallback, not a replacement. It runs only for a language whose manifests
 * produced nothing, so a `requirements.txt` always wins over a guess at what an import
 * meant, and a project that declares its dependencies is never second-guessed.
 */

/**
 * The Python standard library, near enough.
 *
 * An import of `json` is not a dependency, and treating it as one would have every
 * script in the corpus depending on something. The list does not have to be complete:
 * a stdlib name that slips through becomes a dependency nothing looks for, which costs
 * nothing, while a third-party name wrongly listed here would hide a real signal — so
 * when in doubt a name is left out.
 */
const PY_STDLIB = new Set([
  'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'binascii', 'bisect', 'builtins',
  'bz2', 'calendar', 'cmath', 'cmd', 'collections', 'colorsys', 'concurrent', 'configparser',
  'contextlib', 'copy', 'csv', 'ctypes', 'dataclasses', 'datetime', 'decimal', 'difflib',
  'dis', 'email', 'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput',
  'fnmatch', 'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext',
  'glob', 'graphlib', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'imaplib',
  'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword', 'linecache',
  'locale', 'logging', 'lzma', 'mailbox', 'math', 'mimetypes', 'mmap', 'multiprocessing',
  'netrc', 'numbers', 'operator', 'os', 'pathlib', 'pickle', 'pipes', 'pkgutil', 'platform',
  'plistlib', 'poplib', 'posixpath', 'pprint', 'profile', 'pty', 'pwd', 'py_compile',
  'queue', 'quopri', 'random', 're', 'readline', 'reprlib', 'resource', 'runpy', 'sched',
  'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtplib',
  'socket', 'socketserver', 'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep',
  'struct', 'subprocess', 'sys', 'sysconfig', 'tarfile', 'tempfile', 'termios', 'textwrap',
  'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize', 'tomllib', 'trace',
  'traceback', 'tracemalloc', 'tty', 'types', 'typing', 'unicodedata', 'unittest', 'urllib',
  'uuid', 'venv', 'warnings', 'wave', 'weakref', 'webbrowser', 'wsgiref', 'xml', 'xmlrpc',
  'zipapp', 'zipfile', 'zlib', 'zoneinfo',
]);

/**
 * The import name is not always the package name.
 *
 * `import cv2` installs `opencv-python`, `import PIL` installs `pillow`, `import yaml`
 * installs `pyyaml`. A detector looking for `pillow` finds nothing in a file that says
 * `PIL`, so the difference has to be resolved here rather than in every table that
 * names a package.
 */
const PY_IMPORT_TO_PACKAGE: Record<string, string> = {
  cv2: 'opencv-python',
  pil: 'pillow',
  yaml: 'pyyaml',
  sklearn: 'scikit-learn',
  skimage: 'scikit-image',
  bs4: 'beautifulsoup4',
  dotenv: 'python-dotenv',
  jwt: 'pyjwt',
  serial: 'pyserial',
  dateutil: 'python-dateutil',
  psycopg: 'psycopg2',
  attr: 'attrs',
  google: 'google-cloud',
  mpl_toolkits: 'matplotlib',
  win32com: 'pywin32',
};

const PY_IMPORT = /^[ \t]*(?:import|from)[ \t]+([A-Za-z_][\w.]*)/gm;

/** Packages a Python project imports, when no requirements file declared any. */
export async function pythonImports(root: string, sourceFiles: string[]): Promise<string[]> {
  const pyFiles = sourceFiles.filter((file) => file.endsWith('.py'));
  if (pyFiles.length === 0) return [];

  /**
   * A module that lives in this repository is not a dependency.
   *
   * `import score` in a project that contains `score.py` is one file reaching for
   * another. Without this every local module became a package nobody could install.
   */
  const localModules = new Set<string>();
  for (const file of pyFiles) {
    const base = file.split('/').pop() ?? '';
    localModules.add(base.replace(/\.py$/, '').toLowerCase());
  }
  for (const file of sourceFiles) {
    const match = /(?:^|\/)([^/]+)\/__init__\.py$/.exec(file);
    if (match) localModules.add(match[1].toLowerCase());
  }

  const found = new Set<string>();

  // Capped: reading a thousand files to learn a project uses Django is waste, and the
  // imports of a project are not hiding in its thousandth file.
  for (const file of pyFiles.slice(0, 300)) {
    const raw = await readTextFileSafe(root, file);
    if (!raw) continue;

    for (const match of raw.matchAll(PY_IMPORT)) {
      const top = match[1].split('.')[0].toLowerCase();
      if (!top || top === '_' || PY_STDLIB.has(top) || localModules.has(top)) continue;

      found.add(PY_IMPORT_TO_PACKAGE[top] ?? top);
    }
  }

  return [...found];
}

/**
 * npm package names lifted out of a CDN URL.
 *
 * Each CDN spells the same thing differently, and the version has to come off: a
 * detector looks for `phaser`, and the page says
 * `https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.js`.
 */
const CDN_PATTERNS: RegExp[] = [
  // jsDelivr and unpkg: /npm/<name>[@version]/…, scope included.
  /(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[^/@]+\/)?[^/@"']+)/gi,
  // cdnjs: /ajax/libs/<name>/<version>/…
  /cdnjs\.cloudflare\.com\/ajax\/libs\/([^/"']+)/gi,
  // esm.sh, Skypack and jspm all serve a bare specifier off the root.
  /(?:esm\.sh|cdn\.skypack\.dev|jspm\.dev|ga\.jspm\.io\/npm:)\/?((?:@[^/@"']+\/)?[^/@"']+)/gi,
];

/** A bare module specifier: `import * as THREE from 'three'`, not `'./game.js'`. */
const BARE_IMPORT = /(?:import|from)\s*\(?\s*['"]((?:@[^/'"]+\/)?[^./'"][^'"]*)['"]/g;

/**
 * Packages a browser project loads, when no package.json declared any.
 *
 * A game served as `index.html` plus two scripts has no package manager and never will;
 * its dependency list is the set of `<script src>` tags at the top of the page.
 */
export async function browserImports(root: string, sourceFiles: string[]): Promise<string[]> {
  const webFiles = sourceFiles.filter((file) => /\.(html?|js|mjs|jsx|ts|tsx)$/i.test(file));
  if (webFiles.length === 0) return [];

  const found = new Set<string>();

  for (const file of webFiles.slice(0, 300)) {
    const raw = await readTextFileSafe(root, file);
    if (!raw) continue;

    for (const pattern of CDN_PATTERNS) {
      for (const match of raw.matchAll(pattern)) {
        const name = match[1].split('@')[0] || match[1];
        if (name) found.add(name.toLowerCase());
      }
    }

    // An import map or a bare specifier only resolves because something provides the
    // package, so naming it is a declaration even without a manifest.
    for (const match of raw.matchAll(BARE_IMPORT)) {
      const spec = match[1];
      // Keep the package, drop the deep path: `three/addons/…` is still `three`.
      const parts = spec.split('/');
      const name = spec.startsWith('@')
        ? parts.slice(0, 2).join('/')
        // A version can be pinned into the specifier itself (`three@0.160.0`), but a
        // scoped name starts with the same character, so it is only stripped here.
        : parts[0].split('@')[0];
      if (name && !/^https?:$/.test(name)) found.add(name.toLowerCase());
    }
  }

  return [...found];
}
