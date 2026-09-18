import { describe, expect, it } from 'vitest';
import { productProfiles } from '../src/expectations/productProfiles';
import { toFindingId } from '../src/expectations/evaluateExpectations';
import { getRemediationEntry } from '../src/planner/remediationCatalog';
import { rules } from '../src/rules/rules';

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
