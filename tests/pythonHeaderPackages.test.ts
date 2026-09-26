import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function headersFrom(requirements: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-redash-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), requirements);
  await fs.writeFile(path.join(root, 'app.py'), 'from flask import Flask\n\napp = Flask(__name__)\n');
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['security.core']?.details?.helmet;
}

/**
 * redash wraps its Flask app in flask-talisman and was told at `high` to add security
 * headers; `django-csp` was checked against package.json, where no Python package is.
 */
describe('the Python packages that set security headers', () => {
  it('reads flask-talisman', async () => {
    expect(await headersFrom('flask==2.3.2\nflask-talisman==0.7.0\n')).toBe(true);
  });

  it('reads django-csp from a Python manifest', async () => {
    expect(await headersFrom('django==4.2\ndjango-csp==3.8\n')).toBe(true);
  });

  it('reads neither from a project without them', async () => {
    expect(await headersFrom('flask==2.3.2\n')).toBe(false);
  });
});
