import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

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
const SELLER_TERMS = [/\bseller\b/i, /\bmerchant\b/i, /\bstorefront\b/i, /\bsupplier\b/i];
const BUYER_TERMS = [/\bbuyer\b/i, /\bpurchaser\b/i, /\bshopper\b/i];

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

  for (const hit of [...sellerHits, ...buyerHits]) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const roleFiles = ctx.files.all
    .filter((file) => /(seller|merchant|storefront)/i.test(file))
    .slice(0, 20);
  for (const file of roleFiles) evidence.push({ type: 'file', value: file });

  // Both sides must appear for a confident signal: a supply-side vocabulary on its own
  // also fits a plain catalogue or CMS, so it downgrades to partial rather than present.
  const bothSides = sellerHits.length > 0 && buyerHits.length > 0;
  const oneSide = sellerHits.length > 0 || buyerHits.length > 0 || roleFiles.length > 0;

  return {
    key: 'marketplace.multiRole',
    present: oneSide,
    complete: bothSides,
    evidence,
    details: {
      sellerSignals: sellerHits.length,
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

async function detectCommission(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\bcommission/i, /application_fee/i, /\bplatform_?fee/i, /\btake_?rate/i, /\bservice_?fee/i],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  return {
    key: 'marketplace.commission',
    present: hits.length > 0,
    evidence,
    details: { commissionSignals: hits.length },
  };
}

async function detectDispute(ctx: DetectContext): Promise<DetectorResult> {
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
    complete: strong,
    evidence,
    details: {
      disputeSignals: strongHits.length,
      refundOnlySignals: weakHits.length,
      disputeFiles: files.length,
    },
  };
}

export async function detectMarketplace(ctx: DetectContext): Promise<DetectorResult[]> {
  return Promise.all([
    detectMultiRole(ctx),
    detectPayout(ctx),
    detectCommission(ctx),
    detectDispute(ctx),
  ]);
}
