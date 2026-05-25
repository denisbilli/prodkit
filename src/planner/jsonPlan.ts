import type { RemediationPlan } from './types';

export function renderJsonPlan(plan: RemediationPlan): string {
  return JSON.stringify(plan, null, 2);
}