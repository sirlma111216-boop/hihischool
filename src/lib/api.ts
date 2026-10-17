import type { ApiResult } from '@shared/types'

export class ApiError extends Error {
  code: string
  status: number
  details: unknown
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

/** 관리자 토큰(세션 저장소). 배포 환경에서 Access 없이 관리 화면을 열 때 Bearer 로 보낸다. 서버로만 보내고 로그·URL 에 넣지 않는다. */
export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem('atlas.adminToken')
  } catch {
    return null
  }
}
export function setAdminToken(t: string | null) {
  try {
    if (t) sessionStorage.setItem('atlas.adminToken', t)
    else sessionStorage.removeItem('atlas.adminToken')
  } catch {
    /* ignore */
  }
}
function authHeaders(path: string): Record<string, string> {
  const t = path.startsWith('/api/admin') ? getAdminToken() : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function handle<T>(res: Response): Promise<T> {
  let body: ApiResult<T> | null = null
  try {
    body = (await res.json()) as ApiResult<T>
  } catch {
    throw new ApiError('bad_response', `서버 응답을 읽을 수 없습니다 (${res.status}).`, res.status)
  }
  if (!body || !('ok' in body)) throw new ApiError('bad_response', '서버 응답 형식이 올바르지 않습니다.', res.status)
  if (!body.ok) throw new ApiError(body.error.code, body.error.message, res.status, body.error.details)
  return body.data
}

export async function apiGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...authHeaders(path), ...(init.headers ?? {}) } })
  return handle<T>(res)
}

export async function apiPost<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { method: 'POST', ...init, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(path), ...(init.headers ?? {}) }, body: JSON.stringify(body) })
  return handle<T>(res)
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ''
}
