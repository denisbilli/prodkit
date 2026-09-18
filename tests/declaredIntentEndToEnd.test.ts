import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import type { DeclaredIntent } from '../src/expectations/types';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const DECLARATIONS: Array<keyof DeclaredIntent> = [
  'handlesPersonalData',
  'hasFileUploads',
  'requiresTenantIsolation',
  'hasBilling',
];

/**
 * The hosted application asks the owner four questions when a project is created. They
 * were once collected, displayed, and never passed to the analyzer at all. This checks
 * the other half: that each one, once passed, actually changes the report.
 */
describe('every answer the owner gives does something', () => {
  it('raises a duty the profile did not carry', async () => {
    // A library has no tenants, no personal data, no payments and no uploads — which is
    // the point: each declaration has to be able to overrule the profile's assumption,
    // because the owner knows what their product does and the profile is guessing.
    const analysis = await analyzeProject(fixture('npm-library'));
    const base = buildReport(analysis, { profile: 'library' });

    for (const key of DECLARATIONS) {
      const declared = buildReport(analysis, { profile: 'library', declared: { [key]: true } });

      expect(declared.overallScore, `${key} changed nothing`).toBeLessThan(base.overallScore);
    }
  });

  it('does not let an answer of "no" switch a finding off', async () => {
    // A declaration can add a duty and can never remove one: otherwise the score
    // measures the owner's optimism rather than the product.
    const analysis = await analyzeProject(fixture('express-basic'));
    const base = buildReport(analysis, { profile: 'b2b-saas' });

    for (const key of DECLARATIONS) {
      const denied = buildReport(analysis, { profile: 'b2b-saas', declared: { [key]: false } });

      expect(denied.overallScore, key).toBe(base.overallScore);
    }
  });

  it('reports a declared duty the code does not show, rather than dropping it', async () => {
    // "No upload surface here, so the question does not arise" is right for a
    // requirement the profile inferred, and it was silently cancelling the owner's
    // answer — `hasFileUploads` was the one of the four that changed nothing, and it
    // changed nothing without saying so.
    const analysis = await analyzeProject(fixture('npm-library'));
    const report = buildReport(analysis, { profile: 'library', declared: { hasFileUploads: true } });
    const uploads = report.findings.find((f) => f.id.includes('uploads'));

    expect(uploads?.status).toBe('missing');
    expect(uploads?.description).toMatch(/rests on your answer/);
  });

  it('does not add that caveat where the code does show uploads', async () => {
    const analysis = await analyzeProject(fixture('express-public-uploads-with-auth-elsewhere'));
    const report = buildReport(analysis, { profile: 'b2b-saas', declared: { hasFileUploads: true } });
    const uploads = report.findings.find((f) => f.id.includes('uploads'));

    expect(uploads?.description ?? '').not.toMatch(/rests on your answer/);
  });
});
