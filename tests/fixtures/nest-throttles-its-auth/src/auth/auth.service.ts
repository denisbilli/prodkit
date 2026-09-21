import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'

@Injectable()
export class AuthService {
  public async validateAnonymousLogin(accessToken: string) {
    return bcrypt.compare(accessToken, process.env.HASH ?? '')
  }
}
