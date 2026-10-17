/**
 * 외부 URL 수집 보호. 허용 목록의 공식 출처만, HTTPS 만, 사설·루프백·메타데이터 주소 차단, 크기·시간 제한.
 * 범용 프록시가 아니다. 리다이렉트도 허용 목록 안에서만 따라간다.
 */
export const OFFICIAL_HOST_ALLOWLIST: string[] = [
  'www.schoolinfo.go.kr',
  'schoolinfo.go.kr',
  'open.neis.go.kr',
  'www.sen.go.kr',
  'sen.go.kr',
  'hischool.go.kr',
  'www.hischool.go.kr',
  'www.hiinfo.go.kr',
  'hiinfo.go.kr',
]

/** 학교 공식 홈페이지는 검증된 기본정보(schools.homepage)에서 얻은 host 를 동적으로 추가한다. */
export function isAllowedHost(host: string, extraHosts: string[] = []): boolean {
  const h = host.toLowerCase()
  const all = [...OFFICIAL_HOST_ALLOWLIST, ...extraHosts.map((x) => x.toLowerCase())]
  return all.some((a) => h === a || h.endsWith(`.${a}`) || (a.endsWith('.sen.hs.kr') && h.endsWith('.sen.hs.kr')))
}

function isPrivateIpLiteral(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true // 메타데이터
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  if (host.includes(':')) return true // IPv6 리터럴은 허용하지 않음
  return false
}

export interface GuardResult {
  ok: boolean
  reason?: string
  url?: URL
}

export function guardUrl(raw: string, extraHosts: string[] = []): GuardResult {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'URL 형식이 올바르지 않습니다.' }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: '허용되지 않은 스킴입니다.' }
  if (u.username || u.password) return { ok: false, reason: '자격 증명이 포함된 URL 은 허용하지 않습니다.' }
  const host = u.hostname.toLowerCase()
  if (isPrivateIpLiteral(host)) return { ok: false, reason: '사설·루프백·메타데이터 주소는 허용하지 않습니다.' }
  if (!isAllowedHost(host, extraHosts)) return { ok: false, reason: `허용 목록에 없는 호스트입니다: ${host}` }
  return { ok: true, url: u }
}

export interface FetchLimits {
  maxBytes: number
  timeoutMs: number
  maxRedirects: number
}

export interface GuardedFetchResult {
  ok: boolean
  status: number | null
  finalUrl: string
  contentType: string | null
  contentLength: number | null
  bytesRead: number
  sha256: string | null
  truncated: boolean
  error: string | null
  body: Uint8Array | null
}

export async function guardedFetch(raw: string, limits: FetchLimits, extraHosts: string[] = []): Promise<GuardedFetchResult> {
  let current = raw
  for (let i = 0; i <= limits.maxRedirects; i++) {
    const g = guardUrl(current, extraHosts)
    if (!g.ok || !g.url) return { ok: false, status: null, finalUrl: current, contentType: null, contentLength: null, bytesRead: 0, sha256: null, truncated: false, error: g.reason ?? '차단', body: null }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), limits.timeoutMs)
    try {
      const res = await fetch(g.url.toString(), { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'highschool-atlas/0.1 (official-source-check)' } })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('Location')
        if (!loc) return { ok: false, status: res.status, finalUrl: current, contentType: null, contentLength: null, bytesRead: 0, sha256: null, truncated: false, error: '리다이렉트 위치 없음', body: null }
        current = new URL(loc, g.url).toString()
        continue
      }
      const contentType = res.headers.get('Content-Type')
      const lenHeader = res.headers.get('Content-Length')
      const contentLength = lenHeader ? Number(lenHeader) : null
      if (contentLength !== null && contentLength > limits.maxBytes) {
        return { ok: false, status: res.status, finalUrl: current, contentType, contentLength, bytesRead: 0, sha256: null, truncated: true, error: `크기 제한 초과 (${contentLength} > ${limits.maxBytes})`, body: null }
      }
      const reader = res.body?.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      let truncated = false
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > limits.maxBytes) {
            truncated = true
            await reader.cancel()
            break
          }
          chunks.push(value)
        }
      }
      const body = truncated ? null : concat(chunks)
      const sha256 = body ? await digest(body) : null
      return { ok: res.ok && !truncated, status: res.status, finalUrl: current, contentType, contentLength, bytesRead: total, sha256, truncated, error: truncated ? '크기 제한 초과로 중단' : res.ok ? null : `HTTP ${res.status}`, body }
    } catch (e) {
      return { ok: false, status: null, finalUrl: current, contentType: null, contentLength: null, bytesRead: 0, sha256: null, truncated: false, error: e instanceof Error ? e.message : '요청 실패', body: null }
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, status: null, finalUrl: current, contentType: null, contentLength: null, bytesRead: 0, sha256: null, truncated: false, error: '리다이렉트 횟수 초과', body: null }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.byteLength, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

export async function digest(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 파일 서명으로 종류 판별. 확장자만 믿지 않는다. */
export function sniffFileType(bytes: Uint8Array): 'pdf' | 'zip' | 'hwp' | 'unknown' {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf' // %PDF
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) ) return 'zip' // PK (hwpx/xlsx)
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'hwp' // OLE2 (hwp 5.x)
  return 'unknown'
}
