import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function secondFactor(require: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-pocket-id-'));
  await fs.writeFile(path.join(root, 'go.mod'), `module example.com/idp\n\ngo 1.23\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n${require})\n`);
  await fs.writeFile(path.join(root, 'main.go'), 'package main\n\nfunc main() {}\n');
  const found = (await analyzeProject(root)).detectors['auth.2fa']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** pocket-id signs every user in with a passkey through go-webauthn and read as having no second factor. */
describe('go-webauthn', () => {
  it('is a second factor', async () => {
    expect(await secondFactor('\tgithub.com/go-webauthn/webauthn v0.18.2\n')).toBe(true);
  });

  it('is not Gin on its own', async () => {
    expect(await secondFactor('')).toBe(false);
  });
});
