import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Two lines of the same report disagreeing about what the project is.
 *
 * The release that taught this analyzer to read Cargo.toml fixed half the answer: the
 * backend line said `axum` and the package manager line, three rows above it, said
 * "go modules" — because `Cargo.toml` was never added to the manifest table and the
 * Go client SDK's `go.mod` was matched first.
 *
 * The list was scanned in order, so the first pattern with a match anywhere decided.
 * Depth is the signal that was already in the paths: a manifest at the root, or nearer
 * it, is the project's; one under `sdk/go/` belongs to something the project ships.
 */
describe('the package manager and the backend describe the same project', () => {
  it('calls a Rust service cargo, not go modules', async () => {
    const analysis = await analyzeProject(fixture('rust-backend-with-go-sdk'));

    expect(analysis.stack.packageManager).toBe('cargo');
    expect(analysis.stack.backend).toContain('axum');
  });

  it('leaves a Go project on go modules', async () => {
    // The guard must not swallow the case it exists beside.
    const analysis = await analyzeProject(fixture('go-gin-api'));

    expect(analysis.stack.packageManager).toBe('go modules');
  });

  it('leaves a Maven project on maven', async () => {
    const analysis = await analyzeProject(fixture('maven-spring-api'));

    expect(analysis.stack.packageManager).toBe('maven');
  });
})
