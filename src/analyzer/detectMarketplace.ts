import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles, type TextMatch } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { evidenceOrSearch } from './absenceEvidence';

/**
 * Marketplace-specific signals.
 *
 * Every other capability in the catalogue is generic: a marketplace and a B2B SaaS
 * both need auth, tenancy and GDPR, which is why the two profiles used to ask nearly
 * the same question. These detectors look for what is structurally specific to a
 * two-sided product — distinct parties, money moving to a third party, a cut taken on
 * the way through, and a way to unwind a transaction that went wrong.
 */

// Marketplace vocabulary is ordinary English, so searching the whole source tree
// produces confident nonsense. Measured false positives from an earlier draft, all on
// a transcription app: `vendor:` from a vite.config.js chunk-splitting rule, "listing
// teams" from a log message, and `arbitration` from an Italian-to-English glossary.
//
// Two corrections follow. Terms are restricted to the files where a marketplace
// concept would actually be modelled, and a term only qualifies if its presence
// genuinely implies a supply side — which rules out build vocabulary (`vendor`),
// common verbs (`listing`), and anything that ships inside a payment SDK (`customer`).
/**
 * A connected account is a seller, in the payment platform's own words.
 *
 * `seller`, `merchant`, `storefront` and `supplier` are four English words, and a
 * mercato whose table is `venditori` has none of them. What it does have, if it pays
 * anybody, is Stripe: `stripe.accounts.create({ type: 'express' })` creates a
 * connected account, and a connected account is the supply side by definition — the
 * platform is the other one. The same is true of `transfers.create` with a
 * `destination`, which is money leaving the platform for somebody else's account.
 *
 * It is the anchor the payout capability beside this one already uses, and the reason
 * an Italian marketplace was reported as having a payout but no seller.
 */
/**
 * Every pattern here has to be one nothing else writes.
 *
 * The first draft included `destination:\s*\w` — Stripe's transfer destination — and
 * `accounts.create(` with nothing in front of it. Measured against real products:
 * `destination:` is a Next.js redirect (`{ redirect: { destination, permanent } }`) and
 * a drag-and-drop drop target (`handleOnDrop: (source, destination)`). cal.com matched
 * it 14 times, plane 9, and all three of cal.com, plane and documenso were inferred as
 * marketplaces at 1.28.1 where 1.26.2 had them as B2B SaaS — a whole profile wrong, so
 * every expectation under it wrong too.
 *
 * The fixture corpus reported no change, because no fixture writes a Next.js redirect.
 * A pattern this broad is not measurable against fixtures; it needed the real thing.
 *
 * What survives names Stripe explicitly or is snake_case out of Stripe's own API,
 * which nothing else has a reason to spell.
 */
