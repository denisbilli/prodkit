import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function notifications(requirements: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-tubearchivist-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), requirements);
  await fs.mkdir(path.join(root, 'task/src'), { recursive: true });
  await fs.writeFile(path.join(root, 'task/src/notify.py'), 'import apprise\n\ndef send(urls, title, body):\n    notifier = apprise.Apprise()\n    notifier.add(urls)\n    notifier.notify(title=title, body=body)\n');
  const found = (await analyzeProject(root)).detectors['notifications.transactional'];
  await fs.rm(root, { recursive: true, force: true });
  return found?.details?.pushDependency;
}

/** Tube Archivist tells people when their downloads finish through apprise. */
describe('apprise', () => {
  it('is a way to reach a user', async () => {
    expect(await notifications('Django==5.2\napprise==1.12.0\n')).toBe(true);
  });

  it('is not Django on its own', async () => {
    expect(await notifications('Django==5.2\n')).toBe(false);
  });
});
