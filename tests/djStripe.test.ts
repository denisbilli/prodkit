import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function webhook(urls: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-djstripe-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), 'Django==5.2\ndj-stripe==2.8.1\n');
  await fs.mkdir(path.join(root, 'apps/finances'), { recursive: true });
  await fs.writeFile(path.join(root, 'apps/finances/urls.py'), urls);
  const detectors = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return {
    route: detectors['billing.webhook.route']?.present,
    rawBody: detectors['billing.webhook.rawBody']?.present,
    secret: detectors['billing.webhook.secret']?.present,
    signature: detectors['billing.webhook.signatureValidation']?.present,
  };
}

/** apptension's boilerplate mounts dj-stripe's verified webhook endpoint and read as missing. */
describe("dj-stripe's webhook endpoint", () => {
  it('verifies the raw body against the secret', async () => {
    expect(await webhook('from django.urls import include, path\n\nurlpatterns = [\n    path("", include("djstripe.urls", namespace="djstripe")),\n]\n')).toEqual({ route: true, rawBody: true, secret: true, signature: true });
  });

  it('is not dj-stripe installed without its URLs', async () => {
    expect(await webhook('from django.urls import path\n\nurlpatterns = [\n    path("plans/", views.plans),\n]\n')).toEqual({ route: false, rawBody: false, secret: false, signature: false });
  });
});
