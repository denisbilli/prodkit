export class Service3Api {
  name = 'service3Api'

  async authenticate(credentials: { apiKey: string }, request: Request) {
    request.headers.set('Authorization', `Bearer ${credentials.apiKey}`)
    return request
  }
}
