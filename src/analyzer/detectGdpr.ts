import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { searchedFor } from './absenceEvidence';
import { fileNameEvidence, searchFileNames } from './fileNames';

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
  /**
   * The same duty, in the words each ecosystem actually uses.
   *
   * The list was written in one dialect. Article 20 is `exportUserData` in a Node
   * application and `UserExport` in a Rails one; article 17 is `deleteAccount` here
   * and `UserAnonymizer` there. Discourse ships both and was told it had neither,
   * at `high` — which is the severity a reader acts on.
   */
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
      /user[_-]?export/i,
      /export[_-]?(user|account|profile)\b/i,
      /download (your|my) data/i,
    ],
    20
  );
  const exportFiles = searchFileNames(ctx.files.source, [
    /user[_-]?export/i,
    /(data|account|profile)[_-]?export/i,
    /export[_-]?(user|account|personal)/i,
  ]);
  const erasure = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /erasure/i,
      /delete account/i,
      /right to be forgotten/i,
      /delete user data/i,
      /delete personal data/i,
      /**
       * Anonymisation, which is how a forum satisfies article 17 without losing the
       * thread. Discourse's is `UserAnonymizer` and it was told it had no erasure.
       */
      /anonymi[sz]e[_-]?(user|account)/i,
      /user[_-]?anonymi[sz]/i,
      /**
       * The regulation's own name, next to the act.
       *
       * `deleteUser(id)` was measured and withdrawn because delete is every admin
       * screen ever written. GDPR is not an ordinary word: an identifier that carries
       * it beside a deletion is somebody naming the article they are answering. forem
       * runs its erasure through `Users::DeleteWorker` and records a
       * `GDPRDeleteRequest`, and was told at `high` that it has no erasure flow.
       *
       * The pattern was already in this file, one capability down — the retention
       * needle reads `(gdpr|privacy).*(retention|purge|delete)`, so the line was being
       * found and filed under the wrong question.
       */
      /gdpr[_\- ]?(delete|deletion|eras|removal|forget)/i,
      /(delete|deletion|eras|removal)[_\- ]?gdpr/i,
      /**
       * A DELETE on the caller's own account, which is what article 17 asks for.
       *
       * The note below records that `deleteUser(id)` was measured and withdrawn —
       * delete is every admin screen ever written. A route is not that call. atuin's
       * server declares `.route("/account", delete(handlers::user::delete))` and was
       * told it has no erasure flow at all; the difference between that and an admin
       * screen is in the path, which says whose account is being removed.
       *
       * `DELETE` is HTTP's word and `/account`, `/users/me` and `/me` are the
       * conventional first-person paths. `/accounts/:id` does not match: the boundary
       * after `account` fails on the plural, which is the admin case this must keep
       * out.
       */
      /\bdelete\s*[(:]\s*["'`]\/?(?:account\b|users?\/me\b|me\b)/i,
      /@Delete\(\s*["'`]\/?(?:account\b|users?\/me\b|me\b)/i,
      /\.route\(\s*["'`]\/?(?:account\b|users?\/me\b|me\b)[^)]*,\s*delete\(/i,
    ],
    20
  );
  /**
   * `deleteUser(id)` is not article 17 — it is every admin screen ever written, and
   * as a line it matched a teaching exercise about `git log -S "deleteUser"` and a
   * function that removes a cloud provider account. A file *named* for deleting
   * accounts is a different thing: somebody built a feature and called it that.
   */
  const erasureFiles = searchFileNames(ctx.files.source, [
    /user[_-]?anonymi[sz]/i,
    /anonymi[sz]er/i,
    /(account|user)[_-]?deletion/i,
    /(delete|erase)[_-]?(account|my[_-]?data)/i,
  ]);
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
      present: exportRoute.length > 0 || exportFiles.length > 0,
      evidence:
        exportRoute.length > 0 || exportFiles.length > 0
          ? [...toEvidence(exportRoute), ...fileNameEvidence(exportFiles)]
          : evidenceOr(exportRoute, 'export'),
    },
    {
      key: 'gdpr.erasure.route',
      present: erasure.length > 0 || erasureFiles.length > 0,
      evidence:
        erasure.length > 0 || erasureFiles.length > 0
          ? [...toEvidence(erasure), ...fileNameEvidence(erasureFiles)]
          : evidenceOr(erasure, 'erasure'),
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
