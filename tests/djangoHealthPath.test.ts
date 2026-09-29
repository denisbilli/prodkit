import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function health(urls: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-pretalx-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), 'Django==5.2\n');
  await fs.mkdir(path.join(root, 'src/pretalx/agenda'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/pretalx/agenda/urls.py'), urls);
  const found = (await analyzeProject(root)).detectors['observability.core']?.details?.healthEndpoint;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** pretalx serves `path("healthcheck/", ...)` and was told it has no health endpoint. */
describe('A Django health path', () => {
  it('is a health endpoint without its leading slash', async () => {
    expect(await health('from django.urls import path\n\nurlpatterns = [\n    path("healthcheck/", admin.healthcheck, name="healthcheck"),\n]\n')).toBe(true);
  });

  it('is a health endpoint in a regular expression', async () => {
    expect(await health('from django.urls import re_path\n\nurlpatterns = [\n    re_path(r"^health/$", views.health),\n]\n')).toBe(true);
  });

  it('is not the word in a string', async () => {
    expect(await health('from django.urls import path\n\nLABELS = {"status": "health"}\nurlpatterns = [\n    path("talks/", views.talks),\n]\n')).toBe(false);
  });
});
