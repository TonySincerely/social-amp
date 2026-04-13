export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'sa-auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax')
  res.redirect(302, '/login')
}
