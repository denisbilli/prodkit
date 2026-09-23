import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A web framework is a library.
 *
 * `tokio-rs/axum` depends on hyper and tower-http because serving HTTP is its subject, and
 * came out as a consumer application at high confidence. Its servers are all under
 * `examples/`, and the only front end outside them was two HTML pages in
 * `axum-extra/test_files/`, test data for its static-file service. In Rust whether
 * something runs is structure, not dependencies: crates with `src/lib.rs` and no
 * `src/main.rs` or `src/bin/` build nothing anybody starts.
 */
describe('a web framework is a library', () => {
  it('reads library crates with a server in examples as a library', async () => {
    const analysis = await analyzeProject(fixture('a-web-framework-is-a-library'));

    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  /** A crate with a `main.rs` that binds a port is the service, whatever library it also has. */
  it('still reads a service with a binary as a service', async () => {
    const analysis = await analyzeProject(fixture('a-service-built-on-the-framework'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });
});
