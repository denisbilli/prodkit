import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The container the editor opens is not the container the product ships in.
 *
 * `.devcontainer/` is the Development Containers convention — VS Code, Codespaces and
 * anything else implementing containers.dev read it to build the environment a
 * *contributor* works in. n8n has one, and it sorted ahead of
 * `docker/images/n8n/Dockerfile`, so the report answered "how does this ship" with the
 * development environment: the wrong file cited, and the HEALTHCHECK question asked of
 * a Dockerfile that has no reason to answer it.
 *
 * The first match in path order decided before, which is no decision at all.
 */
describe('the container it ships in', () => {
  it('reads the shipped image rather than the devcontainer', async () => {
    const report = buildReport(await analyzeProject(fixture('devcontainer-beside-a-shipped-image')), { profile: 'auto' });
    const docker = report.findings.find((f) => f.id === 'docker.presence');

    expect(docker?.status).toBe('passed');
    expect(docker?.evidence.some((e) => e.value === 'docker/Dockerfile')).toBe(true);
  });

  /**
   * And the detector next door believed the same thing for one release longer. 1.9.0
   * taught `docker.presence` the convention and left `deployment.readiness` citing
   * `.devcontainer/Dockerfile` as the answer to "how does this ship" — atuin's report
   * opened with exactly that, in the same run where the other detector got it right.
   */
  it('does not answer how a project ships with how it is developed', async () => {
    const report = buildReport(await analyzeProject(fixture('devcontainer-is-not-a-deployment')), { profile: 'auto' });
    const deployment = report.findings.find((f) => f.id === 'deployment.readiness');

    expect(deployment?.evidence.some((e) => String(e.value).includes('.devcontainer/'))).toBe(false);
    expect(deployment?.evidence.some((e) => String(e.value).includes('.github/workflows/'))).toBe(true);
  });
});
