import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = async (name: string, id: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === id);
};

/**
 * The route, in every spelling somebody writes it.
 *
 * `\/(health|healthz|readyz|livez|alive)\b` does not match `/healthcheck`: after
 * `health` comes a `c`, and the word boundary fails. Netflix's dispatch declares
 * `@api_router.get("/healthcheck")` and was told it has no health endpoint — the
 * plainest spelling there is, missed by the pattern written to find it.
 *
 * This does not disturb the decision recorded in the detector about Dropwizard's
 * admin `/healthcheck`, which is not counted because every Dropwizard application has
 * it for being Dropwizard. That endpoint lives in the framework; no application
 * writes it in its own source, and a line like dispatch's is somebody declaring the
 * route themselves.
 *
 * dispatch goes from 69 to 71.
 */
describe('the route, in every spelling', () => {
  it('finds a health endpoint called healthcheck', async () => {
    const found = await finding('fastapi-healthcheck-route', 'observability.health');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value).includes('/healthcheck'))).toBe(true);
  });

  /**
   * And the manifest .NET writes its logging in. Radarr declares `NLog`,
   * `NLog.Extensions.Logging` and `NLog.Layouts.ClefJsonLayout` — CLEF being the
   * compact JSON event format — and was reported as logging something but not
   * structurally. The npm list has had winston and pino since the beginning and
   * treats the dependency alone as enough; these are the same statement in another
   * manifest. Radarr goes from 74 to 76.
   */
  /**
   * And an import path is not a route. `import Health from 'typings/Health';` is a
   * TypeScript type in Radarr's frontend, and `/Health'` matches the route pattern
   * exactly as `/health` in a URL does — it was the evidence behind Radarr's passing
   * health check. A false pass is the direction that raises a score rather than
   * lowering one, which is why it is worth a rule of its own.
   *
   * Imports are good evidence elsewhere and are untouched there; this is the search
   * for a *route*, and a module specifier is never one.
   */
  it('does not read an imported type called Health as a health endpoint', async () => {
    const found = await finding('health-is-a-type-not-a-route', 'observability.health');

    expect(found?.status).toBe('missing');
  });

  it('reads the logging a .NET project declares', async () => {
    const found = await finding('dotnet-logs-with-nlog', 'observability.logging');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value) === 'NLog')).toBe(true);
  });
});
