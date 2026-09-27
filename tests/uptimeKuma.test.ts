import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(deps: Record<string, string>, files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-uptime-kuma-'));
  for (const [name, content] of Object.entries({ 'package.json': JSON.stringify({ name: 'uptime-kuma', dependencies: { express: '^4.21.0', ...deps } }), 'server/server.js': 'const express = require("express");\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

const DOCKERFILE = 'FROM node:20\nEXPOSE 3001\n';

/**
 * uptime-kuma throttles login with `limiter` and builds from `docker/dockerfile`, and was
 * told it has neither a rate limit nor its own container definition.
 */
describe('uptime-kuma', () => {
  it('rate limits with limiter', async () => {
    const analysis = await analyze({ limiter: '~2.1.0' }, {});

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  it('builds from a lower-case dockerfile', async () => {
    const analysis = await analyze({}, { 'docker/dockerfile': DOCKERFILE });

    expect(analysis.detectors['infra.docker']?.details?.dockerfile).toBe(true);
  });

  it('builds from a name.dockerfile', async () => {
    const analysis = await analyze({}, { 'docker/debian-base.dockerfile': DOCKERFILE });

    expect(analysis.detectors['infra.docker']?.details?.dockerfile).toBe(true);
  });
});
