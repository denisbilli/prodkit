import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const ownership = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'b2b-saas' });
  return report.productProfile?.capabilities.find((c) => c.capabilityId === 'authz.ownership');
};

/**
 * "Per-record checks that a caller may act on the specific resource, not just the
 * route" — satisfied by checks on the route.
 *
 * `requirePermission` and `permission_classes` were in the resource-level needle list,
 * so three projects in the verification corpus were credited with protection against
 * reading another user's rows that they do not have. One of them qualified on
 * `permission_classes = [AllowAny]`, a line that says the opposite; another on
 * `google_calendar.authorize()`, an OAuth handshake.
 *
 * This is the direction that matters: a security control claimed present, under a
 * recommendation whose own words are "prevent IDOR-style access".
 */
describe('a check on the route is not a check on the record', () => {
  it('does not credit a route permission as an ownership check', async () => {
    const capability = await ownership('express-route-permissions-only');

    expect(capability?.status).toBe('missing');
  });

  it('credits a check that the row belongs to the caller', async () => {
    const capability = await ownership('express-record-ownership');

    expect(capability?.status).toBe('present');
  });

  it('does not read an OAuth handshake as authorising a record', async () => {
    // `authorize(` with nothing in the parentheses is a handshake, not a decision
    // about a row.
    const analysis = await analyzeProject(fixture('express-route-permissions-only'));
    const evidence = analysis.detectors['authz.resourceLevel']?.evidence ?? [];

    expect(evidence.every((item) => !/authorize\(\s*\)/.test(String(item.value)))).toBe(true);
  });
})
