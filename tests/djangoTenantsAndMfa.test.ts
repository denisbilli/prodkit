import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function detectors(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-tandoor-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), 'Django==5.2\ndjango-scopes==2.1.0\ndjango-allauth[mfa,socialaccount]==65.18.0\n');
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

const model = (imports: string) => `from django.db import models\n${imports}\n\nclass Recipe(models.Model):\n    name = models.CharField(max_length=128)\n    space = models.ForeignKey('Space', on_delete=models.CASCADE)\n    objects = ScopedManager(space='space')\n`;

/** Tandoor scopes every model to a Space through django-scopes and read as a consumer app. */
describe("django-scopes' ScopedManager", () => {
  it('is a tenant, and its isolation', async () => {
    const found = await detectors({ 'cookbook/models.py': model('from django_scopes import ScopedManager') });
    expect(found['tenancy.organization']?.present).toBe(true);
    expect(found['tenancy.membership']?.present).toBe(true);
  });

  it('is not its own wrapper being defined', async () => {
    const found = await detectors({ 'common/managers.py': 'import django_scopes\n\n\ndef ScopedManager(_manager_class=models.Manager, **scopes):\n    return django_scopes.ScopedManager(_manager_class=_manager_class, **scopes)\n' });
    expect(found['tenancy.organization']?.present).toBe(false);
  });

  it('is nothing where django-scopes is not the one imported', async () => {
    const found = await detectors({ 'cookbook/models.py': model('from .managers import ScopedManager') });
    expect(found['tenancy.organization']?.present).toBe(false);
  });
});

/** Tandoor switches on allauth's MFA in INSTALLED_APPS and read as having no second factor. */
describe("allauth's MFA app", () => {
  it('is a second factor where it is installed', async () => {
    const found = await detectors({ 'recipes/settings.py': "INSTALLED_APPS = [\n    'allauth',\n    'allauth.account',\n    'allauth.mfa',\n]\n" });
    expect(found['auth.2fa']?.present).toBe(true);
    expect(found['auth.2fa']?.evidence.some((e) => e.file === 'recipes/settings.py')).toBe(true);
  });

  it('is not allauth on its own', async () => {
    const found = await detectors({ 'recipes/settings.py': "INSTALLED_APPS = [\n    'allauth',\n    'allauth.account',\n]\n" });
    expect(found['auth.2fa']?.present).toBe(false);
  });
});
