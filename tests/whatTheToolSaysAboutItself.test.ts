import { readFileSync } from 'node:fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { productProfileChoices } from '../src/expectations/productProfiles';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Found by running the command-line tool the way somebody who installed it would.
 *
 * `prodkit analyze <a Flutter app>` printed "Detected frontend: flutter" and, four lines
 * later, "INCONCLUSIVE: project not recognized". The rule that said so had been written
 * against the profile path, where a full set of expectations runs; the command-line tool
 * defaults to observed-only, where three or four verdicts is simply what a small project
 * produces, and twenty-three reports in the corpus were affected.
 */
describe('a reading is only called inconclusive when the analysis had its chance', () => {
  it('does not call a small project unreadable because no profile was asked for', async () => {
    const report = buildReport(await analyzeProject(fixture('three-viewer')));

    expect(report.diagnostics.assessedChecks).toBeLessThan(5);
    expect(report.inconclusive).toBe(false);
  });

  it('still says so when a full reading was asked for and little came back', async () => {
    // The same repository, asked for everything. Now the thinness is about the project.
    const report = buildReport(await analyzeProject(fixture('three-viewer')), { profile: 'auto' });

    expect(report.inconclusive).toBe(true);
    expect(report.inconclusiveReasons.join(' ')).toMatch(/too few to characterise/);
  });
});

/**
 * The summary named the manifest it had just read and then said it had found none.
 */
describe('naming how a project declares its dependencies', () => {
  it('names the manager whose manifest it read', async () => {
    const analysis = await analyzeProject(fixture('flutter-app'));

    expect(analysis.stack.packageManager).toBe('pub');
    expect(analysis.stack.packageManagerConfidence).toBe('manifest');
  });

  it('does not claim a missing manifest when one was read', async () => {
    const analysis = await analyzeProject(fixture('flutter-app'));

    expect(analysis.stack.warnings.join(' ')).not.toMatch(/No dependency manifest was found/);
  });

  it('does not read Flutter\'s own generated tooling as the project\'s dependencies', async () => {
    /**
     * `ios/Flutter/ephemeral/flutter_lldb_helper.py` is written and rewritten by Flutter
     * itself. Its `import lldb` was read as a dependency of the application, so a Dart
     * project's report said some of its dependencies came from Python imports.
     */
    const analysis = await analyzeProject(fixture('flutter-app'));

    expect(analysis.files.source.some((file) => file.includes('ephemeral'))).toBe(false);
    expect(analysis.stack.warnings.join(' ')).not.toMatch(/Python imports/);
  });

  it('still prefers the Node manifest where there is one', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));

    expect(analysis.stack.packageManager).toBe('npm');
  });
});

/**
 * A command-line tool's help is the only documentation most people read.
 */
describe('what --help offers', () => {
  const cli = readFileSync(path.resolve(__dirname, '..', 'src', 'cli.ts'), 'utf8');

  it('offers every profile the analyzer has', () => {
    // The list was typed by hand and named eight of twelve: `library`, `game`,
    // `client-app` and `mobile-app` had been added since — every profile covering
    // something other than a web application.
    expect(cli).toContain('PROFILE_OPTION_LIST');
    expect(cli).not.toMatch(/Product profile: observed-only\|static-site/);

    const ids = productProfileChoices().map((choice) => choice.id);
    expect(ids).toContain('library');
    expect(ids).toContain('mobile-app');
  });

  it('says what each command does', () => {
    expect(cli).toMatch(/\.command\('analyze'\)\s*\n\s*\.description\(/);
    expect(cli).toMatch(/\.command\('plan'\)\s*\n\s*\.description\(/);
  });
});
