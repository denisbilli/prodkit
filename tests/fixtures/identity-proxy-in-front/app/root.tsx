import { parse } from 'cookie'

export async function loader({ request }: { request: Request }) {
  const cookies = parse(request.headers.get('Cookie') ?? '')
  const token = cookies.CF_Authorization
  if (!token) return new Response(null, { status: 302, headers: { Location: '/' } })
  const [, payload] = token.split('.')
  const claims = JSON.parse(atob(payload))
  return { email: claims.email, expires: claims.exp }
}
