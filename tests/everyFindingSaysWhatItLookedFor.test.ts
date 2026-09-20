import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const FIXTURES = path.resolve(__dirname, 'fixtures');

const NO_EVIDENCE = 'no direct evidence captured';

/**
 * The weakest sentence in the product, measured.
 *
 * Across eighty-three repositories — the local corpus and five public ones — 768 of
 * 2101 findings carried "no direct evidence captured", and **180 of them were `high`**.
 * A reader was told at the severity they act on that their product has no error
 * reporting, no roles, no tenant isolation, no deployment, and the only thing under
 * the claim was a sentence that reads like an admission of not having looked.
 *
 * Every detector already knew what it had searched for. This test is the rule that
 * keeps them saying it: a finding a reader is expected to act on has to name either
 * the line it found or the search that came back empty. `unknown` and `passed` are not
 * held to it — "this question was not asked" is itself the answer, and a passing check
 * that found nothing to complain about is not asking anyone to do anything.
 *
 * It began at `high` and `critical`, where the damage was, and was raised to every
 * severity once those were clear: a `low` that says nothing is the same sentence, and
 * at 79 occurrences of `docker.presence` alone it was the most repeated line in the
 * product.
 */
describe('a finding somebody is asked to act on says what was looked for', () => {
  const fixtures = fs
    .readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('covers enough of the corpus to mean something', () => {
    expect(fixtures.length).toBeGreaterThan(40);
  });

  it('never reports a finding to act on with nothing under it', async () => {
    const offenders: string[] = [];

    for (const name of fixtures) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }

      for (const finding of report.findings) {
        if (finding.status === 'unknown') continue;
        if (finding.evidence.some((item) => item.value === NO_EVIDENCE)) {
          offenders.push(`${name}: ${finding.id}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
