import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function docker(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-invoiceshelf-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"laravel/framework":"^11.0"}}\n');
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors['infra.docker'];
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** InvoiceShelf keeps docker/development and docker/production side by side, and the development one was cited. */
describe('A development directory', () => {
  it('loses to the production one beside it', async () => {
    const found = await docker({
      'docker/development/Dockerfile': 'FROM php:8.3-fpm\n',
      'docker/production/Dockerfile': 'FROM php:8.3-fpm\nHEALTHCHECK CMD curl -f http://localhost/ || exit 1\n',
    });
    expect(found?.complete).toBe(true);
    expect(found?.evidence.some((e) => e.value === 'docker/production/Dockerfile')).toBe(true);
  });

  it('is still cited when it is all there is', async () => {
    const found = await docker({ 'docker/development/Dockerfile': 'FROM php:8.3-fpm\n' });
    expect(found?.present).toBe(true);
  });
});

/** InvoiceShelf's SQLite compose offers a healthcheck in a comment. */
describe('A commented healthcheck', () => {
  it('checks nothing', async () => {
    const found = await docker({ 'docker-compose.yml': 'services:\n  scheduler:\n    image: invoiceshelf\n    command: ["healthcheck-schedule"]\n    #   healthcheck: {test: ["CMD", "healthcheck-schedule"]}\n' });
    expect(found?.complete).toBe(false);
  });

  it('is still one when it is not commented', async () => {
    const found = await docker({ 'docker-compose.yml': '# Production stack\nservices:\n  app:\n    image: invoiceshelf\n    healthcheck:\n      test: ["CMD", "curl", "-f", "http://localhost"]\n' });
    expect(found?.complete).toBe(true);
  });
});

/** PeerTube's Gitpod workspace image sat beside its production one and was cited instead. */
describe("Gitpod's workspace image", () => {
  const images = {
    'support/docker/gitpod/Dockerfile': 'FROM gitpod/workspace-postgres\n',
    'support/docker/production/Dockerfile': 'FROM node:20\nHEALTHCHECK CMD curl -f http://localhost:9000 || exit 1\n',
  };

  it('is not the image that ships', async () => {
    const found = await docker({ ...images, '.gitpod.yml': 'image:\n  file: support/docker/gitpod/Dockerfile\nports:\n- port: 3000\n' });
    expect(found?.complete).toBe(true);
  });

  it('is only the one .gitpod.yml names', async () => {
    const found = await docker({ ...images, '.gitpod.yml': 'image:\n  file: support/docker/other/Dockerfile\n' });
    expect(found?.complete).toBe(false);
  });
});
