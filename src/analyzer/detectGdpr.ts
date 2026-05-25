import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

function toEvidence(matches: Array<{ snippet: string; file: string; line: number }>): DetectorEvidence[] {
  return matches.map((m) => ({ type: 'snippet', value: m.snippet, file: m.file, line: m.line }));
}

export async function detectGdpr(ctx: DetectContext): Promise<DetectorResult[]> {
  const consent = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/cookie[-_ ]?consent/i, /consentGiven/i, /privacyConsent/i, /gdprConsent/i],
    20
  );
  const exportRoute = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /\/gdpr\/export\b/i,
      /exportUserData/i,
      /personalDataExport/i,
      /dataSubject/i,
      /rightToAccess/i,
      /data portability/i,
      /export personal data/i,
    ],
    20
  );
  const erasure = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/erasure/i, /delete account/i, /right to be forgotten/i, /delete user data/i, /delete personal data/i],
    20
  );
  const retention = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /(gdpr|privacy).*(retention|purge|delete)/i,
      /(retention|purge|delete).*(personal data|user data|data subject)/i,
      /delete personal data older than/i,
    ],
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
