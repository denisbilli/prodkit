import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * From an independent review of a real report, checked claim by claim against the
 * repository it described. Its verdict was "useful as a checklist, unreliable as a
 * verdict", and these two were the reasons that applied to every report rather than to
 * one repository.
 */
describe('what the report is willing to claim', () => {
  it('never calls a finding critical when it could not evidence it', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });

    // Severity says how bad it would be if true; confidence says whether it is. Eleven
    // findings of thirty-two carried "no direct evidence captured" at low confidence
    // and still arrived as critical or high, which is how a tool becomes a checklist
    // nobody trusts.
    // `critical` only, and deliberately: a missing capability cannot carry direct
    // evidence, so every absence is low confidence. Capping those at medium too would
    // leave the report unable to call anything serious. What it must not do is shout.
    const overclaimed = report.findings.filter(
      (finding) => finding.confidence === 'low' && finding.severity === 'critical',
    );

    expect(overclaimed).toEqual([]);
  });

  it('does not lower confidence just because the profile was inferred', async () => {
    const analysis = await analyzeProject(fixture('express-secure'));

    const chosen = buildReport(analysis, { profile: 'b2b-saas' });
    const inferred = buildReport(analysis, { profile: 'auto' });

    // Two different uncertainties were multiplied into one number: on `auto` every
    // finding came out low or medium however strong its evidence. How the profile was
    // chosen is reported separately, as inferenceConfidence.
    const strong = (report: typeof chosen) =>
      report.findings.filter((finding) => finding.evidenceQuality === 'strong' && finding.confidence === 'high').length;

    // Not equality between the two: a different profile evaluates a different set of
    // capabilities, so the counts legitimately differ. What matters is that inferring
    // the profile no longer flattens every finding to low confidence.
    expect(strong(inferred)).toBeGreaterThan(0);
    expect(strong(chosen)).toBeGreaterThan(0);
  });

  it('does not call a category assessed when it only said "I do not know"', async () => {
    const report = buildReport(await analyzeProject(fixture('brochure-site')), { profile: 'auto' });

    for (const category of report.categoryScores) {
      const findings = report.findings.filter((finding) => finding.category === category.category);
      const onlyUnknown = findings.length > 0 && findings.every((finding) => finding.status === 'unknown');

      if (onlyUnknown) expect(category.notAssessed).toBe(true);
    }
  });

  it('does not call an absence a strength', async () => {
    const report = buildReport(await analyzeProject(fixture('brochure-site')), { profile: 'auto' });

    // A school platform with no payments anywhere was told "no issues found in taking
    // payments", as a strength. A strength is something the report watched work.
    for (const strength of report.executiveSummary.strengths) {
      const named = report.categoryScores.find((entry) => strength.includes(entry.category));
      if (named) expect(report.findings.some((f) => f.category === named.category && f.status === 'passed')).toBe(true);
    }
  });
});
