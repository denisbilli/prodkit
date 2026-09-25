import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function project(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-roles-'));

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  return root;
}

const DJANGO = {
  'requirements.txt': 'django==5.2\ndjangorestframework==3.15\n',
  'manage.py': 'from django.core.management import execute_from_command_line\n',
  'app/settings.py': 'INSTALLED_APPS = ["django.contrib.auth", "rest_framework"]\n',
  'app/urls.py': 'urlpatterns = []\n',
};

const roles = async (views: string) => {
  const root = await project({ ...DJANGO, 'app/views.py': views });
  const present = (await analyzeProject(root)).detectors['authz.roles']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return present;
};

/**
 * Django's own roles, which every pattern in the role search missed: they were camelCase
 * or spelled `user.role`. zulip turns callers away with `if not request.user.is_staff:`
 * and was told at `high` that it checks no roles.
 */
describe('Django says who may with its own flags', () => {
  it('reads a check of request.user.is_staff', async () => {
    expect(await roles('def stats(request):\n    if not request.user.is_staff:\n        raise PermissionDenied\n    return render(request, "stats.html")\n')).toBe(true);
  });

  it('reads the admin gate', async () => {
    expect(await roles('from django.contrib.admin.views.decorators import staff_member_required\n\n@staff_member_required\ndef audit(request):\n    return render(request, "audit.html")\n')).toBe(true);
  });

  it('reads DRF\'s admin permission class', async () => {
    expect(await roles('from rest_framework.permissions import IsAdminUser\n\nclass Reports(APIView):\n    permission_classes = [IsAdminUser]\n')).toBe(true);
  });

  it('finds nothing where nothing is checked', async () => {
    expect(await roles('def home(request):\n    return render(request, "home.html")\n')).toBe(false);
  });
});

/**
 * The role search over Python never ran at all: the TypeScript tree replaced it for every
 * repository, including the files it cannot parse. dispatch compares
 * `self.role == UserRoles.owner` and has a Vue front end beside it.
 */
describe('a role compared in Python beside a TypeScript front end', () => {
  const polyglot = async (python: string) => {
    const root = await project({
      'pyproject.toml': '[project]\nname = "incidents"\ndependencies = ["fastapi"]\n',
      'src/app/permissions.py': python,
      'web/src/main.ts': 'export const mount = (id: string) => document.getElementById(id);\n',
    });
    const present = (await analyzeProject(root)).detectors['authz.roles']?.present;
    await fs.rm(root, { recursive: true, force: true });
    return present;
  };

  it('reads it', async () => {
    expect(await polyglot('class OwnerPermission:\n    def has_required_permissions(self):\n        return self.role == UserRoles.owner\n')).toBe(true);
  });

  it('does not read the role of a chat turn', async () => {
    expect(await polyglot('def last_reply(messages):\n    return [m for m in messages if m.role == "assistant"][-1]\n')).toBe(false);
  });
});

