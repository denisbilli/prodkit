import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { evidenceOrFileNameSearch } from './absenceEvidence';

export async function detectDocker(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const dockerfile = ctx.files.all.find((f) => /(^|\/)Dockerfile$/.test(f));
  const composeFile = ctx.files.all.find((f) => /(^|\/)(docker-compose\.ya?ml|compose\.ya?ml)$/.test(f));

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
