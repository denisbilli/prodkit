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
  'app/views.py': `from django.contrib.auth.decorators import login_required\n\n@login_required\ndef submit_exercise(request):\n    return None\n`,
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

  it('does call uploads exposed when a route actually serves the media', async () => {
    const root = await project({
      ...DJANGO,
      'app/urls.py': `from django.conf import settings\nfrom django.conf.urls.static import static\n\nurlpatterns = static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)\n`,
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
});
