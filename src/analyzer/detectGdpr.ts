import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import type { TextMatch } from '../utils/textSearch';
import { searchInFiles } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { searchedFor } from './absenceEvidence';
import { fileNameEvidence, searchFileNames } from './fileNames';

function toEvidence(matches: Array<{ snippet: string; file: string; line: number }>): DetectorEvidence[] {
  return matches.map((m) => ({ type: 'snippet', value: m.snippet, file: m.file, line: m.line }));
}

/**
 * The request's own user, deleted.
 *
 * `healthchecks/healthchecks` lets anyone close their account at `accounts/close/`: the
 * view reads `user = request.user`, cancels the subscription and calls `user.delete()`.
 * Nothing in it says erasure, delete account or GDPR — the view is called `close` — and it
 * was reported as having no erasure flow.
 *
 * Whose account is the whole question, and the framework answers it. `request.user` is
 * Django's name for the caller, `current_user` Devise's, `$request->user()` and
 * `Auth::user()` Laravel's. Deleting that object is deleting yourself; `User.objects.get(
 * pk=id).delete()` on an admin screen is not it, and is not matched. The binding is
 * followed a short way, because a view that does more than one thing to the caller names
 * it first.
 */
const CALLER = String.raw`(?:request\.user|current_user|\$request->user\(\)|Auth::user\(\)|auth\(\)->user\(\))`;
const CALLER_DELETED = new RegExp(String.raw`${CALLER}\s*(?:\.delete\(\)|\.destroy!?\b|->delete\(\))`);
const CALLER_BOUND = new RegExp(String.raw`^\s*(\$?\w+)\s*=\s*${CALLER}\s*;?\s*$`);
/** Far enough to cover one view, not so far it reaches the next. */
const WITHIN_ONE_VIEW = 30;

async function deletesTheCaller(ctx: DetectContext): Promise<TextMatch[]> {
  const found: TextMatch[] = [];
  for (const file of ctx.files.source) {
    if (!/\.(py|rb|php)$/.test(file)) continue;
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !/request\.user|current_user|->user\(\)|Auth::user/.test(text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && found.length < 5; i++) {
      if (CALLER_DELETED.test(lines[i])) {
        found.push({ file, line: i + 1, snippet: lines[i].trim().slice(0, 200) });
        continue;
      }
      const bound = CALLER_BOUND.exec(lines[i]);
      if (!bound) continue;
      const name = bound[1].replace(/[$]/g, '\\$');
      const deleted = new RegExp(String.raw`(?:^|[^\w$])${name}\s*(?:\.delete\(\)|\.destroy!?\b|->delete\(\))`);
      for (let j = i + 1; j < Math.min(lines.length, i + WITHIN_ONE_VIEW); j++) {
        if (/^\s*(?:def|function|public function|private function)\b/.test(lines[j])) break;
        if (!deleted.test(lines[j])) continue;
        found.push({ file, line: j + 1, snippet: lines[j].trim().slice(0, 200) });
        break;
      }
    }
    if (found.length >= 5) break;
  }
  return found;
}

