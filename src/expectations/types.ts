import type { DetectorEvidence } from '../analyzer/types';
import type { Finding } from '../report/types';

export type ProductProfile =
  | 'static-site'
  | 'internal-tool'
  | 'b2c-app'
  | 'b2b-saas'
  | 'ai-saas'
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
  | 'jobs';

export interface ExpectedCapability {
  id: string;
  title: string;
  category: CapabilityCategory;
  importance: CapabilityImportance;
  detectorKeys: string[];
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

export interface ProductExpectationResult {
  selectedProfile: ProductProfile;
  inferredProfile?: ProductProfile;
  inferenceConfidence?: 'low' | 'medium' | 'high';
  profileTitle: string;
  profileDescription: string;
  capabilities: CapabilityEvaluation[];
  score: number;
  note?: string;
}

export interface ProductProfileInference {
  inferredProfile: ProductProfile;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
}

export interface ExpectationEvaluationOutput {
  result: ProductExpectationResult;
  findings: Finding[];
}