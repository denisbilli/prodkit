import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A Go web framework is a library.
 *
 * `gin-gonic/gin` has no profile at all: `net/http` everywhere made it a backend, and the
 * check for a `main` package read `\tpackage main` inside the usage example of its doc.go
 * comment. A Go module with no package clause `main` at column 0 — where gofmt puts it —
 * and a licence, which pkg.go.dev requires before it will show a module's documentation,
 * is a library whatever it imports.
 */
describe('a Go web framework is a library', () => {
  it('reads a module with no main and a licence as a library', async () => {
    const analysis = await analyzeProject(fixture('a-go-web-framework'));

    expect(analysis.detectors['packaging.entrypoints']?.details?.goLibrary).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  /** A licensed service with a `cmd/server/main.go` is still a service. */
  it('still reads a service with a main package as a service', async () => {
    const analysis = await analyzeProject(fixture('a-go-service-with-a-licence'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });

  /**
   * And a fragment of a server with no `main` and no licence is not a library: the licence
   * is what a module meant for importing carries, and without it the rule turned thirteen
   * Go fixtures into libraries.
   */
  it('does not read an unlicensed fragment as a library', async () => {
    const analysis = await analyzeProject(fixture('go-server-that-hashes-passwords'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });
});
