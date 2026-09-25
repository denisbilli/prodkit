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
/*
 * Symfony's is `$this->getUser()`, and it deletes through a service: wallabag closes an
 * account with `$user = $this->getUser()` then `$this->userManager->deleteUser($user)`,
 * and Doctrine's is `$entityManager->remove($user)`. The bound caller passed to a
 * `remove` or `delete…` call is the same act as calling `delete` on it.
 */
/*
 * And GraphQL's: in graphene and strawberry resolvers the request is `info.context`, so
 * the caller is `info.context.user`. saleor's `AccountDelete` mutation reads it into
 * `user` and calls `user.delete()`, and was told at `high` it has no erasure flow.
 */
const CALLER = String.raw`(?:request\.user|info\.context\.user|current_user|\$request->user\(\)|Auth::user\(\)|auth\(\)->user\(\)|\$this->getUser\(\))`;
const CALLER_DELETED = new RegExp(String.raw`${CALLER}\s*(?:\.delete\(\)|\.destroy!?\b|->delete\(\))`);
const CALLER_BOUND = new RegExp(String.raw`^\s*(\$?\w+)\s*=\s*${CALLER}\s*;?\s*$`);
/** Far enough to cover one view, not so far it reaches the next. */
const WITHIN_ONE_VIEW = 30;

