import { describe, expect, it } from 'vitest';
import { productProfiles } from '../src/expectations/productProfiles';
import { toFindingId } from '../src/expectations/evaluateExpectations';
import { getRemediationEntry } from '../src/planner/remediationCatalog';
import { rules } from '../src/rules/rules';
import { remediationCatalog } from '../src/planner/remediationCatalog';

/**
 * 164 of 885 open findings across the verification corpus had no task behind them —
 * nineteen per cent of everything the reports told somebody to fix. Two were criticals:
 * a Django project running with DEBUG on was told to stop, and given no step to take.
 *
 * Each family arrived the same way: a profile was added, its capabilities with it, and
 * the tasks were left for later. This is the check that makes later now.
 */
describe('a report does not ask for work the plan cannot describe', () => {
  it('has a remediation task for every capability a profile can demand', () => {
    const missing: string[] = [];

    for (const profile of Object.values(productProfiles)) {
      for (const capability of profile.capabilities) {
        if (capability.importance === 'not_applicable' || capability.importance === 'optional') continue;

        const findingId = toFindingId(capability, capability.importance);
        if (!getRemediationEntry(findingId)) missing.push(`${profile.id}: ${findingId}`);
      }
    }

    expect(missing, `no remediation task for:\n${missing.join('\n')}`).toEqual([]);
  });

  it('has one for every observed rule that can report a problem', () => {
    // An observed rule reports on what the code does, so every one of them can end up
    // as something to fix.
    const missing = rules
      .filter((rule) => rule.severity !== 'info')
      // `meta` rules report on the analysis rather than on the product: "the stack was
      // identified" is not something a plan can act on.
      .filter((rule) => rule.category !== 'meta' && rule.category !== 'stack')
      .filter((rule) => !getRemediationEntry(rule.id))
      .map((rule) => rule.id);

    expect(missing, `no remediation task for:\n${missing.join('\n')}`).toEqual([]);
  });

  it('does not keep a task nothing can ask for', () => {
    /**
     * The mirror of the check above, and it found seven.
     *
     * `expectation.gdpr.required` and `expectation.billing.required` were written when
     * those were single capabilities; they were later split into consent, export,
     * erasure and retention, and into model and webhook integrity, and the old keys
     * stayed behind. `expectation.authz.resource-level.required` outlived a rename to
     * `authz.ownership`. A key nothing can produce is not harmless: it reads like
     * coverage that is not there, and it is where a renamed finding quietly loses its
     * task.
     *
     * Safe to delete because a plan is built once, at scan time, and stored — an old
     * report is never re-planned.
     */
    const reachable = new Set<string>(rules.map((rule) => rule.id));
    for (const profile of Object.values(productProfiles)) {
      for (const capability of profile.capabilities) {
        for (const importance of ['required', 'recommended', 'optional'] as const) {
          reachable.add(toFindingId(capability, importance));
        }
      }
    }

    const unreachable = Object.keys(remediationCatalog).filter((key) => !reachable.has(key));
    expect(unreachable, `no finding can produce:\n${unreachable.join('\n')}`).toEqual([]);
  });

  it('reaches the same task whichever importance a profile chose', () => {
    // The finding id carries the importance as a suffix and the work is the same either
    // way, so a profile that recommends what another requires must still find the task.
    for (const profile of Object.values(productProfiles)) {
      for (const capability of profile.capabilities) {
        if (capability.importance !== 'required' && capability.importance !== 'recommended') continue;

        const required = getRemediationEntry(toFindingId(capability, 'required'));
        const recommended = getRemediationEntry(toFindingId(capability, 'recommended'));

        expect(required?.taskId, capability.id).toBe(recommended?.taskId);
      }
    }
  });
});

/**
 * The compliance mapping walks a list of prefixes and takes the first that matches, so
 * a general prefix placed before a specific one silently swallows it. Nothing is
 * shadowed today; the ordering dependency is invisible to whoever reorders next.
 */
describe('the compliance mapping is not order-dependent by accident', () => {
  it('has no prefix that swallows a later one', async () => {
    const source = await import('fs').then((fs) =>
      fs.readFileSync(new URL('../src/report/complianceMapping.ts', import.meta.url), 'utf8'),
    );
    const prefixes = [...source.matchAll(/prefix:\s*'([^']+)'/g)].map((match) => match[1]);

    expect(prefixes.length).toBeGreaterThan(5);

    const shadowed: string[] = [];
    for (let i = 0; i < prefixes.length; i += 1) {
      for (let j = i + 1; j < prefixes.length; j += 1) {
        if (prefixes[j].startsWith(prefixes[i])) shadowed.push(`${prefixes[j]} is unreachable behind ${prefixes[i]}`);
      }
    }

    expect(shadowed).toEqual([]);
  });
});
