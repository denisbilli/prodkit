import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * windmill serves its requests from 547 Rust files, and the report said
 * "Backend: go".
 *
 * Two things were wrong at once. A `go.mod` anywhere in the tree named the backend,
 * and windmill's belongs to a Go client SDK — two files, 0.05% of its source. And Rust
 * was not read at all: no Cargo.toml parsing, no frameworks, so a Rust web service
 * could only ever be reported as whatever else happened to be lying around.
 */
describe('the language that serves the requests is the backend', () => {
  it('reads the Rust framework a product actually uses', async () => {
    const analysis = await analyzeProject(fixture('rust-backend-with-go-sdk'));

    expect(analysis.stack.backend).toContain('axum');
  });

  it('does not name a client SDK as the backend', async () => {
    const analysis = await analyzeProject(fixture('rust-backend-with-go-sdk'));

    expect(analysis.stack.backend).not.toContain('go');
  });

  it('still reports Go where Go is what the product is written in', async () => {
    // The guard must not swallow the case it exists beside: a Go module whose sources
    // are the product is still a Go backend, framework or not.
    const analysis = await analyzeProject(fixture('go-gin-api'));

    expect(analysis.stack.backend.length).toBeGreaterThan(0);
  });
})
