import { readTextFileSafe } from './readTextFileSafe';

export interface TextMatch {
  file: string;
  line: number;
  snippet: string;
}

/**
 * Search a list of relative file paths for any of the given needles
 * (string or RegExp). Returns at most `limit` matches.
 */
export async function searchInFiles(
  root: string,
  files: string[],
  needles: Array<string | RegExp>,
  limit = 25
): Promise<TextMatch[]> {
  const matches: TextMatch[] = [];
  for (const file of files) {
    if (matches.length >= limit) break;
    const text = await readTextFileSafe(root, file);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const n of needles) {
        const hit = typeof n === 'string' ? line.includes(n) : n.test(line);
        if (hit) {
          matches.push({ file, line: i + 1, snippet: line.trim().slice(0, 200) });
          break;
        }
      }
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function anyIncludes(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}
