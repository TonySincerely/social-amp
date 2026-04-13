export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body || {}

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' })
  }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `sa-auth=${process.env.AUTH_SECRET}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`)
  res.status(200).json({ ok: true })
}
