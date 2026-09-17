import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('audit trail', () => {
  it('recognises a store that is written to', async () => {
    const analysis = await analyzeProject(fixture('express-audit-trail'));
    const trail = analysis.detectors['audit.trail'];

    expect(trail?.present).toBe(true);
    expect(trail?.complete).toBe(true);
  });

  it('lets the expectation reach present, which it previously could not', async () => {
    // The bug: both branches of audit.baseline returned `partial`, so a project with a
    // complete audit trail was marked down for it permanently — on a capability the
    // b2b-saas profile asks for. It was also decided from structured logging and a
    // request id, which answer "can we debug this?" rather than "can we say, months
    // later, who deleted that organisation?".
    const report = buildReport(await analyzeProject(fixture('express-audit-trail')), { profile: 'b2b-saas' });
    const capability = report.productProfile?.capabilities.find((c) => c.capabilityId === 'audit.baseline');

    expect(capability?.status).toBe('present');
    // A satisfied capability raises no finding, which is the point: the project is no
    // longer marked down for something it has.
    expect(report.findings.filter((f) => /audit/i.test(f.id))).toEqual([]);
  });

  it('claims nothing for a project with no audit trail', async () => {
    const analysis = await analyzeProject(fixture('express-secure'));

    expect(analysis.detectors['audit.trail']?.present).toBe(false);
  });
});