const CONNECTED_ACCOUNT = [
  /\bstripe\.accounts\.create\s*\(/i,
  /\baccounts\.create\s*\(\s*\{[^}]*\btype:\s*["'`](?:express|standard|custom)["'`]/i,
  /['"`]account\.updated['"`]|['"`]account\.application\./,
  /\bdestination_account\b/,
  /**
   * An account named for Stripe Connect itself. Sharetribe's template onboards every
   * provider through a `stripeConnectAccount` — its duck, its selectors, its SDK calls —
   * and with `provider` and `customer` for the two sides, the supply side was never found:
   * payouts, commission and disputes all present, and the product read as a consumer app.
   */
  /\bstripe_?connect(?:ed)?_?account/i,
  /\bconnected_?account/i,
];
/** The ones that name Stripe or its API; the last pattern is only a word. */
const STRIPE_CONNECT_CALLS = CONNECTED_ACCOUNT.slice(0, -1);

/**
 * Nobody writes `seller` on its own.
 *
 * `\bseller\b` is a word boundary, and code is not prose: the supply side of a real
 * marketplace is `onboardSeller`, `sellerId`, `db.sellers` and `seller_account`, and a
 * word boundary matches none of the first three. A fixture written the way an English
 * marketplace is actually written came out with zero seller signals and zero buyer
 * signals — and then, since 1.27.0 reads that as "this repository's words are not
 * mine", the commission and dispute findings would have been withdrawn from a
 * repository that spells both sides on every line.
 *
 * A trailing lowercase letter is still excluded, so `sellerships` or `buyerish` do not
 * qualify; `reseller` does, and a reseller is a supply side.
 *
 * The lookahead is why these are not written with the `i` flag. `/buyers?(?![a-z])/i`
 * applies the flag to the lookahead too, so `[a-z]` matches the `I` of `buyerId` and
 * the pattern rejects the one spelling it was widened to accept — a case-insensitive
 * negative lookahead asserts the opposite of what it reads like.
 */
function identifierWord(word: string): RegExp {
  const initial = word[0];
  return new RegExp(`(?:[${initial.toLowerCase()}${initial.toUpperCase()}]${word.slice(1)}|${word.toUpperCase()})s?(?![a-z])`);
}

const SELLER_TERMS = ['seller', 'merchant', 'storefront', 'supplier'].map(identifierWord);
const BUYER_TERMS = ['buyer', 'purchaser', 'shopper'].map(identifierWord);

/** Files where a domain concept is declared rather than merely mentioned. */
const DOMAIN_FILE = /(model|schema|entity|migration|prisma|domain|route|controller)/i;

function domainFiles(ctx: DetectContext): string[] {
  return ctx.files.source.filter((file) => DOMAIN_FILE.test(file));
}

async function detectMultiRole(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const scope = domainFiles(ctx);

  const sellerHits = await searchInFiles(ctx.root, scope, SELLER_TERMS, 20);
  const buyerHits = await searchInFiles(ctx.root, scope, BUYER_TERMS, 20);
  /**
   * The connected-account search is not scoped and not restricted to files whose name
   * is an English word, because it is not searching for a word.
   *
   * `DOMAIN_FILE` keeps the vocabulary terms away from `vite.config.js` — a reasonable
   * precaution for `vendor` and `listing`, and useless for a repository whose files
   * are called `venditori.js` and `ordini.js`. It is the same filter twice over: an
   * English word inside a file whose path is an English word.
   *
   * `stripe.accounts.create(` is neither. Nothing calls it by accident, so it can be
   * looked for where the code actually is.
   */
  /**
   * And a connected account is Stripe's only where Stripe is.
   *
   * `connected_account` is the one pattern above that does not name Stripe, and
   * `twentyhq/twenty` — a CRM — has `connectedAccountId` in every file that syncs a
   * user's Gmail or calendar, because that is what it calls an OAuth account somebody
   * linked. It was inferred as a marketplace at high confidence. The word counts in a
   * file that talks to Stripe; the calls that are Stripe's own count anywhere.
   */
  const connectedHits: TextMatch[] = [];
  for (const hit of await searchInFiles(ctx.root, ctx.files.source, CONNECTED_ACCOUNT, 40)) {
    const stripesOwn = STRIPE_CONNECT_CALLS.some((pattern) => pattern.test(hit.snippet));
    if (stripesOwn || /stripe/i.test((await readTextFileSafe(ctx.root, hit.file)) ?? '')) connectedHits.push(hit);
    if (connectedHits.length >= 20) break;
  }

  for (const hit of [...sellerHits, ...buyerHits, ...connectedHits]) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  /**
   * File names that suggest a supply side — read from the analysed sources, not from
   * every path in the repository.
   *
   * `twentyhq/twenty`, an open-source CRM, ships an example real-estate app whose
   * `roles/seller.role.ts` matched here. Scanning `files.all` meant any path anywhere
   * counted, including bundled demos and vendored code.
   */
  const roleFiles = scope.filter((file) => /(seller|merchant|storefront)/i.test(file)).slice(0, 20);
  for (const file of roleFiles) evidence.push({ type: 'file', value: file });

  // Both sides must appear for a confident signal: a supply-side vocabulary on its own
  // also fits a plain catalogue or CMS, so it downgrades to partial rather than present.
  /**
   * Two sides are not one sentence.
   *
   * `documenso`, an open-source document-signing product, came out a marketplace with
   * high confidence on a single line: a comment in a field-detection schema listing
   * `"Tenant", "Landlord", "Buyer", "Seller"` as examples of labels found in the
   * documents its users sign. One line matched both sides, and one line is one
   * mention.
   */
  const vocabularyFiles = new Set([...sellerHits, ...buyerHits].map((hit) => hit.file));

  const bothSides = sellerHits.length > 0 && buyerHits.length > 0 && vocabularyFiles.size >= 2;

  // A file name on its own is not a role either. Twenty had four such names and no
  // buyer or seller vocabulary anywhere in its code, and came out a marketplace:
  // naming a file is cheaper than building a two-sided product.
  //
  // The two-file rule guards against one sentence naming both sides — a comment in
  // documenso listing "Tenant", "Landlord", "Buyer", "Seller" as example labels. A
  // connected account is not a sentence, so it does not need the guard: one call to
  // `accounts.create` is a supply side whether or not the repository also spells one.
  const oneSide = vocabularyFiles.size >= 2 || connectedHits.length > 0;

  return {
    key: 'marketplace.multiRole',
    present: oneSide,
    complete: bothSides,
    evidence,
    details: {
      sellerSignals: sellerHits.length + connectedHits.length,
      connectedAccountSignals: connectedHits.length,
      /**
       * This repository runs a marketplace in words this tool does not have.
       *
       * The payment platform named the supply side and the repository never did: a
       * connected account is created, and `seller`, `merchant`, `buyer` and
       * `shopper` appear nowhere. That combination is not a marketplace missing its
       * vocabulary — it is a marketplace whose vocabulary is `venditori` and
       * `acquirenti`, or any of the other several thousand languages this tool reads
       * none of.
       *
       * Commission and dispute are searched for in English and in provider API names.
       * Where the provider name is absent — a cut computed in arithmetic, a table
       * called `contestazioni` — the search has nothing left to look with, and the
       * finding downstream becomes "not assessed" rather than "not there".
       */
      vocabularyUnread: connectedHits.length > 0 && sellerHits.length === 0 && buyerHits.length === 0,
      buyerSignals: buyerHits.length,
      roleFiles: roleFiles.length,
    },
  };
}

async function detectPayout(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const deps = hasAnyDep(ctx, ['stripe', '@stripe/stripe-js', 'paypal-rest-sdk', '@paypal/checkout-server-sdk', 'razorpay']);
  const pyDeps = hasAnyPyDep(ctx, ['stripe', 'paypalrestsdk']);
  for (const dep of [...deps, ...pyDeps]) evidence.push({ type: 'dependency', value: dep });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\bpayout/i, /\btransfer(s)?\.create/i, /stripe\s*connect/i, /\baccounts\.create/i, /destination_account/i, /application_fee/i],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  return {
    key: 'marketplace.payout',
    present: hits.length > 0,
    evidence,
    details: {
      paymentDependency: deps.length + pyDeps.length > 0,
      payoutSignals: hits.length,
    },
  };
}

/**
 * Nothing was found, and the search had nothing left to look with.
 *
 * Commission and dispute are searched for in English and in provider API names. Where
 * the provider name is absent — a cut computed as arithmetic, a table called
 * `contestazioni` — only the English half remains, and a repository that never spelled
 * `seller` or `buyer` was never going to answer it. `unanswered` turns the finding into
 * "not assessed" downstream, which is the one direction blindness is allowed to move a
 * verdict.
 */
async function detectCommission(ctx: DetectContext, vocabularyUnread: boolean): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      // "Commission" is also an institution. The privacy policy of an open-source CRM
      // said "European Commission, relying on an adequacy decision" and was read as a
      // platform taking a cut, sixteen times over.
      /commission[_\s]?(rate|fee|percent|amount|bps)/i,
      /(rate|fee|percent|amount)[_\s]?commission/i,
      /\bcommission[A-Z]/,
      /application_fee/i,
      /\bplatform_?fee/i,
      /\btake_?rate/i,
      /\bservice_?fee/i,
    ],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  return {
    key: 'marketplace.commission',
    present: hits.length > 0,
    unanswered: hits.length === 0 && vocabularyUnread,
    evidence: evidenceOrSearch(evidence, 'a cut taken on the way through', ['commission_rate', 'commissionRate', 'application_fee', 'platform_fee', 'take_rate', 'service_fee']),
    details: { commissionSignals: hits.length },
  };
}

async function detectDispute(ctx: DetectContext, vocabularyUnread: boolean): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  // `refund` alone is not evidence of dispute handling — it appears in any payment
  // integration. `arbitration` was dropped after it matched a glossary entry in a
  // transcription app. What remains are provider API shapes and named routes/models,
  // which are declarations rather than mentions.
  const scope = domainFiles(ctx);

  const strongHits = await searchInFiles(
    ctx.root,
    scope,
    [/\bdisputes?\.(create|update|close|list)/i, /\bchargeback/i, /\bescrow/i],
    20,
  );
  const weakHits = await searchInFiles(ctx.root, scope, [/\brefund/i, /\bdispute/i], 20);

  for (const hit of [...strongHits, ...weakHits]) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const files = ctx.files.all.filter((file) => /(dispute|chargeback|escrow)/i.test(file)).slice(0, 20);
  for (const file of files) evidence.push({ type: 'file', value: file });

  const strong = strongHits.length > 0 || files.length > 0;

  return {
    key: 'marketplace.dispute',
    present: strong || weakHits.length > 0,
    unanswered: !strong && weakHits.length === 0 && vocabularyUnread,
    complete: strong,
    evidence: evidenceOrSearch(evidence, 'a way to unwind a transaction', ['disputes.create', 'chargeback', 'escrow', 'refund', 'dispute']),
    details: {
      disputeSignals: strongHits.length,
      refundOnlySignals: weakHits.length,
      disputeFiles: files.length,
    },
  };
}

export async function detectMarketplace(ctx: DetectContext): Promise<DetectorResult[]> {
  const multiRole = await detectMultiRole(ctx);
  const vocabularyUnread = multiRole.details?.vocabularyUnread === true;

  return Promise.all([
    Promise.resolve(multiRole),
    detectPayout(ctx),
    detectCommission(ctx, vocabularyUnread),
    detectDispute(ctx, vocabularyUnread),
  ]);
}
