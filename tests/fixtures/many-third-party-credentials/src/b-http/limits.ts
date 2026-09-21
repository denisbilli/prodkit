import { rateLimit } from 'express-rate-limit'

export function keyedLimiter(options: { limit: number; windowMs: number; field: string }) {
  return rateLimit({ limit: options.limit, windowMs: options.windowMs })
}
