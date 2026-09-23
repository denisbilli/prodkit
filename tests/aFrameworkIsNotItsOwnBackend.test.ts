import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A framework is not its own product's backend.
 *
 * `sinatra/sinatra` came out with no profile: nothing read its gemspec, so it had no
 * manifest and no entry point, and the backend detector found sinatra — itself — and
 * nothing else. A gem is a `Gem::Specification` with a `lib/` to require, and a backend
 * whose every framework is a name the repository publishes under is what the package is.
 */
describe('a framework is not its own backend', () => {
  it('reads a gem named for the framework it is as a library', async () => {
    const analysis = await analyzeProject(fixture('a-ruby-framework-gem'));

    expect(analysis.detectors['packaging.entrypoints']?.details?.rubyGem).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  /** A gem that serves with Roda is a Roda application, not Roda. */
  it('still reads a gem built on the framework as a service', async () => {
    const analysis = await analyzeProject(fixture('a-gem-that-serves-with-roda'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });
});
