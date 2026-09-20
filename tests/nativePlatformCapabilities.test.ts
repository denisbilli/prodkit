import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const statusOf = (report: { findings: Array<{ id: string; status: string }> }, id: string) =>
  report.findings.find((finding) => finding.id === id)?.status;

/**
 * Two capabilities the mobile profile requires, read for the platforms it applies to.
 *
 * Both were written for code running in a browser tab and then made required for
 * applications that have no browser in them. `client.error-reporting` looked for npm
 * packages and `window.onerror`; `mobile.offline` listed third-party databases and
 * omitted the two that ship with the operating systems. Neither could ever come back
 * satisfied on a native application, and a check whose answer cannot vary is not a
 * measure — it is a finding printed for everybody.
 *
 * Measured on three real repositories before any of this was written: DuckDuckGo iOS,
 * thunderbird-android and WordPress-iOS were each told at `high` that a crash on
 * somebody's phone reaches nobody, and the last two that they store nothing locally —
 * an email client and a blog editor, whose entire point is working on a train.
 */
describe('capabilities the platform provides rather than a package', () => {
  it('reads Core Data as the local store it is', async () => {
    const report = buildReport(await analyzeProject(fixture('ios-core-data-and-crashes')), { profile: 'auto' });

    expect(statusOf(report, 'expectation.mobile.offline.required')).toBeUndefined();
  });

  it('reads a crash reporter pinned in Package.resolved', async () => {
    const analysis = await analyzeProject(fixture('ios-core-data-and-crashes'));

    expect(analysis.detectors['observability.errorReporting']?.present).toBe(true);
    expect(analysis.detectors['observability.errorReporting']?.details?.services).toContain('sentry-cocoa');
  });

  it('reads SQLiteOpenHelper as the local store it is', async () => {
    const analysis = await analyzeProject(fixture('android-sqlite-and-crashes'));

    expect(analysis.detectors['mobile.offline']?.present).toBe(true);
  });

  /**
   * `Thread.setDefaultUncaughtExceptionHandler` is the JVM's own hook, and Kotlin
   * installs it with a trailing lambda rather than a parenthesised argument — which is
   * how both Android applications measured write it.
   */
  it('reads a hand-installed crash handler, and does not call it complete', async () => {
    const analysis = await analyzeProject(fixture('android-sqlite-and-crashes'));
    const reporting = analysis.detectors['observability.errorReporting'];

    expect(reporting?.present).toBe(true);
    expect(reporting?.complete).toBe(false);
  });

  /**
   * `app.state-durability` asks the same question from the other side, and answered it
   * with the browser's vocabulary: `localStorage` as the fragile case, Prisma or `pg`
   * as the durable one. On a phone that reasoning inverts — Core Data and SQLite
   * survive the process being killed, the device restarting and the person coming back
   * a week later. All four real applications measured came back `partial` while
   * keeping everything they own on disk.
   */
  it('counts an on-device store as durable, not as the fragile case', async () => {
    const analysis = await analyzeProject(fixture('ios-core-data-and-crashes'));
    const durability = analysis.detectors['app.stateDurability'];

    expect(durability?.present).toBe(true);
    expect(durability?.complete).toBe(true);
    expect(durability?.details?.onDevice).toBe(true);
    expect(durability?.details?.serverStore).toBe(false);
  });

  /**
   * Apple requires `PrivacyInfo.xcprivacy` in the bundle; Play's data-safety form is
   * filled in the console and leaves nothing in the tree. thunderbird-android was told
   * it was missing a file it has no way to have.
   */
  it('does not ask an Android-only repository for a file that lives in the Play console', async () => {
    const analysis = await analyzeProject(fixture('android-sqlite-and-crashes'));
    const declaration = analysis.detectors['mobile.privacyDeclaration'];

    expect(declaration?.present).toBe(false);
    expect(declaration?.unanswered).toBe(true);

    const report = buildReport(analysis, { profile: 'auto' });
    expect(statusOf(report, 'expectation.mobile.privacy-declaration.recommended')).toBeUndefined();
  });

  it('still asks an iOS repository, where the file is required in the bundle', async () => {
    const analysis = await analyzeProject(fixture('android-sqlite-and-crashes'));
    const iosAnalysis = await analyzeProject(fixture('ios-app'));

    expect(analysis.detectors['mobile.privacyDeclaration']?.unanswered).toBe(true);
    expect(iosAnalysis.detectors['mobile.privacyDeclaration']?.unanswered).toBe(false);
  });

  /**
   * The direction this must not drift in: the point is not that mobile applications
   * pass, it is that the question is asked of them. A repository with neither a local
   * store nor a crash handler still says so.
   */
  it('still reports a mobile application that has neither', async () => {
    const analysis = await analyzeProject(fixture('ios-app'));

    expect(analysis.detectors['mobile.offline']?.present).toBe(false);
    expect(analysis.detectors['observability.errorReporting']?.present).toBe(false);
    expect(analysis.detectors['app.stateDurability']?.complete).toBe(false);
  });
});

