import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/** commafeed serves its API through Quarkus 3's `quarkus-rest` and read as having no server. */
describe('Quarkus 3', () => {
  it('serves through quarkus-rest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-commafeed-'));
    await fs.writeFile(
      path.join(root, 'pom.xml'),
      '<project>\n  <dependencies>\n    <dependency>\n      <groupId>io.quarkus</groupId>\n      <artifactId>quarkus-rest</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n',
    );
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.stack.backend).toContain('quarkus');
  });
});
