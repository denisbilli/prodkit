import type { ProjectAnalysis } from '../analyzer/types';
import type { ProductProfileInference } from './types';

export function inferProductProfile(analysis: ProjectAnalysis): ProductProfileInference {
  const backendPresent = analysis.stack.backend.length > 0;
  const frontendPresent = analysis.stack.frontend.length > 0;
  const dbPresent = analysis.stack.databases.length > 0;

  const auth = analysis.detectors['auth.core']?.present === true;
  const billing = analysis.detectors['billing.stripe']?.present === true;
  const tenancy = analysis.detectors['tenancy.organization']?.present === true || analysis.detectors['tenancy.membership']?.present === true;
  const jobs = analysis.detectors['jobs.background']?.present === true;
  const uploads = analysis.detectors['uploads.exposure']?.present === true;

  /**
   * A dependency on a model SDK, not a word that suggests one.
   *
   * This used to match /openai|anthropic|claude|gemini|llm|transcrib|generation|prompt|model/
   * against the evidence strings of the billing, API-key and background-job detectors.
   * "model" is in every ORM, "generation" and "prompt" are ordinary English, and the
   * strings being searched were written to describe something else entirely.
   */
  const callsAModel = analysis.detectors['ai.modelProvider']?.present === true;

  const sourceHints = analysis.files.source.join('\n');
  const marketplaceHints = /seller|buyer|vendor|listing|order/i.test(sourceHints);
  const adminHints = /admin|\/users|subscription|billing/i.test(sourceHints);

  if (frontendPresent && !backendPresent && !dbPresent && !auth) {
    return { inferredProfile: 'static-site', confidence: 'high', reason: 'Frontend-only structure with no backend/db/auth signals.' };
  }

  /**
   * Background jobs used to be sufficient here, in `(aiEvidence || jobs)`. They are
   * orthogonal: every serious application has a queue, and this branch sits second,
   * ahead of b2b-saas, marketplace and b2c — so an ordinary application with a worker
   * was judged against the most demanding profile in the catalogue, which accumulates
   * roughly 185 points of expectation. The score came out wrong for a reason the
   * reader had no way to see.
   *
   * Measured: of ten unrelated local repositories, five were called ai-saas. One was a
   * pirate game, promoted on a local variable named `queue` in a flood fill.
   */
  if (callsAModel && (uploads || jobs || backendPresent)) {
    return {
      inferredProfile: 'ai-saas',
      confidence: 'medium',
      reason: 'A model SDK dependency with a backend or a processing pipeline.',
    };
  }

  if (marketplaceHints && billing) {
    return { inferredProfile: 'marketplace', confidence: 'medium', reason: 'Marketplace vocabulary and billing signals detected.' };
  }

  if (billing || tenancy || adminHints) {
    return { inferredProfile: 'b2b-saas', confidence: billing || tenancy ? 'high' : 'medium', reason: 'Billing/tenant/admin signals are consistent with B2B SaaS.' };
  }

  if (auth && !tenancy) {
    return { inferredProfile: 'b2c-app', confidence: 'medium', reason: 'Auth signals without tenant boundaries suggest consumer app.' };
  }

  if (backendPresent && auth && !billing && !tenancy) {
    return { inferredProfile: 'internal-tool', confidence: 'low', reason: 'Some internal-tool signals exist but confidence is low.' };
  }

  return { inferredProfile: 'internal-tool', confidence: 'low', reason: 'Insufficient profile-specific evidence.' };
}