async function deletesTheCaller(ctx: DetectContext): Promise<TextMatch[]> {
  const found: TextMatch[] = [];
  for (const file of ctx.files.source) {
    if (!/\.(py|rb|php)$/.test(file)) continue;
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !/request\.user|context\.user|current_user|->user\(\)|Auth::user|->getUser\(\)/.test(text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && found.length < 5; i++) {
      if (CALLER_DELETED.test(lines[i])) {
        found.push({ file, line: i + 1, snippet: lines[i].trim().slice(0, 200) });
        continue;
      }
      const bound = CALLER_BOUND.exec(lines[i]);
      if (!bound) continue;
      const name = bound[1].replace(/[$]/g, '\\$');
      const deleted = new RegExp(String.raw`(?:^|[^\w$])${name}\s*(?:\.delete\(\)|\.destroy!?\b|->delete\(\))|->(?:remove|delete\w*)\(\s*${name}\s*\)`);
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

/**
 * The caller's own rows, handed over as a file.
 *
 * `sissbruecker/linkding` lets anyone download their bookmarks from `settings/export`: the
 * view reads `Bookmark.objects.filter(owner=request.user)` and answers with
 * `Content-Disposition: attachment`. It was reported as having no data export, because the
 * path names no person and the function is called `bookmark_export`.
 *
 * Both halves are the framework's, as with erasure above. The caller narrows the query —
 * `owner=request.user` in Django, `current_user.bookmarks` in Rails, `$request->user()->`
 * in Laravel — and the response is a download: an attachment header, `as_attachment=True`,
 * Rails' `send_data`, Laravel's `->download(`. Together, in one function, they are a
 * person taking their data away. An admin's CSV of every user has the download and not
 * the caller; a page listing the caller's rows has the caller and not the download.
 *
 * The caller has to be the value of a keyword argument — inline, or on a line of its own as
 * black formats a long call, `user=request.user,` with no spaces round the `=` and a comma
 * after, which is what paperless-ngx hands the job that zips the documents somebody chose;
 * `user = request.user` is an assignment, and admin views make it too — and nothing read
 * off it. netbox's
 * table export reads `delimiter = request.user.config.get('csv_delimiter')` beside its
 * attachment header, and a plain assignment was enough to call every table in it the
 * caller's own data.
 */
const CALLER_NARROWS = /[(,]\s*\w+(?:_id)?\s*=\s*request\.user\b(?!\.)|^\s*\w+(?:_id)?=request\.user\s*,|\bcurrent_user\.\w+s\b|\bwhere\(\s*user(?:_id)?:\s*current_user\b|(?:\$request->user\(\)|Auth::user\(\)|auth\(\)->user\(\))->\w+s\b/;
const HANDED_OVER = /Content-Disposition['"]?\]?\s*[=,:]?.*attachment|\bas_attachment\s*=\s*True\b|\bsend_data\b|->(?:streamD|d)ownload\s*\(/i;
const FUNCTION_START = /^\s*(?:async\s+def|def|(?:public\s+|private\s+|protected\s+)?function)\b/;

async function exportsTheCallersRows(ctx: DetectContext): Promise<TextMatch[]> {
  const found: TextMatch[] = [];
  for (const file of ctx.files.source) {
    if (!/\.(py|rb|php)$/.test(file)) continue;
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !HANDED_OVER.test(text)) continue;

    const lines = text.split(/\r?\n/);
    let start = 0;
    for (let i = 0; i <= lines.length; i++) {
      if (i < lines.length && !FUNCTION_START.test(lines[i])) continue;
      const body = lines.slice(start, i);
      const handed = body.findIndex((line) => HANDED_OVER.test(line));
      if (handed >= 0 && body.some((line) => CALLER_NARROWS.test(line))) {
        found.push({ file, line: start + handed + 1, snippet: body[handed].trim().slice(0, 200) });
      }
      start = i;
    }
    if (found.length >= 5) break;
  }
  return found.slice(0, 5);
}

/**
 * Deleting what is older than a number of days.
 *
 * The retention search reads `gdpr` or `privacy` beside `retention`, and a product that
 * enforces a retention period without citing the regulation was missing it.
 * `glitchtip/glitchtip-backend` deletes releases older than
 * `GLITCHTIP_RELEASE_RETENTION_DAYS` and issues older than a configured number of days
 * from scheduled maintenance jobs — `Release.objects.filter(created__lt=days_ago)` after
 * `days_ago = now() - timedelta(days=...)`, then a delete — and was told personal data is
 * kept indefinitely.
 *
 * An age in days and a delete, close together, is that idiom in every stack: Python's
 * `timedelta(days=`, Rails' `30.days.ago` with `delete_all` or `destroy_all`, SQL's
 * `interval '30 days'` in a `DELETE FROM`, date-fns' `subDays(` with Prisma's `deleteMany`,
 * Go's `AddDate(0, 0, -30)`. Days, not minutes or hours: a rate-limit window cleared every
 * minute is housekeeping, not a period somebody chose for keeping data.
 */
/*
 * And JavaScript's own arithmetic, a number of days in milliseconds: rallly purges
 * polls marked deleted with `new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)`. The
 * `* 24` is what makes it days rather than a rate-limit window.
 */
const AGE_IN_DAYS = /\btimedelta\(\s*days\s*=|\.days\.ago\b|\binterval\s+'\d+\s*days?'|\bsubDays\s*\(|\.AddDate\(\s*0\s*,\s*0\s*,\s*-|\bINTERVAL\s+\d+\s+DAY\b|\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\b/;
const DELETES_ROWS = /\.a?delete\(\)|\._raw_delete\b|\bdelete_all\b|\bdestroy_all\b|\.deleteMany\s*\(|\bDELETE\s+FROM\b|->delete\(\)|\.Delete\(|\bdelete_\w+\s*\(|\bdelete[A-Z]\w*\s*\(/;
/**
 * The age has to be a cutoff — something is older than it — not a lifetime. A cookie's
 * `max_age=timedelta(days=30)` beside a logout's `delete_cookie` is an age and a delete,
 * and is not retention. What a retention job has is a comparison: Django's `__lt=`, Prisma's
 * and Mongo's `lt:` and `$lt`, SQL's `< now()`, ActiveRecord's `< ?`.
 */
/*
 * Laravel's query builder takes the operator as an argument: BookStack clears its
 * recycle bin with `Deletion::query()->where('created_at', '<', $clearBeforeDate)`
 * after `subDays($lifetime)`, and none of the forms above is that one.
 */
const OLDER_THAN = /__lte?\s*=|\blte?\s*:\s|\$lte?\b|<\s*(?:now|NOW|CURRENT_TIMESTAMP)\b|<\s*\?|,\s*['"]<=?['"]\s*,/;
/** Close enough to be one job: the cutoff computed, the query built, the rows deleted in batches. */
const WITHIN_ONE_JOB = 60;

async function deletesByAge(ctx: DetectContext): Promise<TextMatch[]> {
  const found: TextMatch[] = [];
  for (const file of ctx.files.source) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !AGE_IN_DAYS.test(text) || !DELETES_ROWS.test(text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!AGE_IN_DAYS.test(lines[i])) continue;
      const job = lines.slice(i, i + WITHIN_ONE_JOB);
      /*
       * Or the cutoff compared by the name it was given. rallly computes `sevenDaysAgo`
       * on one line and compares `deletedAt: { lt: sevenDaysAgo }` seven lines later,
       * inside the query that selects what to delete.
       */
      const cutoff = /(?:const|let|var)\s+(\w+)\s*=|(\w+)\s*:?=/.exec(lines[i]);
      const name = cutoff?.[1] ?? cutoff?.[2];
      const comparedByName = name !== undefined
        && job.some((line) => new RegExp(`(?:\\blte?\\s*:\\s*|__lte?\\s*=\\s*|<=?\\s*)${name}\\b`).test(line));
      if (!job.slice(0, 5).some((line) => OLDER_THAN.test(line)) && !comparedByName) continue;
      if (!job.some((line) => DELETES_ROWS.test(line))) continue;
      found.push({ file, line: i + 1, snippet: lines[i].trim().slice(0, 200) });
      break;
    }
    if (found.length >= 5) break;
  }
  return found;
}

const OPERATOR_SCRIPT = /(^|\/)scripts\//;

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
    ...await searchInFiles(ctx.root, [...ctx.files.source, ...ctx.files.pages], CONSENT_VENDORS, 10),
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

  /**
   * An export somebody can ask for is served by the product.
   *
   * Infisical's `backend/scripts/migrate-organization.ts` binds `const exportUser` — the
   * Postgres role an operator dumps the database as — and runs `pg_dump` with it. That
   * line was the evidence for a personal data export in a product that has none. A file
   * under `scripts/` is run by whoever operates the product, not by the person whose data
   * it holds.
   */
  const servedFiles = ctx.files.source.filter((file) => !OPERATOR_SCRIPT.test(file));
  const exportRoute = await searchInFiles(
    ctx.root,
    servedFiles,
    [
      /\/gdpr\/export\b/i,
      /exportUserData/i,
      /personalDataExport/i,
      /**
       * The data subject, and not a subject that loads data: `loadDataSubject` in Kavita's
       * Angular side nav is an RxJS `Subject`, and it was the evidence for a data export.
       */
      /(?<![a-z])data[_ -]?subject/i,
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
  const callersRowsExported = await exportsTheCallersRows(ctx);
  /**
   * `data-export` says nothing about whose data. Infisical's is
   * `PamDataExplorerPage/data-export.ts`, which downloads the rows of a customer's own
   * database from its query explorer, and nocodb's `jobs/data-export/` is a table's rows
   * as CSV — the same reason the route rule above wants a path that names the person.
   *
   * When the name does say whose, it counts: maybe's `family_data_export_job.rb` and
   * `family/data_exporter.rb` hand a household its own accounts and transactions, which
   * is the person's data in a product that keeps a family's money.
   */
  const exportFiles = searchFileNames(servedFiles, [
    /user[_-]?export/i,
    /(account|profile)[_-]?export/i,
    /(?:user|account|profile|family|household|personal|my)[_-]?data[_-]?export/i,
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
       * Wiping somebody's data, which is the other half of exporting it.
       *
       * `knadh/listmonk` lets a subscriber export their data and wipe it from the same
       * page — `exportSubscriberData` and `WipeSubscriberData`, behind
       * `/subscription/wipe/:subUUID` — and was credited with the export and not the
       * erasure. Wipe, erase and purge are verbs nobody uses for an admin removing a row;
       * `delete` stays out, for the reason `deleteUser(id)` did.
       */
      /\b(?:wipe|erase|purge)[_-]?(?:subscriber|user|personal|my)[_-]?data\b/i,
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
      /**
       * A cutoff in days computed from a retention period.
       *
       * zulip archives and deletes messages older than each organisation's
       * `message_retention_days`: `check_date = timezone_now() - timedelta(days=
       * message_retention_days)`, compared eleven lines later inside the SQL that moves
       * the rows, and deleted in a function further down. The age-and-delete rule wants
       * the three close together and found none, so a chat product with a per-channel
       * retention policy was told at `high` it keeps personal data indefinitely.
       *
       * The date arithmetic is Python's own `timedelta(days=`, and the period it
       * subtracts is called a retention. That is the policy, stated as code. Only
       * Python's form is here because only a Python product has been measured missing it.
       */
      /\btimedelta\(\s*days\s*=\s*[\w.]*retention\w*/i,
    ],
    20
  );
  const agedOut = await deletesByAge(ctx);
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
      present: exportRoute.length > 0 || exportFiles.length > 0 || callersRowsExported.length > 0,
      evidence:
        exportRoute.length > 0 || exportFiles.length > 0 || callersRowsExported.length > 0
          ? [...toEvidence(exportRoute), ...toEvidence(callersRowsExported), ...fileNameEvidence(exportFiles)]
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
      present: retention.length > 0 || agedOut.length > 0,
      evidence: retention.length > 0 || agedOut.length > 0 ? toEvidence([...retention, ...agedOut]) : evidenceOr(retention, 'retention'),
    },
    {
      key: 'gdpr.adminQueue',
      present: adminQueue.length > 0,
      evidence: evidenceOr(adminQueue, 'adminQueue'),
    },
  ];
}
