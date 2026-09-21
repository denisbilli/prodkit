import { Post, RestController } from './registry'
import { keyedLimiter } from './limits'

@RestController('/auth')
export class AuthController {
  @Post('/login', {
    skipAuth: true,
    // Two layered limits: generous per address, aggressive per email.
    ipRateLimit: {
      limit: 1000,
      windowMs: 5 * 60 * 1000,
    },
    keyedRateLimit: keyedLimiter({ limit: 5, windowMs: 60 * 1000, field: 'email' }),
  })
  async login(req: LoginRequest) {
    return this.authService.authenticate(req.body.email, req.body.password)
  }
}
