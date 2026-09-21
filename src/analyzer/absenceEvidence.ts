import type { DetectorEvidence } from './types';

/**
 * What was looked for, when nothing was found.
 *
 * A finding about something that is not there has no line to cite, and the report said
 * so with "no direct evidence captured" — a sentence that reads like an admission of
 * not having looked. It is the weakest thing in a report somebody paid for, and it is
 * repeated: five findings in one GDPR section carried it in a row.
 *
 * The search itself is the evidence. A reader who sees "searched for an export
 * endpoint: /gdpr/export, exportUserData, personalDataExport, dataSubject" can tell at
 * a glance whether their own implementation would have been found, and say so when it
 * would not. That is the difference between a claim and an assertion.
 */
export function searchedFor(what: string, terms: string[], claim?: string): DetectorEvidence[] {
  if (terms.length === 0) return [];

  return [{
    type: 'search',
    value: `searched for ${what}: ${terms.join(', ')}`,
    ...(claim ? { claim } : {}),
  }];
}

/**
 * The evidence, or the search that came up empty — never neither.
 *
 * Measured across eighty-three repositories: 768 of 2101 findings carried "no direct
 * evidence captured", and 180 of those were `high`. A reader is told at high severity
 * that their product has no error reporting, no roles, no tenant isolation, and the
 * only thing under it is a sentence that reads like an admission of not having looked.
 *
 * Every detector already knows what it searched for. This is the one line that makes
 * it say so, so that a reader whose roles are called `capabilities` can see why they
 * were missed and tell us we are wrong.
 */
/**
 * The same, for a look that needed no reader.
 *
 * A search over the list of file names answers whatever language the files are
 * written in. Separated so that the report can withdraw the claims a blind reader
 * made without withdrawing the ones anybody could check — see
 * `onlyEvidencedByASearchThatCouldNotRead` in the report.
 */
export function searchedFileNamesFor(what: string, terms: string[], claim?: string): DetectorEvidence[] {
  return searchedFor(what, terms, claim).map((item) => ({ ...item, overFileNames: true }));
}

export function evidenceOrSearch(
  evidence: DetectorEvidence[],
  what: string,
  terms: string[],
  claim?: string
): DetectorEvidence[] {
  return evidence.length > 0 ? evidence : searchedFor(what, terms, claim);
}

/** `evidenceOrSearch` for a search that only had to read file names. */
export function evidenceOrFileNameSearch(
  evidence: DetectorEvidence[],
  what: string,
  terms: string[],
  claim?: string
): DetectorEvidence[] {
  return evidence.length > 0 ? evidence : searchedFileNamesFor(what, terms, claim);
}