export async function detectGdpr(ctx: DetectContext): Promise<DetectorResult[]> {
  /**
   * The consent vendors, who name themselves.
   *
   * `cookie-consent`, `consentGiven` and `gdprConsent` are four spellings of one
   * English word, and a site whose banner says `consensoCookie` has none of them —
   * the same failure the password reset had, in a capability where the whole audience
   * is European and half of it does not write in English.
   *
   * What the audience does have is a vendor. Iubenda, Cookiebot, OneTrust,
   * Usercentrics, CookieHub and Klaro all publish a banner you embed, and most sites
   * embed the script rather than install a package — so the domain the script is
   * fetched from is the anchor, beside the package for the ones that ship on npm.
   * `cdn.iubenda.com` is Iubenda's; nobody else's site serves from it.
   */
  const CONSENT_VENDORS = [
    /cdn\.iubenda\.com|iubenda\.com\/(?:privacy-policy|cookie-policy)/i,
    /consent\.cookiebot\.com|cookiebot/i,
    /cdn\.cookielaw\.org|onetrust|OptanonWrapper/i,
    /app\.usercentrics\.eu|usercentrics/i,
    /cookiehub|cdn\.cookiehub\.eu/i,
    /vanilla-cookieconsent|\bklaro\b|tarteaucitron|osano|termly/i,
    /@axeptio|axeptio\.eu/i,
  ];

  const consent = [
    ...await searchInFiles(
      ctx.root,
      ctx.files.source,
      [/cookie[-_ ]?consent/i, /consentGiven/i, /privacyConsent/i, /gdprConsent/i],
      20
    ),
    ...await searchInFiles(ctx.root, [...ctx.files.source, ...ctx.files.all.filter((f) => /\.html?$/i.test(f))], CONSENT_VENDORS, 10),
  ];
  /**
   * The same duty, in the words each ecosystem actually uses.
   *
   * The list was written in one dialect. Article 20 is `exportUserData` in a Node
   * application and `UserExport` in a Rails one; article 17 is `deleteAccount` here
   * and `UserAnonymizer` there. Discourse ships both and was told it had neither,
   * at `high` — which is the severity a reader acts on.
   */
  /** A module path, not an endpoint: `import { exportCSV } from "../export"`. */
  const MODULE_IMPORT = /^\s*(?:import\b|export\s+(?:\*|\{)|from\s+["'])|require\s*\(/;

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
      /**
       * A route whose path ends at export, below a path that names the person.
       *
       * The patterns above are all compound words — `exportUserData`, `user_export`,
       * `export_account`. plane's is `workspaces/<slug>/user-activity/<uuid:user_id>/export/`,
       * where `export` is the last segment of a path and nothing is glued to it.
       *
       * Terminal alone was not enough, and the wild check measured it the release it went
       * in: open-webui gained an export from `/configs/export` and `/functions/export`,
       * vaultwarden from an organisation's vault export, plausible from a site's statistics
       * as CSV. Each of those hands data over, and none of it is the person's own — which
       * is what article 20 is about and what this capability says it checks. So the path
       * has to say whose: `me`, `my`, `self`, an account or a profile, or a user or member
       * followed by the segment that picks one out. `/users/export` is an admin's list of
       * everybody, not somebody's data.
       *
       * Except an import. `import { exportCSV } from "../export"` is a module path with
       * the same shape as a route, and plane has five of them. A reader who opens the
       * evidence and finds an import line stops believing the rest.
       */
      /["'`][^"'`]*\/(?:(?:me|my|self|accounts?|profiles?)(?:[-_]\w+)?|(?:users?|members?)(?:[-_]\w+)?\/[^"'`/]+)\/(?:[^"'`]*\/)?(?:download\/)?exports?\/?["'`]/i,
    ],
    20,
    (match) => !MODULE_IMPORT.test(match.snippet),
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
      /**
       * Phoenix writes a route with a space, not a bracket.
       *
       * `delete "/me", AuthController, :delete_me` is how `plausible/analytics` lets
       * somebody close their account, and every pattern here wanted `delete(` or
       * `delete:` immediately after the verb. A product whose entire position is privacy
       * was reported as having no erasure flow.
       *
       * The trailing comma is what keeps this to a router: `delete "/me"` on its own
       * could be prose, and a Phoenix route is always followed by the controller that
       * handles it.
       */
      /\b(?:delete|destroy)\s+["'`]\/?(?:account|users?\/me|me)["'`]\s*,/i,
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
  const callerDeleted = await deletesTheCaller(ctx);
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
    consent: ['a consent record', ['cookie-consent', 'consentGiven', 'privacyConsent', 'gdprConsent', 'Iubenda, Cookiebot, OneTrust, Usercentrics, CookieHub, Klaro or Axeptio']],
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
      present: erasure.length > 0 || erasureFiles.length > 0 || callerDeleted.length > 0,
      evidence:
        erasure.length > 0 || erasureFiles.length > 0 || callerDeleted.length > 0
          ? [...toEvidence(erasure), ...toEvidence(callerDeleted), ...fileNameEvidence(erasureFiles)]
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
