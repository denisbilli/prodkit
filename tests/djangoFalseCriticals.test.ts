import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

async function project(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-django-'));

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  return root;
}

const DJANGO = {
  'manage.py': `import django\n`,
  'requirements.txt': 'Django==5.0\n',
  'app/settings.py': `DEBUG = False\nMEDIA_URL = "media/"\nMEDIA_ROOT = "media"\nSECURE_HSTS_SECONDS = 31536000\n`,
  'app/urls.py': `from django.urls import include, path\n\nurlpatterns = [path("accounts/", include("django.contrib.auth.urls"))]\n`,
  'app/views.py': `from django.contrib.auth.decorators import login_required\n\n@login_required\ndef submit_exercise(request):\n    document = request.FILES["document"]\n    return document.name\n`,
};

/** The same project, where the decorated view has nothing to do with files. */
const DJANGO_NO_UPLOADS = {
  ...DJANGO,
  'app/views.py': `from django.contrib.auth.decorators import login_required\n\n@login_required\ndef dashboard(request):\n    return None\n`,
  'app/uploads.py': `from django.urls import path\n\nurlpatterns = [path("upload/", None)]\n`,
};

/**
 * Three findings an independent reviewer checked against the repository and found
 * false, all of them critical. Each is reproduced here from the shape that caused it.
 */
describe('a Django monolith is not an Express app with things missing', () => {
  it('does not call uploads publicly exposed because a setting names a media folder', async () => {
    const root = await project(DJANGO);

    const analysis = await analyzeProject(root);

    // MEDIA_URL and MEDIA_ROOT say where uploaded files live and under which prefix
    // they *would* be served. Django serves them only when a URL pattern says so, and
    // there is none here.
    expect(analysis.detectors['uploads.exposure']?.details?.publicExposure).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('sees a login_required decorator as protection', async () => {
    const root = await project(DJANGO);

    const analysis = await analyzeProject(root);

    // The route scan is Express-shaped and cannot see a decorator or a mixin, so an
    // upload view behind @login_required read as having no protection at all.
    expect(analysis.detectors['uploads.exposure']?.details?.protectedUploads).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not credit the login screen for protecting an upload it never touches', async () => {
    // The detector argues in its own comments that authentication is not evidence
    // about uploads, and then counted every @login_required in the project as upload
    // protection: a photography business was credited for the decorators on its
    // accounting views.
    const root = await project(DJANGO_NO_UPLOADS);

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['uploads.exposure']?.details?.protectedUploads).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not read the stylesheet route as an exposed upload', async () => {
    // `document_root=` on its own matched `static(settings.STATIC_URL, ...)` — CSS and
    // JavaScript, which every Django project serves and nobody uploads.
    const root = await project({
      ...DJANGO,
      'app/urls.py':
        'from django.conf import settings\n' +
        'from django.conf.urls.static import static\n\n' +
        'urlpatterns = []\n' +
        'urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)\n',
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['uploads.exposure']?.details?.publicExposure).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not report a media route that only runs in development', async () => {
    // This is the line Django's own documentation gives, and the documentation wraps
    // it in `if settings.DEBUG:` — which is the point of the snippet. The detector
    // said so in a comment and counted the line anyway.
    const root = await project({
      ...DJANGO,
      'app/urls.py':
        'from django.conf import settings\n' +
        'from django.conf.urls.static import static\n\n' +
        'urlpatterns = []\n\n' +
        'if settings.DEBUG:\n' +
        '    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)\n',
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['uploads.exposure']?.details?.publicExposure).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  /**
   * `static()` without the guard is still the debug helper.
   *
   * These two cases used to assert the opposite: that an unguarded
   * `static(settings.MEDIA_URL, ...)` serves uploads in production. Django's own source
   * says it does not — `django/conf/urls/static.py` returns `[]` when `not settings.DEBUG`,
   * with the comment "No-op if not in debug mode" — and baserow, which appends it
   * unguarded, was reported at `critical` for files nobody can reach. The guard above is
   * the documented idiom; the helper is guarded either way.
   */
  it('does not read the debug-only static() helper as production exposure', async () => {
    const root = await project({
      ...DJANGO,
      'app/urls.py':
        'from django.conf import settings\n' +
        'from django.conf.urls.static import static\n\n' +
        'urlpatterns = []\n' +
        'urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)\n',
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['uploads.exposure']?.details?.publicExposure).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  /** What does serve media in production is the `serve` view mounted on a route. */
  it('does call uploads exposed when a route actually serves the media', async () => {
    const root = await project({
      ...DJANGO,
      'app/urls.py': `from django.conf import settings\nfrom django.urls import re_path\nfrom django.views.static import serve\n\nurlpatterns = [\n    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),\n]\n`,
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['uploads.exposure']?.details?.publicExposure).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not ask a server-rendered monolith for a cross-origin policy', async () => {
    const root = await project(DJANGO);

    const report = buildReport(await analyzeProject(root), { profile: 'b2c-app' });

    // The browser already refuses those requests; the absence is the safe setting.
    // Reporting it as a gap rewards adding middleware that can only loosen what is
    // currently closed.
    const cors = report.findings.filter((finding) => /CORS/i.test(finding.title) && finding.status === 'missing');

    expect(cors).toEqual([]);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('still asks for one where something answers other callers', async () => {
    const root = await project({
      'package.json': '{"name":"api","dependencies":{"express":"^4.18.0"}}',
      'src/routes/users.js': `const express = require('express');\nconst router = express.Router();\nrouter.get('/users', (req, res) => res.json([]));\nmodule.exports = router;\n`,
    });

    const report = buildReport(await analyzeProject(root), { profile: 'b2b-saas' });

    expect(report.findings.some((finding) => /CORS/i.test(finding.title) && finding.status === 'missing')).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('sees password reset that a framework supplies rather than spells out', async () => {
    const root = await project(DJANGO);

    const analysis = await analyzeProject(root);

    // `path("accounts/", include("django.contrib.auth.urls"))` is the whole flow —
    // token, expiry, single use. The words "password" and "reset" appear nowhere,
    // because the framework supplies them, and the report called it missing.
    expect(analysis.detectors['auth.passwordReset']?.present).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('sees authorization checked inside a view', async () => {
    const root = await project({
      ...DJANGO,
      'app/reports.py': `from django.core.exceptions import PermissionDenied

def report(request, user):
    if not request.user.is_staff and request.user.pk != user.pk:
        raise PermissionDenied
    return None
`,
    });

    const analysis = await analyzeProject(root);

    // Django checks ownership in the view, not in middleware before it, so a codebase
    // doing exactly this read as having no resource-level authorization at all.
    expect(analysis.detectors['authz.resourceLevel']?.present).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not announce B2B signals in a report that calls the product consumer', async () => {
    const root = await project(DJANGO);

    const report = buildReport(await analyzeProject(root), { profile: 'auto' });
    const tenancy = report.findings.find((finding) => finding.id === 'tenancy.b2b');

    // The document said "consumer application" in one place and "B2B/SaaS signals
    // detected" in another. A reader cannot act on a report that contradicts itself.
    expect(tenancy?.status).toBe('unknown');

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not say Helmet was detected in a project that is not Express', async () => {
    const root = await project(DJANGO);

    const report = buildReport(await analyzeProject(root), { profile: 'auto' });
    const helmet = report.findings.find((finding) => finding.id === 'security.helmet');

    expect(helmet?.description).not.toMatch(/Helmet detected/);
    expect(helmet?.description).toMatch(/django/i);

    await fs.rm(root, { recursive: true, force: true });
  });
});
