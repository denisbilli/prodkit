import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Three things `Kareadita/Kavita` was credited with and does not have.
 *
 * A second factor, from `TwoFactorEnabled` in twenty migration snapshots — a column
 * ASP.NET Identity puts on every user whether or not anyone turns it on. A data export,
 * from `loadDataSubject`, an RxJS subject in its Angular side nav, and from a test named
 * `ExportAnnotationsCorrectExportUser` in `Kavita.Services.Tests/`, which is how .NET
 * names a test project and which no test-path rule knew.
 */
describe('an Identity schema and its tests', () => {
  it('is not a second factor', async () => {
    const analysis = await analyzeProject(fixture('an-identity-schema-and-its-tests'));

    expect(analysis.detectors['auth.2fa']?.present).toBe(false);
  });

  it('is not a data export, in a subject or in a test project', async () => {
    const analysis = await analyzeProject(fixture('an-identity-schema-and-its-tests'));

    expect(analysis.detectors['gdpr.export.route']?.present).toBe(false);
  });

  /** The calls that use the column are what a real second factor has. */
  it('still finds Identity\'s second factor where it is used', async () => {
    const analysis = await analyzeProject(fixture('identity-with-a-second-factor'));

    expect(analysis.detectors['auth.2fa']?.present).toBe(true);
  });
});
