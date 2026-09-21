import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { readFacts, scoreProfiles } from '../src/expectations/profileSignals';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const topProfile = async (name: string) => {
  const analysis = await analyzeProject(fixture(name));

  return scoreProfiles(readFacts(analysis))[0]?.profile;
};

/**
 * Only an npm or Python package could reach the `library` profile.
 *
 * `packaging.manifest` and `packaging.entrypoints` read `package.json` and Python
 * packaging and nothing else, so a library written in anything else fell through to
 * whichever application profile fitted least badly. Moq — a mocking library of 243 C#
 * files, `<PackageId>Moq</PackageId>` and `<IsPackable>True</IsPackable>` in its
 * csproj — was judged a client application and asked at `high` for state durability,
 * asset delivery and browser crash reporting. tokio could not be classified at all.
 */
describe('a library that is not on npm', () => {
  it('is read from a csproj that declares a package id', async () => {
    expect(await topProfile('dotnet-nuget-library')).toBe('library');
  });

  it('is read from a Cargo package with a library crate root', async () => {
    expect(await topProfile('rust-published-crate')).toBe('library');
  });
});

/**
 * A `.csproj` with no web SDK was listed as a backend called "dotnet", which is the
 * mistake the Rust fallback made before 0.71.0: a project file is not a server. .NET
 * builds libraries, console tools, desktop applications and web services from the
 * same format, and `Microsoft.NET.Sdk.Web` is the line that says which.
 */
describe('what makes a .NET project a backend', () => {
  it('is the web SDK, not the project file', async () => {
    const analysis = await analyzeProject(fixture('dotnet-library'));

    expect(analysis.stack.backend).toEqual([]);
  });

  it('still names one that declares the web SDK', async () => {
    const analysis = await analyzeProject(fixture('aspnet-api'));

    expect(analysis.stack.backend).toContain('aspnet-core');
  });
});

/**
 * A library is not an unidentified repository.
 *
 * The three stack lists describe an application, and a package has none of them, so
 * "nothing identified" was true of every library — and that is what makes a report
 * inconclusive. Removing the `.csproj` backend fallback pushed the `dotnet-library`
 * fixture over that line in the same release: a library with a NuGet manifest, read
 * correctly, reported as a repository the analyzer could not make sense of.
 */
describe('a package manager and a language identify a repository', () => {
  it('stops calling a NuGet library an unidentified stack', async () => {
    const report = buildReport(await analyzeProject(fixture('dotnet-library')), { profile: 'auto' });

    expect(report.inconclusiveReasons).not.toContain('No frontend, backend, or database stack signals were detected.');
  });

  /**
   * The fixture stays inconclusive for a different and honest reason — two files
   * reach three verdicts, which is too little to characterise anything. That is the
   * other half of the test: the reason had to change, not disappear.
   */
  it('and still says so when there is barely anything to read', async () => {
    const report = buildReport(await analyzeProject(fixture('dotnet-library')), { profile: 'auto' });

    expect(report.inconclusive).toBe(true);
    expect(report.inconclusiveReasons.join(' ')).toMatch(/too few to characterise/);
  });

  it('names a Rust crate as a fingerprint of its own', async () => {
    const report = buildReport(await analyzeProject(fixture('rust-cli-tool')), { profile: 'auto' });

    expect([...report.findings, ...report.passedChecks].find((f) => f.id === 'stack.detected')?.status).toBe('passed');
  });
});
