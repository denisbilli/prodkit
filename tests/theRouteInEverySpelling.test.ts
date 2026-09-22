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
  /**
   * Go names its logging in go.mod, and zerolog builds the entry instead of
   * formatting it. `log.Error().Err(err).Msg("Error updating last used")` is how
   * gotify logs every line of its server, and every shape the detector knew expects
   * the level to take the message. gotify's logging was being read from
   * `console.error` in its React admin instead — the frontend describing a failed
   * delete, offered as how the server records what happened. gotify goes from 61 to
   * 63.
   */
  it('reads a Go project that logs in a chain', async () => {
    const found = await finding('go-logs-in-a-chain', 'observability.logging');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value).includes('.Msg('))).toBe(true);
  });

  /**
   * And the manifest, for the same reason the whole project exists: the receiver of
   * that chain is a name its author invented. `shout := zerolog.New(...)` then
   * `shout.Info().Msg(...)` is the same logging under a name no pattern can guess,
   * and `rs/zerolog` in go.mod is not.
   *
   * The first version of this test did not have that case, and removing the manifest
   * branch changed nothing — the chained shape answered for both. This fixture is
   * what makes the branch mean something.
   */
  it('reads a Go logger bound to a name of its own', async () => {
    const found = await finding('go-logger-under-another-name', 'observability.logging');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value) === 'rs/zerolog')).toBe(true);
  });

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
