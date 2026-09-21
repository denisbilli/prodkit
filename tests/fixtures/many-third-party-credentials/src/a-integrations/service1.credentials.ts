export class Service1Api {
  name = 'service1Api'

  async authenticate(credentials: { apiKey: string }, request: Request) {
    request.headers.set('Authorization', `Bearer ${credentials.apiKey}`)
    return request
  }
}
