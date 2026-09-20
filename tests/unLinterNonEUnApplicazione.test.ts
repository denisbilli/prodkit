import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Teaching this analyzer to read Rust made it worse at the best-known Rust project
 * in the corpus.
 *
 * ruff is a linter: `Cargo.toml` at the root, 2914 source files, fifty of them
 * TypeScript and all fifty under `playground/`. 0.50.0 added a fallback — a Cargo
 * manifest with no web framework named in it reports `rust` as a backend — written
 * to mirror Go's, whose justification is that plenty of production services use
 * `net/http` and nothing else.
 *
 * Rust's standard library has no HTTP server at all, so the mirror does not hold. A
 * crate with no web framework is overwhelmingly a library, a parser or a
 * command-line tool, and ruff was profiled as a client application because "a
 * backend disqualifies a library".
 *
 * `hyper` takes the fallback's place: it is what a Rust service uses when it uses no
 * framework.
 */
describe('a crate with no web framework is not a server', () => {
  it('does not call a Rust command-line tool a backend', async () => {
    const analysis = await analyzeProject(fixture('rust-cli-tool'));

    expect(analysis.stack.backend).toEqual([]);
  });

  it('still names the framework where a crate serves requests', async () => {
    const analysis = await analyzeProject(fixture('rust-backend-with-go-sdk'));

    expect(analysis.stack.backend).toContain('axum');
  });

  it('reads hyper as a server, since that is what one without a framework uses', async () => {
    const analysis = await analyzeProject(fixture('rust-hyper-service'));

    expect(analysis.stack.backend).toContain('hyper');
  });
})
