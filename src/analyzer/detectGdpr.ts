import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

function toEvidence(matches: Array<{ snippet: string; file: string; line: number }>): DetectorEvidence[] {
  return matches.map((m) => ({ type: 'snippet', value: m.snippet, file: m.file, line: m.line }));
}

export async function detectGdpr(ctx: DetectContext): Promise<DetectorResult[]> {
  const consent = await searchInFiles(ctx.root, ctx.files.source, [/consent/i, /cookie[-_ ]?consent/i, /accept[-_ ]?consent/i], 20);
  const exportRoute = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/export user data/i, /dataExport/i, /\/export\b/i, /download.*data/i],
    20
  );
  const erasure = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/erasure/i, /delete account/i, /right to be forgotten/i, /delete.*user/i],
    20
  );
  const retention = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/retention/i, /cleanup/i, /purge/i, /delete older than/i, /cron/i],
    20
  );
  const adminQueue = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/privacy.*queue/i, /gdpr.*queue/i, /data subject request/i, /dsar/i, /admin.*privacy/i],
    20
  );

  return [
    {
      key: 'gdpr.consent.route',
      present: consent.length > 0,
      evidence: toEvidence(consent),
    },
    {
      key: 'gdpr.export.route',
      present: exportRoute.length > 0,
      evidence: toEvidence(exportRoute),
    },
    {
      key: 'gdpr.erasure.route',
      present: erasure.length > 0,
      evidence: toEvidence(erasure),
    },
    {
      key: 'gdpr.retention.job',
      present: retention.length > 0,
      evidence: toEvidence(retention),
    },
    {
      key: 'gdpr.adminQueue',
      present: adminQueue.length > 0,
      evidence: toEvidence(adminQueue),
    },
  ];
}
