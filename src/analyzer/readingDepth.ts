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

/**
 * The catalogue labels those extensions carry, so the missing-compiler clause fires for
 * the languages it can actually do something about and stays quiet on a Go repository.
 */
const PARSED_EXTENSIONS_LANGUAGES = new Set(
  LANGUAGES.filter(({ extensions }) => ['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs'].some((name) => extensions.test(name))).map(
    ({ label }) => label,
  ),
);

/**
 * Languages whose files are read as text but never parsed.
 *
 * The extension says a parser *could* read this file; `parserAvailable` says one
 * actually did. The optional TypeScript peer is absent on any machine that installed
 * this package without it — `npx prodkit` against a repository is the ordinary case —
 * and until this argument existed the report claimed `parsed` there just the same, on
 * the strength of the file name.
 */
function depthFor(files: string[], parserAvailable: boolean): ReadingDepth {
  if (files.length === 0) return 'skipped';
  if (!parserAvailable) return 'searched';

  return files.every((file) => PARSED_EXTENSIONS.test(file)) ? 'parsed' : 'searched';
}

/**
 * What was read, and how, for every language present in the repository.
 *
 * Counts source files rather than all files: a language that appears only in an ignored
 * directory was not read because it was not the project's, which is a different fact and
 * one the reader does not need here.
 */
export function readingDepths(
  sourceFiles: string[],
  unreadable: Array<{ language: string; files: number }>,
  parserAvailable: boolean,
): LanguageReading[] {
  const readings: LanguageReading[] = [];

  for (const { label, extensions } of LANGUAGES) {
    const files = sourceFiles.filter((file) => extensions.test(file));
    if (files.length === 0) continue;

    readings.push({ language: label, files: files.length, depth: depthFor(files, parserAvailable) });
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
 *
 * `parserAvailable` separates two shallow readings that look identical in the list and
 * are not. Go is searched because nothing here will ever parse Go, and a reader can do
 * nothing about it. JavaScript is searched only when the optional compiler is missing,
 * and installing it changes the answer — on the fixture corpus, seven repositories of a
 * hundred and thirty-three answer differently. Telling a reader to install a package is
 * worth a clause; telling them their Go is read by keyword is worth a different one.
 */
export function describeReadingDepth(readings: LanguageReading[], parserAvailable: boolean): string | undefined {
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

  const missingParser = !parserAvailable && readings.some((entry) => PARSED_EXTENSIONS_LANGUAGES.has(entry.language));

  return [
    `How this repository was read: ${parts.join('; ')}.`,
    'A keyword can appear in a comment, a test fixture or a variable name, so findings in those languages rest on weaker evidence than the ones this analyzer parsed.',
    ...(missingParser
      ? [
        'The optional `typescript` peer dependency is not installed, so no JavaScript or TypeScript was parsed here either: every structural question — which literal reaches a signing call, whether a comparison guards a route or picks a label — went unasked. Install it alongside this package and re-run to get those answers.',
      ]
      : []),
  ].join(' ');
}

/**
 * Whether a parser would have had anything to say about this repository.
 *
 * A detector that loses its structural reader has lost nothing on a Go or Python
 * project — no parser here was ever going to read those — so the missing compiler is
 * only worth reporting where it would have changed the answer. Same list as the depths
 * above, for the same reason: adding a language to the structural layer must move both
 * claims in one commit.
 */
export function parserCouldHaveRead(sourceFiles: string[]): boolean {
  return sourceFiles.some((file) => PARSED_EXTENSIONS.test(file));
}

/**
 * The question was asked and answered, or it was never asked.
 *
 * The structural readers already distinguish the two — `null` for "no parser", `[]` for
 * "parsed, found nothing" — and every consumer flattened it with `?? []`. This puts the
 * distinction back where a detector can act on it.
 */
export function wentUnasked(readerResult: unknown | null, sourceFiles: string[]): boolean {
  return readerResult === null && parserCouldHaveRead(sourceFiles);
}
