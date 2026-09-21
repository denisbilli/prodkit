import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Rails is often declared by its parts rather than by its name.
 *
 * Discourse's Gemfile has no `gem "rails"` in it at all: it pins `actionpack`,
 * `actionview`, `activerecord` and `railties` separately, which is what a large
 * application does when it wants to control the pieces. The report said `backend:
 * ruby` — the fallback for a Gemfile with no web framework in it — about the
 * best-known Rails application there is, and every Rails-shaped question after that
 * was asked of a project the analyzer thought had no framework.
 *
 * `railties` is the framework itself and nothing but Rails and its engines depends on
 * it; `actionpack` is the half that handles requests. Both are names the Rails team
 * chose, which is the whole argument.
 */
describe('Rails by its parts', () => {
  it('is named from its component gems, not only from the meta-gem', async () => {
    const analysis = await analyzeProject(fixture('rails-by-its-parts'));

    expect(analysis.stack.backend).toContain('rails');
  });

  /**
   * And it is the framework rule that fires, not the fallback beside it. `ruby` means
   * "a Gemfile with no web framework in it", which is the sentence that was wrong
   * about Discourse.
   */
  it('stops falling back to the language', async () => {
    const analysis = await analyzeProject(fixture('rails-by-its-parts'));

    expect(analysis.stack.backend).not.toContain('ruby');
  });
});
