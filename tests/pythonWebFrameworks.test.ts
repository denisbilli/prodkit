import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const statusOf = (report: { findings: Array<{ id: string; status: string }> }, id: string) =>
  report.findings.find((finding) => finding.id === id)?.status;

/**
 * Cross-origin handling as the two Python frameworks actually write it.
 *
 * The reading was built around a call expression, `cors(...)`, and then taught Flask.
 * Neither of the other two spells it that way, and both were measured saying the wrong
 * thing on a real repository: netbox installs
 * `corsheaders.middleware.CorsMiddleware` and was told at `high` to add the handling
 * it has, and the full-stack FastAPI template — published by the framework's own
 * organisation — got the same advice above its
 * `app.add_middleware(CORSMiddleware, allow_origins=[...])`.
 *
 * The package name, the middleware class and the setting names are all the anchor, and
 * none of them is a word the author picked.
 */
describe('cross-origin handling in Django and FastAPI', () => {
  it('reads django-cors-headers from the middleware list', async () => {
    const report = buildReport(await analyzeProject(fixture('django-corsheaders')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('passed');
  });

  it('reads Starlette CORSMiddleware with an allowlist', async () => {
    const report = buildReport(await analyzeProject(fixture('fastapi-cors-middleware')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('passed');
  });

  /**
   * The direction that matters: a reading that finds the middleware must still be able
   * to say the policy is open. `allow_origins=["*"]` is the one line this check exists
   * to catch.
   */
  it('still calls a wide-open allowlist what it is', async () => {
    const report = buildReport(await analyzeProject(fixture('fastapi-cors-wide-open')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('partial');
  });
});

/**
 * A configuration written to be thrown away, read as production.
 *
 * netbox keeps `netbox/netbox/configuration_testing.py`, whose first three lines say
 * it is for testing and not intended for production. Its `SECRET_KEY` was the single
 * `critical` in netbox's report — the severity that bars a report from the top band —
 * raised against a line written to be fake. `settings_tests.py` and `test_settings.py`
 * were both already recognised; this is the third spelling of the same thing.
 */
describe('what counts as a test file', () => {
  it('does not raise a critical from a configuration named for testing', async () => {
    const report = buildReport(await analyzeProject(fixture('django-corsheaders')), { profile: 'auto' });

    expect(statusOf(report, 'security.weak-secret')).toBe('passed');
  });

  it('still reads the settings file that is the project own', async () => {
    const analysis = await analyzeProject(fixture('django-corsheaders'));

    expect(analysis.detectors['security.core']?.details?.corsStrict).toBe(true);
  });
});
