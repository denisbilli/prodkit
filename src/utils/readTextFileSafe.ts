import { promises as fs } from 'fs';
import * as path from 'path';

const MAX_BYTES = 1_000_000; // 1 MB

/**
 * Safely read a UTF-8 text file. Returns null when missing, binary, too large,
 * or unreadable. Never throws.
 */
export async function readTextFileSafe(root: string, relPath: string): Promise<string | null> {
  try {
    const abs = path.join(root, relPath);
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_BYTES) return null;
    const buf = await fs.readFile(abs);
    // Crude binary detection: presence of NUL byte in first 8 KB
    const sample = buf.subarray(0, Math.min(buf.length, 8192));
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return null;
    }
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

export async function readJsonSafe<T = unknown>(root: string, relPath: string): Promise<T | null> {
  const text = await readTextFileSafe(root, relPath);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
