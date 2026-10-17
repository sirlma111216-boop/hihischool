import { Hono } from 'hono'
import type { Env } from './env'
import { publicRoutes } from './routes/public'
import { adminRoutes } from './routes/admin'

const app = new Hono<{ Bindings: Env }>()

// 보안 헤더. 키·내부 정보는 응답에 넣지 않는다.
app.use('*', async (c, next) => {
  await next()
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()')
  if (c.req.path.startsWith('/api/')) c.res.headers.set('Cache-Control', c.req.method === 'GET' && !c.req.path.startsWith('/api/admin') ? 'public, max-age=60' : 'no-store')
})

app.route('/api', publicRoutes)
app.route('/api/admin', adminRoutes)

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ ok: false, error: { code: 'not_found', message: '없는 API 경로입니다.' } }, 404)
  // 정적 자산·SPA 는 Workers Static Assets 가 처리한다 (run_worker_first 는 /api/* 만).
  return c.env.ASSETS.fetch(c.req.raw)
})

app.onError((err, c) => {
  console.error('worker error', c.req.path, err instanceof Error ? err.message : String(err))
  return c.json({ ok: false, error: { code: 'internal', message: '서버 오류가 발생했습니다.' } }, 500)
})

export default app satisfies ExportedHandler<Env>
