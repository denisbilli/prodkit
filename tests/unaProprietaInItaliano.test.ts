import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { readOwnershipChecks } from '../src/analyzer/structural/ownershipChecks';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const ownership = async (name: string) => {
  const analysis = await analyzeProject(fixture(name));
  const report = buildReport(analysis, { profile: 'b2b-saas' });
  return {
    detected: analysis.detectors['authz.resourceLevel']?.present,
    capability: report.productProfile?.capabilities.find((c) => c.capabilityId === 'authz.ownership'),
  };
};

/**
 * The one capability with no package to anchor on, and the last of the five.
 *
 * There is no `npm install authorization`. Ownership is written by hand, in whatever
 * words its author has, and every reading of it here was a list of those words. An
 * Italian application guarding every route with
 *
 *     if (nota.proprietario !== richiesta.utente.id) return risposta.sendStatus(404);
 *
 * was told it had no per-record checks — under a recommendation to add the thing it
 * already had on every route.
 *
 * Express supplies the anchor the capability lacks. A router comes from the package,
 * `.get(path, handler)` is the framework saying "this is a request handler", and the
 * handler's first parameter is the request whatever its author called it. What
 * remains is a question about shape and needs no vocabulary at all.
 */
describe('an ownership check is one in any vocabulary', () => {
  it('sees a per-record check written entirely in Italian', async () => {
    const { detected, capability } = await ownership('proprieta-in-italiano');

    expect(detected).toBe(true);
    expect(capability?.status).toBe('present');
  });

  it('does not read routing as authorisation', async () => {
    // `req.method !== 'GET'` compares the request to a constant, and
    // `req.params.id === req.query.id` compares it to itself. Neither is a row.
    const { detected } = await ownership('express-compares-the-request');

    expect(detected).toBe(false);
  });

  it('still refuses to call a route permission an ownership check', async () => {
    const { capability } = await ownership('express-route-permissions-only');

    expect(capability?.status).toBe('missing');
  });

  it('takes the request from its position, not from its name', async () => {
    const checks = await readOwnershipChecks(path.resolve(__dirname, 'fixtures'), [
      'proprieta-in-italiano/src/note.js',
    ]);

    expect(checks).not.toBeNull();
    expect((checks ?? []).length).toBe(2);
    expect((checks ?? [])[0].snippet).toContain('proprietario');
  });
})
