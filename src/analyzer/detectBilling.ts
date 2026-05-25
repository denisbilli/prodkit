import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectBilling(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const hasStripe = hasDep(ctx, 'stripe');
  if (hasStripe) evidence.push({ type: 'dependency', value: 'stripe' });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/STRIPE_SECRET_KEY/, /checkout/i, /subscription/i, /customerId/i, /plan/i, /tier/i, /webhook/i, /constructEvent\(/],
    20
  );
  for (const m of hits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const hasWebhook = hits.some((m) => /webhook/i.test(m.snippet));
  const hasSignature = hits.some((m) => /constructEvent\(/.test(m.snippet));

  return {
    key: 'billing.stripe',
    present: hasStripe || hits.length > 0,
    evidence,
    details: {
      stripe: hasStripe,
      hasWebhook,
      webhookSignatureValidation: hasSignature,
    },
  };
}
