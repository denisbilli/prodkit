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

  /**
   * No profile. Not `internal-tool`.
   *
   * There used to be a branch here for a deliberate internal tool —
   * `backendPresent && auth && !billing && !tenancy` — and an exhaustive search over
   * its inputs returns zero combinations that reach it: anything with auth and no
   * tenancy has already returned b2c-app, and anything with billing or tenancy has
   * already returned b2b-saas. It was dead code, so every internal-tool ever reported
   * came from the fallback below and meant "I do not know".
   *
   * A positive signal for an internal tool is worth designing — enterprise identity
   * with no public signup and no billing is the shape of one — but inventing the
   * distinction without evidence is what produced a wrong profile on five of ten real
   * repositories. Until there is evidence, the answer is nothing.
   */
  return {
    inferredProfile: null,
    confidence: 'low',
    reason: 'No profile-specific evidence: the repository does not identify what kind of product it is.',
  };
}