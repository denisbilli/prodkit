import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { CustomThrottlerGuard } from '../guards/custom-throttler.guard'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  // Nine lines of construction sit between the controller and the guard below,
  // which is the distance ghostfolio's own auth controller has — one past the window
  // that reads a route's own options.

  @Post('anonymous')
  @UseGuards(CustomThrottlerGuard)
  public async anonymous(@Body() body: { accessToken: string }) {
    return this.authService.validateAnonymousLogin(body.accessToken)
  }
}
