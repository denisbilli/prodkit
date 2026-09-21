export class Service7Api {
  name = 'service7Api'

  async authenticate(credentials: { apiKey: string }, request: Request) {
    request.headers.set('Authorization', `Bearer ${credentials.apiKey}`)
    return request
  }
}