/**
 * Which manifest is the project's, when several are present and only one is the
 * product's.
 *
 * Measured on DuckDuckGo iOS: 1194 Swift files, a `package.json` whose only job is
 * running rollup over one content-blocking script, and a fastlane `Gemfile` at the
 * root. The report said "Package manager: npm (lockfile)", and with npm ruled out it
 * said "bundler" — because the Gemfile sits at depth 1 and the real Swift manifest
 * five directories down inside the `.xcodeproj`. Depth was the only question being
 * asked, and depth is the wrong one when the shallow manifest belongs to the build
 * tooling. It is the same mistake WordPress-iOS produced a layer up, where the
 * fastlane Gemfile was read as the backend.
 */
describe('the manifest that says what the project is built with', () => {
  it('prefers the ecosystem the source is actually written in', async () => {
    const analysis = await analyzeProject(fixture('ios-with-build-tooling'));

    expect(analysis.stack.packageManager).toBe('swift package manager');
  });

  it('still calls a repository whose only manifest is a package.json an npm one', async () => {
    const analysis = await analyzeProject(fixture('npm-library'));

    expect(analysis.stack.packageManager).toBe('npm');
  });

  /**
   * The Apple managers exist as answers at all only because their manifests are
   * parsed: `Package.swift` and the Podfile for a long while, `Package.resolved` since
   * 0.75.0. Before that an iOS application could come out as `npm` or as `unknown`,
   * and nothing else.
   */
  it('names Swift Package Manager from a Package.resolved inside the xcodeproj', async () => {
    const analysis = await analyzeProject(fixture('ios-app'));

    expect(analysis.stack.packageManager).toBe('swift package manager');
  });
});

/**
 * What a native application's front end is.
 *
 * Nothing here could name one, so the question fell through to the "a page is a front
 * end" fallback and DuckDuckGo iOS — 1194 Swift files — was reported as
 * `frontend: html`, from the error pages and onboarding documents it ships inside the
 * app. A reader sees that line and thinks web application.
 */
describe('the interface a native application actually has', () => {
  it('names the toolkit rather than the HTML the app happens to ship', async () => {
    const analysis = await analyzeProject(fixture('ios-with-build-tooling'));

    expect(analysis.stack.frontend).toContain('uikit');
    expect(analysis.stack.frontend).not.toContain('html');
  });

  it('still calls a page a front end where there is no toolkit', async () => {
    const analysis = await analyzeProject(fixture('vanilla-static'));

    expect(analysis.stack.frontend).toContain('html');
  });

  it('reads SwiftUI and Jetpack Compose from the import the platform defines', async () => {
    const swift = await analyzeProject(fixture('swift-app'));
    const android = await analyzeProject(fixture('android-app'));

    expect(swift.stack.frontend).toContain('swiftui');
    expect(android.stack.frontend).toContain('android views');
  });
});
