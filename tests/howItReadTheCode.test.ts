import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';
import { describeReadingDepth, readingDepths } from '../src/analyzer/readingDepth';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Sixty-eight keyword searches against one structural claim, and six of eighteen
 * readable extensions covered by a parser. A report on a Go project and a report on a
 * TypeScript project looked equally sure of themselves, and were not.
 *
 * This is the same failure as everything else corrected on 18 September — saying more
 * than can be shown — applied to the analyzer's own method rather than to a finding.
 */
describe('the report says how it read the code', () => {
  it('calls a language parsed only where a parser reads it', async () => {
    const analysis = await analyzeProject(fixture('roles-and-chat'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable);

    expect(readings.find((entry) => entry.language === 'JavaScript')?.depth).toBe('parsed');
  });

  it('calls a language searched where only keywords reach it', async () => {
    const analysis = await analyzeProject(fixture('django-basic'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable);

    expect(readings.find((entry) => entry.language === 'Python')?.depth).toBe('searched');
  });

  it('counts a language it cannot read at all as skipped', async () => {
    const analysis = await analyzeProject(fixture('phoenix-app'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable);

    expect(readings.find((entry) => entry.language === 'Elixir')?.depth).toBe('skipped');
  });

  it('says nothing when everything was parsed', () => {
    // A report congratulating itself on reading properly is noise.
    expect(describeReadingDepth([{ language: 'TypeScript', files: 40, depth: 'parsed' }])).toBeUndefined();
  });

  it('tells the reader, rather than only the diagnostics', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'auto' });
    const markdown = renderMarkdown(report);

    expect(markdown).toMatch(/How this repository was read/);
    expect(markdown).toMatch(/Python/);
    expect(markdown).toMatch(/rest on weaker evidence/);
  });
});

/**
 * `AndroidManifest.xml` says Android. `build.gradle` says the JVM.
 *
 * spring-petclinic — the canonical Spring web application — was read as a mobile app at
 * high confidence, on the strength of having a Gradle build. So would every JVM server
 * ever written.
 */
describe('what makes a repository a phone application', () => {
  it('does not call a Spring service a mobile app', async () => {
    const analysis = await analyzeProject(fixture('spring-service'));

    expect(analysis.detectors['mobile.platform']?.present).toBe(false);
  });

  it('still recognises an Android build', async () => {
    // The line that makes a Gradle build an Android build is the plugin, and it has to
    // be read rather than matched on a path.
    const analysis = await analyzeProject(fixture('android-gradle-app'));

    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
    expect((analysis.detectors['mobile.platform']?.details?.platforms as string[])).toContain('android');
  });

  it('still recognises a manifest without any Gradle at all', async () => {
    const analysis = await analyzeProject(fixture('android-app'));

    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
  });
});

/**
 * A true signal about one project, read as a fact about the whole.
 *
 * dotnet/eShop contains a real MAUI client — the markers are not a false positive — and
 * it is one project of a dozen: 137 source files of 515, beside a web application and
 * eight services. The repository came back as a phone application.
 */
describe('one project inside a repository is not the repository', () => {
  it('does not call a system with a mobile client a mobile app', async () => {
    const analysis = await analyzeProject(fixture('dotnet-system'));
    const report = buildReport(analysis, { profile: 'auto' });

    // The markers are real and stay found; what changes is what they are taken to mean.
    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
    expect(report.productProfile?.inferredProfile).not.toBe('mobile-app');
  });

  it('measures how much of the repository the mobile project is', async () => {
    const analysis = await analyzeProject(fixture('dotnet-system'));

    expect(analysis.detectors['mobile.platform']?.details?.sourceShare as number).toBeLessThan(0.5);
  });

  it('still calls a phone application a phone application', async () => {
    // Every repository in the corpus that is one has its manifest at the root and scores
    // 1, including the Xcode layout where the project bundle sits beside the sources.
    for (const name of ['android-app', 'flutter-app', 'android-gradle-app', 'swift-app']) {
      const analysis = await analyzeProject(fixture(name));

      expect(analysis.detectors['mobile.platform']?.details?.sourceShare as number, name).toBe(1);
    }
  });
});
