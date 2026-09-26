import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function dockerFrom(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-flaskbb-'));
  for (const [name, content] of Object.entries({ 'pyproject.toml': '[project]\nname = "forum"\ndependencies = ["flask>=3.0", "Flask-Mail>=0.10.0"]\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

const DOCKERFILE = 'FROM python:3.12-slim\nEXPOSE 8000\nHEALTHCHECK CMD python healthcheck.py\n';

/**
 * flaskbb ships `docker/Dockerfile.release` and `docker/compose.release.yaml` beside `.dev`
 * twins and was told it has no container definition; it sends its mail through Flask-Mail
 * and was told it can send none.
 */
describe('flaskbb', () => {
  it('ships in a suffixed Dockerfile', async () => {
    const analysis = await dockerFrom({ 'docker/Dockerfile.release': DOCKERFILE });

    expect(analysis.detectors['infra.docker']?.details?.dockerfile).toBe(true);
  });

  it('is composed from a suffixed compose file', async () => {
    const analysis = await dockerFrom({ 'docker/compose.release.yaml': 'services:\n  web:\n    image: forum\n' });

    expect(analysis.detectors['infra.docker']?.details?.compose).toBe(true);
  });

  it('cites the release file over its development twin', async () => {
    const analysis = await dockerFrom({ 'docker/Dockerfile.dev': DOCKERFILE, 'docker/Dockerfile.release': DOCKERFILE });

    expect(analysis.detectors['infra.docker']?.evidence[0]?.value).toBe('docker/Dockerfile.release');
  });

  it('prefers the plain name where there is one', async () => {
    const analysis = await dockerFrom({ 'deploy/app/Dockerfile': DOCKERFILE, 'Dockerfile.release': DOCKERFILE });

    expect(analysis.detectors['infra.docker']?.evidence[0]?.value).toBe('deploy/app/Dockerfile');
  });

  it('sends mail through Flask-Mail', async () => {
    const analysis = await dockerFrom({});

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });
});
