import { LANGUAGES } from './catalogue';

/**
 * How closely this analyzer read each language it found.
 *
 * The product's whole argument is that it says only what it can show. It has been
 * saying, with the same confidence in both cases, things it read from a syntax tree and
 * things it guessed from a word — and the report gave a reader no way to tell which.
 *
 * Measured rather than asserted: 68 keyword searches against 1 structural claim, and 6
 * of 18 readable extensions covered by a parser. A report on a Go project and a report
 * on a TypeScript project looked equally sure of themselves, and were not.
 *
 * Three depths, in the order they deserve to be trusted:
 *
 * - `parsed`: a syntax tree answered the question. `{m.role === 'user' ? 'You' : 'Bot'}`
 *   is a label and `if (!roles.includes(actor.role)) return res.status(403)` is a guard,
 *   and nothing about the words tells them apart.
 * - `searched`: the file was read as text and matched against keywords. Everything this
 *   analyzer has always done, and where every defect of 18 September lived.
 * - `skipped`: the language was seen and not read at all.
 */
export type ReadingDepth = 'parsed' | 'searched' | 'skipped';

export interface LanguageReading {
  language: string;
  files: number;
  depth: ReadingDepth;
}

/**
 * The extensions a parser reads today.
 *
 * One list, so that adding Python to the structural layer changes what the report claims
 * about Python in the same commit that makes it true. A second copy of this would drift
 * within a week, which is the failure this file exists to stop somebody else making.
 */
const PARSED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Languages whose files are read as text but never parsed. */
function depthFor(files: string[]): ReadingDepth {
  if (files.length === 0) return 'skipped';

  return files.every((file) => PARSED_EXTENSIONS.test(file)) ? 'parsed' : 'searched';
}

/**
 * What was read, and how, for every language present in the repository.
 *
 * Counts source files rather than all files: a language that appears only in an ignored
 * directory was not read because it was not the project's, which is a different fact and
 * one the reader does not need here.
 */
export function readingDepths(sourceFiles: string[], unreadable: Array<{ language: string; files: number }>): LanguageReading[] {
  const readings: LanguageReading[] = [];

  for (const { label, extensions } of LANGUAGES) {
    const files = sourceFiles.filter((file) => extensions.test(file));
    if (files.length === 0) continue;

    readings.push({ language: label, files: files.length, depth: depthFor(files) });
  }

  for (const entry of unreadable) {
    readings.push({ language: entry.language, files: entry.files, depth: 'skipped' });
  }

  return readings.sort((left, right) => right.files - left.files);
}

/**
 * The sentence a reader needs, or nothing.
 *
 * Silent where everything was parsed: a report that congratulates itself on reading
 * properly is noise. It speaks when some of the reading was shallower than the rest,
 * which is the case that misleads.
 */
export function describeReadingDepth(readings: LanguageReading[]): string | undefined {
  const searched = readings.filter((entry) => entry.depth === 'searched');
  const skipped = readings.filter((entry) => entry.depth === 'skipped');

  if (searched.length === 0 && skipped.length === 0) return undefined;

  const parts: string[] = [];

  if (searched.length > 0) {
    parts.push(
      `${searched.map((entry) => entry.language).join(', ')} ${searched.length === 1 ? 'was' : 'were'} read as text and matched against keywords, not parsed`,
    );
  }

  if (skipped.length > 0) {
    parts.push(`${skipped.map((entry) => `${entry.language} (${entry.files} files)`).join(', ')} not read at all`);
  }

  return `How this repository was read: ${parts.join('; ')}. A keyword can appear in a comment, a test fixture or a variable name, so findings in those languages rest on weaker evidence than the ones this analyzer parsed.`;
}
