import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectDeployment(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const keyFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'Procfile', 'nginx.conf'];
  const presentFiles = ctx.files.all.filter((f) => keyFiles.some((k) => f.endsWith(k)) || f.startsWith('.github/workflows/'));
  for (const f of presentFiles) evidence.push({ type: 'file', value: f });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/SIGTERM/i, /SIGINT/i, /NODE_ENV/i, /DEBUG\s*=\s*False/, /healthcheck/i],
    20
  );
  for (const m of hits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const graceful = hits.some((h) => /SIGTERM|SIGINT/i.test(h.snippet));
  const prodAware = hits.some((h) => /NODE_ENV|DEBUG\s*=\s*False/.test(h.snippet));

  return {
    key: 'deployment.readiness',
    present: presentFiles.length > 0 || hits.length > 0,
    complete: prodAware,
    evidence,
    details: {
      dockerArtifacts: presentFiles.some((f) => /Dockerfile|compose/.test(f)),
      ci: presentFiles.some((f) => f.startsWith('.github/workflows/')),
      gracefulShutdown: graceful,
      productionAware: prodAware,
    },
  };
}
