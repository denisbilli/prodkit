import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const CLIENT = "import { Client } from '@retracedhq/retraced';\n\nconst client = new Client({ endpoint: 'x', apiKey: 'k', projectId: 'p' });\n\n";

async function trail(deps: Record<string, string>, files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-retraced-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0', ...deps } }));
  await fs.mkdir(path.join(root, 'lib'), { recursive: true });
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(root, 'lib', name), text);
  const found = (await analyzeProject(root)).detectors['audit.trail'];
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** boxyhq/saas-starter-kit sends every team and SSO change to Retraced and read as half an audit trail. */
describe('Retraced', () => {
  it('keeps the log its client reports to', async () => {
    const found = await trail({ '@retracedhq/retraced': '0.7.23' }, {
      'retraced.ts': `${CLIENT}export const sendAudit = (event) => client.reportEvent(event);\n`,
    });
    expect(found?.present).toBe(true);
    expect(found?.complete).toBe(true);
  });

  it('is a store with nothing written while nothing reports to it', async () => {
    const found = await trail({ '@retracedhq/retraced': '0.7.23' }, { 'retraced.ts': `${CLIENT}export default client;\n` });
    expect(found?.present).toBe(true);
    expect(found?.complete).toBe(false);
  });

  it('is not written to by some other reportEvent', async () => {
    const found = await trail({ '@retracedhq/retraced': '0.7.23' }, {
      'retraced.ts': `${CLIENT}export default client;\n`,
      'analytics.ts': "import posthog from 'posthog-js';\n\nexport const track = (e) => posthog.reportEvent(e);\n",
    });
    expect(found?.complete).toBe(false);
  });

  it('is nothing without the package', async () => {
    const found = await trail({}, { 'analytics.ts': 'export const track = (bus, e) => bus.reportEvent(e);\n' });
    expect(found?.present).toBe(false);
  });
});
