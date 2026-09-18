import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const expectationTitles = (report: ReturnType<typeof buildReport>) =>
  report.findings.filter((f) => f.id.startsWith('expectation.')).map((f) => f.title);

describe('declared product intent', () => {
  it('adds a duty the profile would never have asked for', async () => {
    const analysis = await analyzeProject(fixture('brochure-site'));

    const plain = buildReport(analysis, { profile: 'static-site' });
    const declared = buildReport(analysis, { profile: 'static-site', declared: { hasBilling: true } });

    // A static site says nothing about payments. An owner who says they take payments
    // is asking to be judged on them, and the capability is not in that profile at all
    // — so it is added rather than merely raised.
    expect(expectationTitles(plain).some((t) => /Billing/i.test(t))).toBe(false);
    expect(expectationTitles(declared).some((t) => /Billing/i.test(t))).toBe(true);
    /**
     * The capability score, not the overall one.
     *
     * Both reports rest on a handful of checks — a brochure site is four files — so both
     * overall scores sit on the coverage ceiling, where a difference of a few points
     * cannot show. What the declaration changes is what was expected of the project, and
     * that is the number that carries it.
     */
    expect(declared.expectedCapabilityScore ?? 100).toBeLessThan(plain.expectedCapabilityScore ?? 100);
  });

  it('never removes a finding the code earned', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));

    const plain = buildReport(analysis, { profile: 'b2c-app' });
    const denied = buildReport(analysis, {
      profile: 'b2c-app',
      declared: { hasFileUploads: false, handlesPersonalData: false, hasBilling: false },
    });

    // The whole point. A `false` is not evidence of absence, and if it could cancel a
    // finding then the score would measure the owner's optimism rather than the
    // product — an off switch for problems.
    expect(denied.overallScore).toBe(plain.overallScore);
    expect(expectationTitles(denied)).toEqual(expectationTitles(plain));
  });

  it('does not lower an expectation the profile already treats as required', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));

    const plain = buildReport(analysis, { profile: 'b2b-saas' });
    const declared = buildReport(analysis, { profile: 'b2b-saas', declared: { requiresTenantIsolation: true } });

    // b2b-saas already requires tenant isolation, so declaring it changes nothing.
    // Raising only means the declaration can agree with the profile but never soften it.
    expect(declared.overallScore).toBe(plain.overallScore);
  });

  it('implies everything the declaration implies, not one thing', async () => {
    const analysis = await analyzeProject(fixture('brochure-site'));

    const declared = buildReport(analysis, {
      profile: 'static-site',
      declared: { handlesPersonalData: true },
    });

    const titles = expectationTitles(declared);

    // Saying you hold personal data is saying you owe consent, export, erasure and a
    // retention position — not consent alone.
    expect(titles.some((t) => /Consent/i.test(t))).toBe(true);
    expect(titles.some((t) => /export/i.test(t))).toBe(true);
    expect(titles.some((t) => /erasure/i.test(t))).toBe(true);
    expect(titles.some((t) => /Retention/i.test(t))).toBe(true);
  });
});
