import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('manifests beyond npm and pip', () => {
  it('reads go.mod for the framework and the data layer', async () => {
    const analysis = await analyzeProject(fixture('go-gin-api'));

    expect(analysis.stack.backend).toContain('gin');
    expect(analysis.stack.databases).toContain('postgres');
    expect(analysis.files.source.some((f) => f.endsWith('.go'))).toBe(true);
  });

  it('matches a Go module on its suffix, not its host', async () => {
    // A manifest says github.com/gin-gonic/gin, and a rule asks for gin-gonic/gin. The
    // host differs for forks and mirrors, and repeating it in every rule would make
    // each one wrong for the next vanity domain.
    const analysis = await analyzeProject(fixture('go-gin-api'));

    expect(analysis.detectors['stack.backend']?.evidence?.some((e) => e.value.includes('gin-gonic/gin'))).toBe(true);
  });

  it('reads .csproj for the framework and the data layer', async () => {
    const analysis = await analyzeProject(fixture('aspnet-api'));

    expect(analysis.stack.backend).toContain('aspnet-core');
    expect(analysis.stack.databases).toContain('postgres');
  });

  it('takes the web SDK from the project element, which no package declares', async () => {
    // `Microsoft.NET.Sdk.Web` is what makes a project a web application, and it lives on
    // the Sdk attribute rather than in any dependency list. A reader that looked only at
    // PackageReference entries would miss the plainest statement in the file — and this
    // fixture would then read as a library.
    const analysis = await analyzeProject(fixture('aspnet-api'));

    expect(analysis.detectors['stack.backend']?.evidence?.some((e) => /Sdk\.Web/.test(e.value))).toBe(true);
  });

  it('does not call a .NET library a web application', async () => {
    // The other half: a class library uses the plain SDK and has no web packages.
    const analysis = await analyzeProject(fixture('dotnet-library'));

    expect(analysis.stack.backend).toContain('dotnet');
    expect(analysis.stack.backend).not.toContain('aspnet-core');
  });

  it('matches a .NET package on its prefix, not its full name', async () => {
    // A project references Npgsql.EntityFrameworkCore.PostgreSQL and a rule asks for
    // Npgsql; listing every provider package would make the rule wrong for the next one.
    const analysis = await analyzeProject(fixture('aspnet-api'));

    expect(analysis.stack.databases).toContain('postgres');
  });

  it('reads the Gemfile and ignores a commented-out gem', async () => {
    // A commented gem reads exactly like a real one to anything matching line by line,
    // and would have this fixture report both rails and sinatra.
    const analysis = await analyzeProject(fixture('rails-app'));

    expect(analysis.stack.backend).toContain('rails');
    expect(analysis.stack.backend).not.toContain('sinatra');
    expect(analysis.stack.databases).toContain('postgres');
  });
});
