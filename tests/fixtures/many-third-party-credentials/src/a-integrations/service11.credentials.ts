export class Service11Api {
  name = 'service11Api'

  async authenticate(credentials: { apiKey: string }, request: Request) {
    request.headers.set('Authorization', `Bearer ${credentials.apiKey}`)
    return request
  }
}
