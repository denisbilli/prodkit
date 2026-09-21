import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const statusOf = (report: { findings: Array<{ id: string; status: string }>; passedChecks: Array<{ id: string; status: string }> }, id: string) =>
  [...report.findings, ...report.passedChecks].find((f) => f.id === id)?.status;

/**
 * `manage.py`, `wsgi.py` and `asgi.py` each set `DJANGO_SETTINGS_MODULE`, and that is
 * the framework saying which configuration is the project's.
 *
 * pretix keeps `SECRET_KEY = "build-time-secret-key"` in
 * `src/pretix/_build_settings.py`, a module named only by its packaging script, while
 * `manage.py` and `wsgi.py` both name `pretix.settings`. That literal was the single
 * `critical` in pretix's report — the severity that bars a report from the top band —
 * raised against a line that never serves a request.
 *
 * A name rule could not do this. `configuration_testing.py` was caught by one in
 * 0.80.0; `_build_settings.py` would need "build" to mean something, which it does
 * not. The entry point is a fact rather than a word.
 */
describe('the settings module the application runs', () => {
  it('does not raise a critical from a build-time configuration', async () => {
    const report = buildReport(await analyzeProject(fixture('django-build-settings')), { profile: 'auto' });

    expect(statusOf(report, 'security.weak-secret')).toBe('passed');
  });

  /**
   * The half that matters more, and the one the corpus caught within a minute of the
   * first version: a settings *package* is loaded whole. `config.settings.production`
   * begins with `from .base import *`, so a weak secret in `base.py` is in the
   * running configuration, and excusing it would be the dangerous direction.
   */
  it('still finds a weak secret in the base module of a split configuration', async () => {
    const report = buildReport(await analyzeProject(fixture('django-split-settings')), { profile: 'auto' });

    expect(statusOf(report, 'security.weak-secret')).toBe('missing');
  });

  it('still finds one in the settings module that is named', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'auto' });

    expect(statusOf(report, 'security.weak-secret')).toBe('missing');
  });
});
