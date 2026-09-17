import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('mobile applications', () => {
  it('recognises an Android project from its manifest', async () => {
    const analysis = await analyzeProject(fixture('android-app'));

    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
    expect(analysis.detectors['mobile.platform']?.details?.platforms).toContain('android');
  });

  it('recognises an iOS project, and is not fooled into calling it a backend', async () => {
    const analysis = await analyzeProject(fixture('ios-app'));

    expect(analysis.detectors['mobile.platform']?.details?.platforms).toContain('ios');
    expect(analysis.stack.backend).toEqual([]);
  });

  it('does not look for any of this in a project that is not mobile', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));

    // Reported absent with no evidence rather than as a finding: an Express server
    // being told it has no Keychain usage is noise, and the profile that asks these
    // questions is the only one that applies them.
    expect(analysis.detectors['mobile.platform']?.present).toBe(false);
    expect(analysis.detectors['mobile.credentialStorage']?.evidence).toEqual([]);
  });

  it('counts a permission as asked for only when it is explained or requested in context', async () => {
    const android = await analyzeProject(fixture('android-app'));
    const ios = await analyzeProject(fixture('ios-app'));

    // Three permissions in the manifest, none requested at the point of use. The
    // manifest entry is what the compiler needs; it is not what the person tapping
    // "Allow" is owed.
    expect(android.detectors['mobile.permissions']?.present).toBe(false);
    expect(android.detectors['mobile.permissions']?.evidence.length).toBeGreaterThan(0);

    // Two permissions, each with a purpose string that says what it is for.
    expect(ios.detectors['mobile.permissions']?.present).toBe(true);
  });

  it('tells a token in the keychain from a token in shared preferences', async () => {
    const android = await analyzeProject(fixture('android-app'));
    const ios = await analyzeProject(fixture('ios-app'));

    expect(android.detectors['mobile.credentialStorage']?.present).toBe(false);
    expect(ios.detectors['mobile.credentialStorage']?.present).toBe(true);
  });

  it('finds the privacy declaration when it is kept beside the code', async () => {
    const ios = await analyzeProject(fixture('ios-app'));
    const android = await analyzeProject(fixture('android-app'));

    expect(ios.detectors['mobile.privacyDeclaration']?.present).toBe(true);
    expect(android.detectors['mobile.privacyDeclaration']?.present).toBe(false);
  });

  it('classifies a mobile project as a mobile application', async () => {
    const inference = inferProductProfile(await analyzeProject(fixture('android-app')));

    expect(inference.inferredProfile).toBe('mobile-app');
  });

  it('asks a mobile app for the things only a mobile app has to answer for', async () => {
    const analysis = await analyzeProject(fixture('android-app'));
    const report = buildReport(analysis, { profile: 'mobile-app' });

    // Expectations only. The deterministic detectors also report what they observed —
    // "Tenant and organization boundaries: unknown" among them — and that is a
    // statement about the code, not a demand on it. What the profile decides is which
    // of them the product is held to.
    const expected = report.findings.filter((finding) => finding.id.startsWith('expectation.'));
    const titles = expected.map((finding) => finding.title);

    expect(titles.some((title) => /keychain/i.test(title))).toBe(true);
    expect(titles.some((title) => /Permissions asked in context/i.test(title))).toBe(true);

    // And none of what a server is held to. Holding a phone app to tenant isolation
    // produces findings nobody can act on, which is the failure this profile exists to
    // stop — the same one client-app was created for, one step further in.
    expect(titles.some((title) => /tenant|audit/i.test(title))).toBe(false);
  });
});

describe('native manifests', () => {
  it('reads Gradle dependencies in either dialect', async () => {
    const analysis = await analyzeProject(fixture('android-app'));

    // group:artifact, without the version: every rule downstream asks which library is
    // used, never which release of it.
    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
    expect(analysis.stack.languages).toContain('kotlin');
  });

  it('reads Swift sources as Swift', async () => {
    const analysis = await analyzeProject(fixture('ios-app'));

    expect(analysis.stack.languages).toContain('swift');
  });

  it('no longer calls a native project inconclusive', async () => {
    // It used to report "no package manifests were found" for a project with an
    // AndroidManifest.xml and a build.gradle in it — the analyzer saying it understood
    // nothing about a project it had in fact identified, and capping the score at 39
    // on that basis.
    for (const name of ['android-app', 'ios-app']) {
      const report = buildReport(await analyzeProject(fixture(name)), { profile: 'mobile-app' });

      expect(report.inconclusive, `${name} is inconclusive`).toBe(false);
      expect(report.overallScore).toBeGreaterThan(39);
    }
  });
});
