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
