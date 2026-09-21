export class Service2Api {
  name = 'service2Api'

  async authenticate(credentials: { apiKey: string }, request: Request) {
    request.headers.set('Authorization', `Bearer ${credentials.apiKey}`)
    return request
  }
}
