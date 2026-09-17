import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { searchedFor } from './absenceEvidence';

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

  /**
   * Written out once so the evidence for an absence cannot drift from the search that
   * produced it: these are the same terms the patterns above match.
   */
  const TERMS: Record<string, [what: string, terms: string[]]> = {
    consent: ['a consent record', ['cookie-consent', 'consentGiven', 'privacyConsent', 'gdprConsent']],
    export: ['an export of personal data', ['/gdpr/export', 'exportUserData', 'personalDataExport', 'dataSubject', 'rightToAccess', '"data portability"']],
    erasure: ['an erasure flow', ['erasure', '"delete account"', '"right to be forgotten"', '"delete user data"', '"delete personal data"']],
    retention: ['a retention or purge policy', ['gdpr/privacy near retention/purge/delete', 'retention/purge/delete near personal data', '"delete personal data older than"']],
    adminQueue: ['a data-subject request queue', ['privacy queue', 'gdpr queue', '"data subject request"', 'dsar', 'admin privacy']],
  };

  const evidenceOr = (
    matches: Array<{ snippet: string; file: string; line: number }>,
    key: keyof typeof TERMS,
  ): DetectorEvidence[] => (matches.length > 0 ? toEvidence(matches) : searchedFor(...TERMS[key]));

  return [
    {
      key: 'gdpr.consent.route',
      present: consent.length > 0,
      evidence: evidenceOr(consent, 'consent'),
    },
    {
      key: 'gdpr.export.route',
      present: exportRoute.length > 0,
      evidence: evidenceOr(exportRoute, 'export'),
    },
    {
      key: 'gdpr.erasure.route',
      present: erasure.length > 0,
      evidence: evidenceOr(erasure, 'erasure'),
    },
    {
      key: 'gdpr.retention.job',
      present: retention.length > 0,
      evidence: evidenceOr(retention, 'retention'),
    },
    {
      key: 'gdpr.adminQueue',
      present: adminQueue.length > 0,
      evidence: evidenceOr(adminQueue, 'adminQueue'),
    },
  ];
}
