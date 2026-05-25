import type { ProductionReadinessReport } from './types';

export function renderJson(report: ProductionReadinessReport): string {
  return JSON.stringify(report, null, 2);
}
