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

  it('reads the Gemfile and ignores a commented-out gem', async () => {
    // A commented gem reads exactly like a real one to anything matching line by line,
    // and would have this fixture report both rails and sinatra.
    const analysis = await analyzeProject(fixture('rails-app'));

    expect(analysis.stack.backend).toContain('rails');
    expect(analysis.stack.backend).not.toContain('sinatra');
    expect(analysis.stack.databases).toContain('postgres');
  });
});
