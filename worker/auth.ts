/**
 * 관리자 인증.
 * 1) Cloudflare Access: Cf-Access-Jwt-Assertion 의 서명·issuer·audience·만료를 JWKS 로 검증한다. 헤더 존재만 믿지 않는다.
 * 2) ADMIN_API_TOKEN: 로컬 CLI(게시 스크립트)용 Bearer 토큰. 상수 시간 비교.
 * 3) 로컬 개발 우회: APP_ENV=development 이고 DEV_ADMIN_BYPASS=1 일 때만. 배포 환경에서는 무시된다.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from './env'
import { isDeployed } from './env'

export interface AdminIdentity {
  actor: string
  method: 'cf_access' | 'api_token' | 'dev_bypass'
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export async function authenticateAdmin(req: Request, env: Env): Promise<AdminIdentity | null> {
  // 1) Cloudflare Access
  const assertion = req.headers.get('Cf-Access-Jwt-Assertion')
  if (assertion && env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD) {
    try {
      const issuer = env.CF_ACCESS_TEAM_DOMAIN.replace(/\/$/, '')
      let jwks = jwksCache.get(issuer)
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
        jwksCache.set(issuer, jwks)
      }
      const { payload } = await jwtVerify(assertion, jwks, { issuer, audience: env.CF_ACCESS_AUD })
      const email = typeof payload.email === 'string' ? payload.email : typeof payload.sub === 'string' ? payload.sub : 'access-user'
      return { actor: email, method: 'cf_access' }
    } catch {
      return null // 서명·만료·audience 실패는 거부
    }
  }
  // 2) API 토큰
  const auth = req.headers.get('Authorization')
  if (auth && auth.startsWith('Bearer ') && env.ADMIN_API_TOKEN && env.ADMIN_API_TOKEN.length >= 24) {
    const token = auth.slice(7).trim()
    if (timingSafeEqual(token, env.ADMIN_API_TOKEN)) return { actor: 'api-token', method: 'api_token' }
    return null
  }
  // 3) 로컬 개발 우회 (배포 환경 비활성)
  if (!isDeployed(env) && env.APP_ENV === 'development' && env.DEV_ADMIN_BYPASS === '1') {
    return { actor: 'dev-local', method: 'dev_bypass' }
  }
  return null
}

/** 관리자 변경 요청의 Origin/CSRF 확인: 같은 출처 또는 Origin 없는 CLI 요청(Bearer) 만 허용. */
export function originAllowed(req: Request, identity: AdminIdentity): boolean {
  const origin = req.headers.get('Origin')
  if (!origin) return identity.method === 'api_token' || identity.method === 'dev_bypass' || req.headers.get('Sec-Fetch-Site') === 'same-origin'
  const self = new URL(req.url).origin
  return origin === self
}
