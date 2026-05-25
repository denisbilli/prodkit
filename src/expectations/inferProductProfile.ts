import type { ProjectAnalysis } from '../analyzer/types';
import type { ProductProfile, ProductProfileInference } from './types';

function hasSignal(value: unknown): boolean {
  return value === true;
}

export function inferProductProfile(analysis: ProjectAnalysis): ProductProfileInference {
  const backendPresent = analysis.stack.backend.length > 0;
  const frontendPresent = analysis.stack.frontend.length > 0;
  const dbPresent = analysis.stack.databases.length > 0;

  const auth = analysis.detectors['auth.core']?.present === true;
  const billing = analysis.detectors['billing.stripe']?.present === true;
  const tenancy = analysis.detectors['tenancy.organization']?.present === true || analysis.detectors['tenancy.membership']?.present === true;
  const jobs = analysis.detectors['jobs.background']?.present === true;
  const uploads = analysis.detectors['uploads.exposure']?.present === true;

  const aiEvidence = (analysis.detectors['billing.stripe']?.evidence ?? [])
    .concat(analysis.detectors['auth.apiKeys']?.evidence ?? [])
    .concat(analysis.detectors['jobs.background']?.evidence ?? [])
    .some((e) => /openai|anthropic|claude|gemini|llm|transcrib|generation|prompt|model/i.test(e.value));

  const sourceHints = analysis.files.source.join('\n');
  const marketplaceHints = /seller|buyer|vendor|listing|order/i.test(sourceHints);
  const adminHints = /admin|\/users|subscription|billing/i.test(sourceHints);

  if (frontendPresent && !backendPresent && !dbPresent && !auth) {
    return { inferredProfile: 'static-site', confidence: 'high', reason: 'Frontend-only structure with no backend/db/auth signals.' };
  }

  if ((aiEvidence || jobs) && (uploads || backendPresent)) {
    return { inferredProfile: 'ai-saas', confidence: 'medium', reason: 'AI/job/upload signals suggest AI SaaS workflow.' };
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