import { Post } from './registry'
import { keyedLimiter } from './limits'

export class AuthController {
  @Post('/login', {
    ipRateLimit: { limit: 1000, windowMs: 5 * 60 * 1000 },
    keyedRateLimit: keyedLimiter({ limit: 5, windowMs: 60 * 1000, field: 'email' }),
  })
  async login(req: LoginRequest) {
    return this.users.verify(req.body.email, req.body.password)
  }
}
