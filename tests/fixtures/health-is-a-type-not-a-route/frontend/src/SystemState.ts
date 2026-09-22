import Health from 'typings/Health';
import { HealthCheck } from './health/health.service';

export interface SystemAppState {
  health: Health;
  checks: HealthCheck[];
}
