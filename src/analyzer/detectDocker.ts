import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { evidenceOrFileNameSearch } from './absenceEvidence';

/**
 * The container the editor opens is not the container the product ships in.
 *
 * `.devcontainer/` is the Development Containers convention — VS Code, Codespaces and
 * anything else that implements containers.dev read it to build the environment a
 * *contributor* works in. n8n has one, and it sorted ahead of
 * `docker/images/n8n/Dockerfile`, so the report answered "how does this ship" with the
 * development environment: the wrong file cited, and the HEALTHCHECK question asked of
 * a Dockerfile that has no reason to answer it.
 *
 * The first match in path order decided before, which is no decision at all. The
 * shallowest of the real ones is the project's own, the same tie-break the package
 * manager uses.
 *
 * A repository whose only container definition is its devcontainer keeps it rather
 * than losing the answer: nothing that used to resolve stops resolving.
 */
const DEVELOPMENT_CONTAINER = /(^|\/)\.devcontainer\//;

function theShippedOne(candidates: string[]): string | undefined {
  const shipped = candidates.filter((file) => !DEVELOPMENT_CONTAINER.test(file));
  const pool = shipped.length > 0 ? shipped : candidates;

  return pool.reduce<string | undefined>(
    (best, file) => (best === undefined || file.split('/').length < best.split('/').length ? file : best),
    undefined,
  );
}

export async function detectDocker(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const dockerfile = theShippedOne(ctx.files.all.filter((f) => /(^|\/)Dockerfile$/.test(f)));
  const composeFile = theShippedOne(ctx.files.all.filter((f) => /(^|\/)(docker-compose\.ya?ml|compose\.ya?ml)$/.test(f)));

  let hasHealthcheck = false;
  let hasExpose = false;
  let services: string[] = [];

  if (dockerfile) {
    evidence.push({ type: 'file', value: dockerfile });
    const text = (await readTextFileSafe(ctx.root, dockerfile)) ?? '';
    if (/^HEALTHCHECK\s+/im.test(text)) {
      hasHealthcheck = true;
      evidence.push({ type: 'snippet', value: 'HEALTHCHECK found', file: dockerfile });
    }
    if (/^EXPOSE\s+/im.test(text)) {
      hasExpose = true;
      evidence.push({ type: 'snippet', value: 'EXPOSE found', file: dockerfile });
    }
  }

  if (composeFile) {
    evidence.push({ type: 'file', value: composeFile });
    const text = (await readTextFileSafe(ctx.root, composeFile)) ?? '';
    if (/healthcheck\s*:/i.test(text)) {
      hasHealthcheck = true;
      evidence.push({ type: 'snippet', value: 'healthcheck block in compose', file: composeFile });
    }
    const lower = text.toLowerCase();
    services = ['postgres', 'redis', 'nginx'].filter((s) => lower.includes(s));
    for (const s of services) evidence.push({ type: 'snippet', value: `${s} service in compose`, file: composeFile });
  }

  return {
    key: 'infra.docker',
    present: Boolean(dockerfile || composeFile),
    complete: hasHealthcheck,
    evidence: evidenceOrFileNameSearch(evidence, 'a container definition', ['Dockerfile', 'Containerfile', 'docker-compose.yml', 'compose.yaml']),
    details: { dockerfile: Boolean(dockerfile), compose: Boolean(composeFile), hasHealthcheck, hasExpose, services },
  };
}
