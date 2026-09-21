import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const cors = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'security.cors-origin');
};

/**
 * Rust configures this on a builder, and the method is the decision.
 *
 * meilisearch calls `.send_wildcard()` and `.allow_any_origin()` on an
 * `actix_cors::Cors` — the most explicit way there is to say "everybody" — and the
 * report said "CORS configuration not detected". It is the third product in three
 * releases scoring well while answering every origin on the web, after kimai's
 * `nelmio_cors.yaml` and chatwoot's `origins '*'`, and all three failed the same way:
 * a check built from HTTP header names cannot read a framework's own vocabulary.
 *
 * meilisearch goes from 84 to 76.
 *
 * `Cors`, `allow_any_origin`, `allowed_origin` and `permissive` are actix-cors';
 * `CorsLayer` and `allow_origin` are tower-http's. The method says which branch it
 * is, and the values are the author's.
 */
describe('Rust configures CORS on a builder', () => {
  it('reads allow_any_origin as the wide-open policy it is', async () => {
    const found = await cors('actix-cors-any-origin');

    expect(found?.status).toBe('partial');
    expect(found?.evidence.some((e) => String(e.value).includes('allow_any_origin'))).toBe(true);
  });

  it('reads a named origin as a decision somebody made', async () => {
    expect((await cors('actix-cors-chosen'))?.status).toBe('passed');
  });

  /**
   * The tower-http half ships weaker than this one and the note says so where a
   * reader will find it. meilisearch is the actix case; two axum services cloned
   * looking for the other one — atuin and lapdev — turned out to configure no CORS at
   * all. `CorsLayer::permissive()` and `.allow_origin(Any)` are the same contract read
   * from the same kind of builder, but no repository stands behind them yet, so there
   * is no fixture here pretending otherwise.
   */
  it.todo('is confirmed on a real axum service using CorsLayer');
});
