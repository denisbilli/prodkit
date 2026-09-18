import type { DetectorEvidence } from '../analyzer/types';
import type { Finding } from '../report/types';

export type ProductProfile =
  | 'static-site'
  | 'internal-tool'
  | 'b2c-app'
  | 'b2b-saas'
  | 'ai-saas'
  | 'game'
  | 'client-app'
  | 'library'
  | 'mobile-app'
  | 'marketplace'
  | 'auto'
  | 'observed-only';

export type CapabilityImportance =
  | 'required'
  | 'recommended'
  | 'optional'
  | 'not_applicable';

export type CapabilityStatus =
  | 'present'
  | 'missing'
  | 'partial'
  | 'unknown'
  | 'not_applicable';

export type CapabilityCategory =
  | 'auth'
  | 'authz'
  | 'tenancy'
  | 'gdpr'
  | 'billing'
  | 'security'
  | 'uploads'
  | 'observability'
  | 'deployment'
  | 'audit'
  | 'jobs'
  | 'client'
  | 'mobile'
  | 'packaging'
  | 'quality'
  | 'docs';

/**
 * What the owner says their product does, as distinct from what the code shows.
 *
 * A declaration can *add* a duty and can never remove one. Saying "we take payments"
 * makes the billing capabilities required even where the profile treats them as
 * optional and even where no Stripe call was found — the statement is evidence about
 * intent, and a product that intends to charge people has to charge them safely.
 *
 * Saying "we have no file uploads" does nothing at all. If an upload route is in the
 * code, the finding stands: otherwise this is a switch for turning problems off, and a
 * score with an off switch measures the owner's optimism rather than the product.
 */
export interface DeclaredIntent {
  handlesPersonalData?: boolean;
  hasFileUploads?: boolean;
  requiresTenantIsolation?: boolean;
  hasBilling?: boolean;
}

export interface ExpectedCapability {
  id: string;
  title: string;
  category: CapabilityCategory;
  importance: CapabilityImportance;
  detectorKeys: string[];
  /**
   * Which claim inside those detectors this capability is about.
   *
   * `security.core` decides headers, rate limiting, CORS, DEBUG and cookie flags in one
   * pass, so a capability naming it received the lot: "rate limiting is missing",
   * evidenced by four `SECURE_HSTS_SECONDS` lines. Set this and the capability is shown
   * only the evidence for its own claim.
   */
  claim?: string;
  /**
   * True when this capability is required because the owner said so, not because the
   * profile inferred it.
   *
   * A declaration raises a duty and can never remove one, so a rule that drops a
   * requirement for want of evidence must not apply to one the owner asserted.
   */
  declared?: boolean;
  description: string;
  recommendation: string;
}

export interface ProductProfileDefinition {
  id: ProductProfile;
  title: string;
  description: string;
  capabilities: ExpectedCapability[];
}

export interface CapabilityEvaluation {
  capabilityId: string;
  title: string;
  category: CapabilityCategory;
  importance: CapabilityImportance;
  status: CapabilityStatus;
  findingId: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  evidence: DetectorEvidence[];
}

export interface CapabilityGap {
  /** Capabilities that count toward the score (importance != not_applicable, status != unknown). */
  applicableTotal: number;
  /** Applicable capabilities whose status is 'present' or 'not_applicable'. */
  satisfied: number;
  requiredTotal: number;
  requiredMissing: number;
  requiredPartial: number;
  recommendedTotal: number;
  recommendedMissing: number;
  recommendedPartial: number;
}

export interface ProductExpectationResult {
  selectedProfile: ProductProfile;
  inferredProfile?: ProductProfile;
  /** What the repository looks like, when the evidence was not enough to judge it as. */
  profileSuggestion?: { profile: ProductProfile; reason: string };
  inferenceConfidence?: 'low' | 'medium' | 'high';
  profileTitle: string;
  profileDescription: string;
  capabilities: CapabilityEvaluation[];
  score: number;
  /**
   * Size of the gap between the repository and this profile's expectations.
   * Two profiles can both score 0 while demanding very different amounts of work,
   * so the counts — not the score — are what distinguish them on an empty repository.
   */
  gap: CapabilityGap;
  note?: string;
}

export interface ProductProfileInference {
  /**
   * `null` when the evidence does not identify a profile.
   *
   * This used to fall back to `internal-tool`, whose own reason string said
   * "Insufficient profile-specific evidence" — the code knew it did not know and named
   * a profile anyway. Every `internal-tool` in the wild came from that fallback: an
   * exhaustive search over the inputs showed the deliberate internal-tool branch was
   * unreachable, so the label never once meant "this is an internal tool".
   *
   * Saying nothing is the honest answer, and this product is sold on saying only what
   * it can show.
   */
  inferredProfile: ProductProfile | null;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  /**
   * What the repository looks like, when that is not enough to judge it as.
   *
   * Suggesting is not applying, and the difference is the whole point. The failure
   * worth avoiding is a wrong profile applied silently: the score changes and the
   * reader cannot see why. A suspicion printed with the signals it rests on changes no
   * number and can be checked in a glance — so the bar for saying it out loud is far
   * lower than the bar for acting on it.
   */
  suggestion?: {
    profile: ProductProfile;
    reason: string;
  };
}

export interface ExpectationEvaluationOutput {
  result: ProductExpectationResult;
  findings: Finding[];
}