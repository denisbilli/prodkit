import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const securityDetails = async (name: string) => {
  const analysis = await analyzeProject(fixture(name));
  return { analysis, details: analysis.detectors['security.core']?.details ?? {} };
};

const evidenceFor = async (name: string, claim: string) => {
  const analysis = await analyzeProject(fixture(name));
  return (analysis.detectors['security.core']?.evidence ?? []).filter((e) => e.claim === claim);
};

/**
 * Every finding points at a line somebody can open and argue with.
 *
 * Three claims were breaking that promise in the same detector: the cross-origin
 * claim cited line 1 with the words "explicit origin handling", and the two Django
 * claims cited a file with no line at all and a reconstruction of what they expected
 * the line to say.
 */
describe('a security claim cites a line, not a conclusion', () => {
  it('cites the line that allows every origin, and the line that does not', async () => {
    const cors = await evidenceFor('cors-per-line', 'cors');
    const lines = cors.map((e) => e.line);

    expect(cors.length).toBeGreaterThan(0);
    expect(lines).not.toContain(1);
    for (const item of cors) {
      expect(item.value).not.toBe('explicit origin handling');
      expect(item.line).toBeGreaterThan(1);
    }
  });

  it('reads one permissive route as permissive without condemning the allowlist beside it', async () => {
    // The file was the unit of judgement, so a wildcard anywhere in it made an
    // explicit allowlist read as wide open — and the reverse.
    const { details } = await securityDetails('cors-per-line');

    expect(details.corsLoose).toBe(true);
    expect(details.corsStrict).toBe(true);
  });

  it('lets the permissive route decide, not the allowlist beside it', async () => {
    const analysis = await analyzeProject(fixture('cors-per-line'));
    const report = buildReport(analysis, { profile: 'observed-only' });
    const cors = report.findings.find((f) => f.id === 'security.cors-origin');

    expect(cors?.status).toBe('partial');
    expect(cors?.description).toMatch(/allows any origin/i);
  });

  it('does not count a wildcard that somebody commented out', async () => {
    const cors = await evidenceFor('cors-per-line', 'cors');

    expect(cors.some((e) => e.value.startsWith('//'))).toBe(false);
  });

  it('does not cite a route somebody commented out, or advice about cors()', async () => {
    // The middleware walk read lines itself, so it got none of the rules the file
    // search applies. Pointed at this repository it cited its own prose and the
    // sentence in its remediation catalogue that recommends an allowlist.
    const { details } = await securityDetails('cors-mentioned-not-used');

    expect(details.corsLoose).toBe(false);
    expect(details.corsStrict).toBe(false);
  });

  it('sees a Flask application that opens itself to every origin', async () => {
    // `CORS(app)` allows everything and the pattern was case-sensitive, so the one
    // configuration this check exists to find was the one it could not see.
    const { details } = await securityDetails('flask-cors-wide-open');
    const cors = await evidenceFor('flask-cors-wide-open', 'cors');

    expect(details.corsLoose).toBe(true);
    expect(cors[0].value).toContain('CORS(app)');
    expect(cors[0].line).toBeGreaterThan(1);
  });

  it('quotes the DEBUG line as written, at the line it is written on', async () => {
    const debug = await evidenceFor('django-basic', 'django-debug');

    expect(debug).toHaveLength(1);
    expect(debug[0].line).toBeGreaterThan(0);
    expect(debug[0].file).toMatch(/settings\.py$/);
  });
});

/**
 * A file named settings.py is not Django's configuration.
 *
 * A FastAPI router that lets an administrator change options from the browser was
 * read as Django's settings, and the project was credited with security middleware it
 * does not have — the direction of error that matters, because it hides a missing
 * control rather than inventing a present one.
 */
describe('Django is identified by Django, not by a filename', () => {
  it('does not read a FastAPI settings router as Django configuration', async () => {
    const { analysis, details } = await securityDetails('fastapi-settings-router');
    const report = buildReport(analysis, { profile: 'observed-only' });

    expect(details.djangoDebugTrue).toBe(false);
    expect(details.djangoSecureCookies).toBe(true);
    expect(report.findings.find((f) => f.id === 'security.django-debug')?.status).toBe('unknown');
  });

  it('gives a project no security credit for owning a file called settings.py', async () => {
    const { analysis } = await securityDetails('fastapi-settings-router');

    expect(analysis.detectors['security.core']?.present).toBe(false);
  });

  it('does not let being Django stand in for the controls Django does not ship', async () => {
    // `present` and `complete` counted a settings.py as a substitute for rate
    // limiting, so a bare Django project reported some security posture while having
    // none. Django ships no rate limiter; the file was never evidence of one.
    const { analysis } = await securityDetails('django-basic');
    const core = analysis.detectors['security.core'];

    expect(core?.details.helmet).toBe(false);
    expect(core?.details.rateLimit).toBe(false);
    expect(core?.present).toBe(false);
  });

  it('finds the settings a split-settings project actually runs', async () => {
    // config/settings/production.py ends with neither "settings.py" nor anything the
    // old lookup recognised, so a whole shape of Django project was invisible.
    const { details } = await securityDetails('django-split-settings');

    expect(details.djangoDebugTrue).toBe(true);
    expect(details.djangoSecureCookies).toBe(false);
  });
});

/**
 * A measurement that never varies is not one.
 *
 * Upload type validation was `/mime/i` and `/content-type/i`, so every JSON response
 * header in every project answered it: all six repositories in the corpus that handle
 * uploads came back validated, two of them on the strength of a header on a 404. The
 * flag decides whether upload protection reads `present` or `partial`.
 */
describe('upload validation means the uploaded file', () => {
  it('is not answered by the Content-Type of a JSON response', async () => {
    const analysis = await analyzeProject(fixture('uploads-json-headers-only'));

    expect(analysis.detectors['uploads.exposure']?.details.validation).toBe(false);
  });

  it('is answered by the filter that rejects the wrong kind of file', async () => {
    const analysis = await analyzeProject(fixture('uploads-filtered'));
    const evidence = (analysis.detectors['uploads.exposure']?.evidence ?? []).filter((e) => e.claim === 'validation');

    expect(analysis.detectors['uploads.exposure']?.details.validation).toBe(true);
    expect(evidence.some((e) => e.value.includes('fileFilter'))).toBe(true);
    expect(evidence.some((e) => e.value.includes('application/json'))).toBe(false);
  });
});
