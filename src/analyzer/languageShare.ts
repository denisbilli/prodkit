import type { DetectContext } from './detectContext';

/**
 * How much of a repository's source is written in a given language.
 *
 * Extracted from the backend detector, which grew it first: two Go files beside 547
 * Rust ones made a report say "Backend: go". The same question decides more than one
 * claim — which language serves the requests, and which ecosystem builds the project —
 * and the answer should be arrived at the same way in both.
 */
export function languageShare(ctx: DetectContext, extension: RegExp): number {
  const source = ctx.files.source;
  if (source.length === 0) return 0;

  return source.filter((file) => extension.test(file)).length / source.length;
}

/**
 * Below this a language is present in the repository without being what it is made of.
 *
 * windmill is the measurement: two Go files beside 547 Rust ones, 0.05% of its source,
 * and the report said "Backend: go". The line is not tuned to that case — anything
 * under one file in twenty is a client, a script or a sample, and every backend in the
 * verification corpus is far above it. A repository genuinely split between two
 * languages reports both, which is the right answer for one.
 */
export const MINIMUM_LANGUAGE_SHARE = 0.05;
