import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const health = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'observability.health');
};

/**
 * The probe a platform declares is the operator's half of the same answer.
 *
 * immich declares `healthcheck:` for its services in all four of its compose files
 * and was told it has no health endpoint. Something is being probed — that is what
 * the key means — and the endpoint it probes lives inside the image, where no text
 * search here will ever find it.
 *
 * Six well-run products in a row reported no health endpoint before this was looked
 * at, which is what made it worth looking at rather than one of them.
 *
 * `HEALTHCHECK` is Docker's instruction, `healthcheck:` is compose's key, and
 * `livenessProbe:` and `readinessProbe:` are Kubernetes' field names. None is the
 * author's word, and each is a statement that this service answers a health question.
 *
 * immich goes from 83 and `partial` to 85 and `production_ready`.
 */
describe('the probe a platform declares', () => {
  it('reads a compose healthcheck as a health endpoint', async () => {
    const found = await health('probe-declared-in-compose');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value) === 'healthcheck:')).toBe(true);
  });

  /**
   * And the one line that says the opposite. `disable: true` is compose's way of
   * switching an image's own check off, so the block carrying it is not a probe.
   */
  it('does not count a healthcheck that is switched off', async () => {
    expect((await health('probe-disabled-in-compose'))?.status).toBe('missing');
  });
});
