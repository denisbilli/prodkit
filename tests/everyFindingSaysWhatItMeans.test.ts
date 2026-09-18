import { readdirSync } from 'node:fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import type { ProductProfile } from '../src/expectations/types';

const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * "What this means" exists so a reader who is not an engineer can weigh a finding
 * against shipping a week earlier. It had a fallback table, and the fallback said things
 * like "a common attack is not defended against" and "a privacy obligation is unmet" —
 * the finding's own title with the detail taken out. A hundred and two actionable
 * findings in the verification corpus carried one of those twelve sentences, and a
 * hundred and twenty-six carried nothing at all: every one of those in a client
 * application, a phone application or a package, the profiles the table was never
 * extended for.
 *
 * The fallback is gone, so a missing sentence is now visible as a missing sentence, and
 * this is what makes it visible.
 *
 * There is no test that a sentence is any good — there is no rule for that — so the
 * twelve retired ones are not blacklisted either: with every id mapped, the fallback is
 * unreachable and such a test could never fail. What stops a weak sentence is writing
 * it next to the twenty-three that are already there.
 */
describe('every actionable finding says what it means', () => {
  it('has a sentence of its own for each one the fixtures produce', async () => {
    const profiles: ProductProfile[] = ['auto', 'b2b-saas', 'b2c-app', 'mobile-app', 'client-app', 'library', 'marketplace', 'ai-saas'];
    const missing = new Map<string, string>();

    for (const entry of readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const analysis = await analyzeProject(path.join(FIXTURES, entry.name));

      for (const profile of profiles) {
        const report = buildReport(analysis, { profile });

        for (const finding of report.findings) {
          if (finding.status === 'passed' || finding.status === 'unknown') continue;
          if (finding.businessImpact) continue;
          missing.set(finding.id, `${finding.id} (${entry.name}, ${profile})`);
        }
      }
    }

    expect([...missing.values()]).toEqual([]);
  });

});
