/**
 * 초안 일괄 승인·공개. 사용자(사람) 지시로 실행하며 검토자 이름을 반드시 받는다.
 * npx tsx scripts/db/publish-drafts.ts --api https://... --reviewer "이름" [--dry]
 * - publishChecks 오류가 있는 버전은 건너뛰고 사유를 출력한다 (초안 유지).
 * - 가상 자료(isSynthetic)는 건드리지 않는다. 토큰은 .dev.vars 의 ADMIN_API_TOKEN 을 읽고 출력하지 않는다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const dry = process.argv.includes('--dry')
const api = arg('api', 'http://localhost:5174')!
const reviewer = arg('reviewer')
if (!reviewer || /^(ai|claude|gpt|llm|bot|자동)$/i.test(reviewer)) { console.error('--reviewer 에 사람 이름이 필요합니다.'); process.exit(2) }
const root = path.resolve(import.meta.dirname, '../..')
const vars = readFileSync(path.join(root, '.dev.vars'), 'utf8')
const token = vars.match(/^ADMIN_API_TOKEN=(.+)$/m)?.[1]?.trim()
if (!token) { console.error('.dev.vars 에 ADMIN_API_TOKEN 이 없습니다.'); process.exit(2) }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

interface V { id: string; schoolId: string; schoolName?: string; cohortYear: number; trackId: string | null; status: string; reviewStatus: string; isSynthetic: boolean; createdAt: string }
async function j<T>(r: Response): Promise<T> { const b = (await r.json()) as { ok: boolean; data?: T; error?: { message: string; details?: unknown } }; if (!b.ok) throw new Error(`${b.error?.message} ${JSON.stringify(b.error?.details ?? '')}`); return b.data as T }

async function main() {
  const versions = await j<V[]>(await fetch(`${api}/api/admin/versions`, { headers: H }))
  const drafts = versions.filter((v) => v.status === 'draft' && !v.isSynthetic)
  // 같은 학교·입학연도·과정에 초안이 여럿이면 가장 최근 것만 공개한다
  const latest = new Map<string, V>()
  for (const v of drafts) { const k = `${v.schoolId}|${v.cohortYear}|${v.trackId ?? ''}`; const cur = latest.get(k); if (!cur || v.createdAt > cur.createdAt) latest.set(k, v) }
  const summary = { published: [] as string[], blocked: [] as string[], skippedOlder: drafts.length - latest.size }
  for (const v of latest.values()) {
    const label = `${v.schoolName ?? v.schoolId} ${v.cohortYear}${v.trackId ? ` (${v.trackId})` : ''}`
    const { checks } = await j<{ checks: { level: string; message: string }[] }>(await fetch(`${api}/api/admin/versions/${encodeURIComponent(v.id)}`, { headers: H }))
    const errors = checks.filter((c) => c.level === 'error')
    if (errors.length > 0) { summary.blocked.push(`${label}: ${errors.map((e) => e.message).join('; ')}`); console.log(`✗ ${label}: ${errors.map((e) => e.message).join('; ')}`); continue }
    if (dry) { console.log(`· ${label}: 공개 가능`); summary.published.push(label); continue }
    await j(await fetch(`${api}/api/admin/review`, { method: 'POST', headers: H, body: JSON.stringify({ versionId: v.id, reviewStatus: 'approved', reviewer, note: '사용자 지시로 일괄 승인(2026-10-17): 공식 문서에서 자동 추출한 편제표. 세부 수치는 원문 재확인 권장.' }) }))
    await j(await fetch(`${api}/api/admin/publish`, { method: 'POST', headers: H, body: JSON.stringify({ versionId: v.id }) }))
    summary.published.push(label)
    console.log(`✓ ${label}: 공개`)
  }
  console.log(`→ 공개 ${summary.published.length} / 오류로 보류 ${summary.blocked.length} / 더 오래된 중복 초안 건너뜀 ${summary.skippedOlder}`)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
