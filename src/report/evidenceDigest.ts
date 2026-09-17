import type { DetectorEvidence } from '../analyzer/types';
import type { Finding } from './types';

/**
 * The same line, cited once.
 *
 * The evidence appendix of a real report ran to 173 lines of 693 — a quarter of the
 * document — and a single finding carried twenty-four snippets of which five were
 * literally `from django.contrib.auth.models import User`. The line that actually
 * settled the question, `path('accounts/', include('django.contrib.auth.urls'))`, sat
 * twelfth. Repetition does not make a case stronger; it buries the case.
 *
 * Nothing is thrown away silently: what does not fit is counted. And nothing here can
 * change a verdict — evidence quality and confidence are decided when the finding is
 * built, before this runs. This is about whether the reader can read it.
 */

/** Distinct lines kept per finding before the rest are summarised. */
const KEEP = 8;

function key(item: DetectorEvidence): string {
  return `${item.type}:${String(item.value).trim()}`;
}

function digestOne(evidence: DetectorEvidence[]): DetectorEvidence[] {
  if (evidence.length === 0) return evidence;

  const seen = new Set<string>();
  const distinct: DetectorEvidence[] = [];
  let repeats = 0;

  for (const item of evidence) {
    const id = key(item);
    if (seen.has(id)) {
      repeats += 1;
      continue;
    }

    seen.add(id);
    distinct.push(item);
  }

  /**
   * Breadth before depth: one line from each file, then the rest.
   *
   * Capping in the order the detector produced them kept seven lines of Django
   * settings boilerplate — four of them password-validator names — and cut
   * `path('accounts/', include('django.contrib.auth.urls'))`, which is the line that
   * actually settles the question. A file that mentions the thing once is a different
   * argument from the same file mentioning it seven times, and the reader wants to see
   * where it turns up, not how often one file says it.
   */
  const firstPerFile: DetectorEvidence[] = [];
  const rest: DetectorEvidence[] = [];
  const filesSeen = new Set<string>();

  for (const item of distinct) {
    const file = item.file ?? '';
    if (filesSeen.has(file)) {
      rest.push(item);
      continue;
    }

    filesSeen.add(file);
    firstPerFile.push(item);
  }

  const ranked = [...firstPerFile, ...rest];
  const kept = ranked.slice(0, KEEP);
  const trimmed = ranked.length - kept.length;

  if (repeats === 0 && trimmed === 0) return kept;

  /**
   * Said in one line rather than shown in twenty. A reader who wants all of it has the
   * search terms and the files; what they need here is to know the shape of what was
   * found, not to scroll it.
   */
  const parts = [
    trimmed > 0 ? `${trimmed} further distinct ${trimmed === 1 ? 'match' : 'matches'}` : '',
    repeats > 0 ? `${repeats} repeat${repeats === 1 ? '' : 's'} of lines already shown` : '',
  ].filter(Boolean);

  return [...kept, { type: 'note', value: `and ${parts.join(', ')}` }];
}

export function withEvidenceDigest(findings: Finding[]): Finding[] {
  return findings.map((finding) => {
    const evidence = digestOne(finding.evidence);
    return evidence === finding.evidence ? finding : { ...finding, evidence };
  });
}
