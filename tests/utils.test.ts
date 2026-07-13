import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readJsonSafe, readTextFileSafe } from '../src/utils/readTextFileSafe';
import { anyIncludes, searchInFiles } from '../src/utils/textSearch';
import { scanFiles, hasFile } from '../src/utils/fileScanner';
import { resolveProjectPath, toPosix } from '../src/utils/pathUtils';

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-utils-'));
  await fs.writeFile(path.join(root, 'normal.txt'), 'hello\nworld\n', 'utf8');
  await fs.writeFile(path.join(root, 'data.json'), JSON.stringify({ a: 1, b: 'x' }), 'utf8');
  await fs.writeFile(path.join(root, 'broken.json'), '{ not: valid json ', 'utf8');
  // A file with a NUL byte in the first bytes -> treated as binary.
  await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0x68, 0x00, 0x69]));
  // A file larger than the 1 MB cap.
  await fs.writeFile(path.join(root, 'huge.txt'), Buffer.alloc(1_000_001, 0x61));
  await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'ignored', 'utf8');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'app.js'), 'const secret = "changeme";\nconst ok = 1;\n', 'utf8');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('readTextFileSafe', () => {
  it('reads a normal utf-8 file', async () => {
    expect(await readTextFileSafe(root, 'normal.txt')).toBe('hello\nworld\n');
  });

  it('returns null for a missing file instead of throwing', async () => {
    expect(await readTextFileSafe(root, 'does-not-exist.txt')).toBeNull();
  });

  it('returns null for a directory', async () => {
    expect(await readTextFileSafe(root, 'src')).toBeNull();
  });

  it('skips binary files (NUL byte)', async () => {
    expect(await readTextFileSafe(root, 'binary.bin')).toBeNull();
  });

  it('skips files larger than 1 MB', async () => {
    expect(await readTextFileSafe(root, 'huge.txt')).toBeNull();
  });
});

describe('readJsonSafe', () => {
  it('parses valid JSON', async () => {
    expect(await readJsonSafe(root, 'data.json')).toEqual({ a: 1, b: 'x' });
  });

  it('returns null for invalid JSON instead of throwing', async () => {
    expect(await readJsonSafe(root, 'broken.json')).toBeNull();
  });

  it('returns null for a missing file', async () => {
    expect(await readJsonSafe(root, 'missing.json')).toBeNull();
  });
});

describe('pathUtils', () => {
  it('converts OS separators to posix', () => {
    expect(toPosix(`a${path.sep}b${path.sep}c`)).toBe('a/b/c');
  });

  it('resolves a project path to an absolute path', () => {
    expect(path.isAbsolute(resolveProjectPath('some/relative/dir'))).toBe(true);
  });
});

describe('searchInFiles', () => {
  it('finds a needle and reports the 1-based line number and trimmed snippet', async () => {
    const matches = await searchInFiles(root, ['src/app.js'], [/changeme/], 10);
    expect(matches).toHaveLength(1);
    expect(matches[0].file).toBe('src/app.js');
    expect(matches[0].line).toBe(1);
    expect(matches[0].snippet).toContain('changeme');
  });

  it('supports plain string needles', async () => {
    const matches = await searchInFiles(root, ['src/app.js'], ['secret'], 10);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('respects the match limit', async () => {
    const matches = await searchInFiles(root, ['normal.txt'], [/./], 1);
    expect(matches).toHaveLength(1);
  });

  it('ignores unreadable/missing files without throwing', async () => {
    const matches = await searchInFiles(root, ['missing.txt', 'src/app.js'], [/secret/], 10);
    expect(matches).toHaveLength(1);
  });
});

describe('anyIncludes', () => {
  it('returns true when any needle is present', () => {
    expect(anyIncludes('the quick brown fox', ['zebra', 'brown'])).toBe(true);
  });

  it('returns false when none match', () => {
    expect(anyIncludes('the quick brown fox', ['zebra', 'lion'])).toBe(false);
  });
});

describe('fileScanner', () => {
  it('scans files and excludes default-ignored directories', async () => {
    const files = await scanFiles({ cwd: root });
    expect(files).toContain('src/app.js');
    expect(files).toContain('normal.txt');
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('hasFile finds an existing pattern and returns null otherwise', async () => {
    expect(await hasFile(root, ['**/app.js'])).not.toBeNull();
    expect(await hasFile(root, ['**/nonexistent.xyz'])).toBeNull();
  });
});
