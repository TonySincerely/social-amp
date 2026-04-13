export const config = {
  // Protect all routes except /login, /api/*, and static assets
  matcher: ['/((?!login|api|assets|.*\\..*).*)', '/'],
}

export default function middleware(request) {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(/(?:^|;\s*)sa-auth=([^;]*)/)
  const token = match ? decodeURIComponent(match[1]) : null

  if (token === process.env.AUTH_SECRET) return // authenticated — pass through

  const url = new URL(request.url)
  const loginUrl = new URL('/login', request.url)
  if (url.pathname !== '/login') {
    loginUrl.searchParams.set('from', url.pathname)
  }
  return Response.redirect(loginUrl, 302)
}
