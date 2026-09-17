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
