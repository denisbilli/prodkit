import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A framework's servers are in its documentation.
 *
 * `fastapi/fastapi` came out as a consumer application at high confidence: every
 * `app = FastAPI()` and `Flask(__name__)` is in `docs_src/`, the code its documentation
 * pages run, and its one HTML template is there too. A published package that builds an
 * application only under docs, examples and tests is demonstrating one.
 */
describe('a Python framework and its docs', () => {
  it('reads a package whose apps are all in docs_src as a library', async () => {
    const analysis = await analyzeProject(fixture('a-python-framework-and-its-docs'));

    expect(analysis.detectors['stack.backend']?.details?.servedOutsideDocs).toBe(false);
    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  /** A packaged service that builds its app in `app/main.py` is a service, docs or not. */
  it('still reads a packaged service as a service', async () => {
    const analysis = await analyzeProject(fixture('a-fastapi-product-with-docs'));

    expect(analysis.detectors['stack.backend']?.details?.servedOutsideDocs).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });

  /**
   * The constructor search does not know every way a Go program starts a server, so the
   * backend's own evidence has to be in docs too: a fragment whose backend line is
   * `apis/serve.go` is not documentation.
   */
  it('does not read a backend outside docs as documentation', async () => {
    const analysis = await analyzeProject(fixture('go-declares-then-decides'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });
});
