import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const logging = async (name: string) => {
  const analysis = await analyzeProject(fixture(name));
  return analysis.detectors['observability.core'];
};

/**
 * A real structured logger, reported as no logging at all.
 *
 *     const { Roarr } = require('roarr');
 *     const shout = Roarr.child({ service: 'orders' });
 *     shout.info({ orderId }, 'order received');
 *
 * Two ways to miss the same thing: the package list was four names long and did not
 * include this one, and the search beside it read `logger.` — the author's own
 * variable. Rename it to `shout` and the logging disappears.
 *
 * The corpus cannot show this. All seventy-eight repositories there call it `logger`
 * and use one of the four, which is what makes a corpus a sample of the conventions
 * people follow rather than of the ones they do not. The case is constructed, and
 * that is the right way to find a defect of this shape.
 */
describe('a logger keeps logging under any name', () => {
  it('finds a logger bound to a name nobody would guess', async () => {
    const detector = await logging('logs-under-another-name');

    expect(detector?.details.structuredLogging).toBe(true);
  });

  it('points at the line where the logger is used, not just at the manifest', async () => {
    const detector = await logging('logs-under-another-name');
    const used = (detector?.evidence ?? []).filter((item) => item.claim === 'logging' && item.line);

    expect(used.length).toBeGreaterThan(0);
    expect(used[0].file).toMatch(/server\.js$/);
  });

  it('still says nothing where a project logs nothing', async () => {
    // The anchor must not turn every project into a logging project: having a package
    // installed and never calling it is the case this could swallow.
    const detector = await logging('saas-with-nothing-but-login');

    expect(detector?.details.structuredLogging).toBe(false);
  });
})
